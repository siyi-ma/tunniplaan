// GET /.netlify/functions/getCourses?version=<sha256>&page=<zero-based>
//
// One bounded, content-addressed page of the course dataset. The URL names a
// SHA-256 of the source artifacts and page boundaries are deterministic, so the
// bytes behind a given URL can never change -- which is what lets a 200 be
// cached immutably for a year.
//
// Contract: specification section 9.2.

const {
  PAGE_SIZE,
  IMMUTABLE_HEADERS,
  getSql,
  jsonResponse,
  isDatasetVersion,
  toCount,
  totalPages,
} = require('./lib/dataset.js');
const { withHumanGate } = require('./lib/humanVerification.js');

// A page index is a non-negative integer with no leading '+', no decimal point
// and no exponent: '1.5', '1e2' and ' 1' are all malformed, not rounded.
const PAGE_PATTERN = /^(0|[1-9][0-9]*)$/;

// The regex accepts digit strings of any length, so page * PAGE_SIZE could
// exceed int8 or become Infinity and make Postgres reject the bind parameter --
// a 500 for what is simply an out-of-range page. No dataset will ever hold 2^53
// courses, so anything beyond this is out of range by definition and is answered
// without a database round trip.
const MAX_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE);

function parseRequest(event) {
  const query = (event && event.queryStringParameters) || {};
  const version = query.version;
  const page = query.page;
  if (!isDatasetVersion(version)) return null;
  if (typeof page !== 'string' || !PAGE_PATTERN.test(page)) return null;
  return { version, page: Number(page) };
}

// The stored column is one JSONB value; the source shape -- and therefore what
// main.js reads -- is two separate top-level fields.
function toCourse(stored) {
  const programmes = stored.study_programmes || {};
  const course = {
    id: stored.id,
    name_et: stored.name_et,
    name_en: stored.name_en,
    eap: stored.eap === null || stored.eap === undefined ? null : Number(stored.eap),
    assessment_form_et: stored.assessment_form_et,
    keel_et: stored.keel_et,
    keel_en: stored.keel_en,
    school_code: stored.school_code,
    school_name: stored.school_name,
    school_name_en: stored.school_name_en,
    institute_code: stored.institute_code,
    institute_name: stored.institute_name,
    institute_name_en: stored.institute_name_en,
    course_card_link: stored.course_card_link,
    timetable_link: stored.timetable_link,
    objectives_et: stored.objectives_et,
    objectives_en: stored.objectives_en,
    learning_outcomes_et: stored.learning_outcomes_et,
    learning_outcomes_en: stored.learning_outcomes_en,
    description_short_et: stored.description_short_et,
    description_short_en: stored.description_short_en,
    groups: stored.groups,
    group_sessions: stored.group_sessions,
    study_programmes_et: programmes.et === undefined ? null : programmes.et,
    study_programmes_en: programmes.en === undefined ? null : programmes.en,
  };
  return course;
}

async function handleRequest(event, sql) {
  const request = parseRequest(event);
  if (!request) {
    // Rejected before touching the database: a malformed request is not the
    // database's problem, and it must not cost a connection.
    return jsonResponse(400, { error: 'bad_request' });
  }
  const { version, page } = request;
  if (page > MAX_PAGE) {
    return jsonResponse(404, { error: 'page_not_found' });
  }
  const offset = page * PAGE_SIZE;

  try {
    // One statement. The active-semester predicate INCLUDES the requested
    // version, so the version check, the total count and the page all come from
    // the same snapshot. "Check the version, then query by the semester code we
    // remembered" is forbidden: an ingest could commit between those two
    // statements and relabel the new rows with the old version.
    const rows = await sql`
      WITH active AS (
        SELECT code, dataset_version
        FROM semesters
        WHERE is_active = true AND dataset_version = ${version}
      ),
      counted AS (
        SELECT a.code, a.dataset_version,
               (SELECT count(*)::int FROM courses c WHERE c.semester_code = a.code)
                 AS course_count
        FROM active a
      )
      SELECT n.dataset_version, n.course_count,
             to_jsonb(page_course) - 'semester_code' AS course
      FROM counted n
      LEFT JOIN LATERAL (
        SELECT * FROM courses c
        WHERE c.semester_code = n.code
        ORDER BY c.id
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      ) AS page_course ON true
    `;

    // No rows at all: nothing active carries this version any more.
    if (rows.length === 0) {
      return jsonResponse(409, { error: 'version_changed' });
    }

    const courseCount = toCount(rows[0].course_count);
    const pages = totalPages(courseCount);
    // The LEFT JOIN yields one row with a null course when the offset is past
    // the end, which is exactly the out-of-range case.
    if (page >= pages) {
      return jsonResponse(404, { error: 'page_not_found' });
    }

    return jsonResponse(200, {
      dataset_version: rows[0].dataset_version,
      page,
      page_size: PAGE_SIZE,
      total_pages: pages,
      courses: rows.filter((row) => row.course).map((row) => toCourse(row.course)),
    }, IMMUTABLE_HEADERS);
  } catch (error) {
    console.error('getCourses query failed:', error);
    return jsonResponse(500, { error: 'courses_unavailable' });
  }
}

// withHumanGate also rewrites the IMMUTABLE_HEADERS below from `public` to
// `private`. A gated page must not be shared-cacheable: Netlify's CDN keys on
// the URL and not on the cookie, so one verified visitor would otherwise warm a
// cache that answers everyone. The year-long browser cache is unaffected.
exports.handler = async (event) => withHumanGate(event, async () => {
  let sql;
  try {
    sql = getSql();
  } catch (error) {
    console.error('getCourses configuration error:', error);
    return jsonResponse(500, { error: 'courses_unavailable' });
  }
  return handleRequest(event, sql);
});
exports.handleRequest = handleRequest;
exports.toCourse = toCourse;
