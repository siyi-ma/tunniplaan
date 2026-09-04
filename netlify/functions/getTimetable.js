const SESSION_LIMIT = parseInt(process.env.CALENDAR_SESSION_LIMIT, 10) || 4000;
const SEMESTER_CACHE_MS = 5 * 60 * 1000;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
};

// Shared with the other Phase 2 endpoints: the cache policies, the version
// regex, the memoised Neon client and the response builder. A second copy of
// any of them is a second place to keep in step -- this file used to carry its
// own getSql and ten hand-built response literals. lib/ is a subdirectory
// precisely so it is not itself deployed as a function.
//
// IMMUTABLE_HEADERS applies to a versioned 200 whose body is the session array:
// the URL names a hash of the source artifacts, so those bytes cannot change.
const {
  IMMUTABLE_HEADERS,
  NO_STORE_HEADERS,
  getSql,
  isDatasetVersion,
  jsonResponse,
} = require('./lib/dataset.js');
const { withHumanGate } = require('./lib/humanVerification.js');

// limit_exceeded does NOT get that policy. Its content depends on
// CALENDAR_SESSION_LIMIT, an environment variable that can change without the
// dataset version changing, so it is not content-addressed.
const LIMIT_ENVELOPE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
};

// Cached with a TTL so a semester flip at ingest reaches warm lambdas within minutes.
let semesterCache = { code: null, expiresAt: 0 };

async function getActiveSemesterCode(sql) {
  const now = Date.now();
  if (semesterCache.code && now < semesterCache.expiresAt) {
    return semesterCache.code;
  }
  const rows = await sql`SELECT code FROM semesters WHERE is_active = true LIMIT 1`;
  if (rows.length === 0) {
    throw new Error('No active semester configured');
  }
  semesterCache = { code: rows[0].code, expiresAt: now + SEMESTER_CACHE_MS };
  return semesterCache.code;
}

// Every statement resolves the active semester by the requested version itself,
// from its own snapshot. Deliberately not the cached semester code: a versioned
// request served from a five-minute warm-lambda cache could answer for a
// semester that is no longer active, under a version the client trusts.
async function handleVersionedRequest(sql, courseIds, version) {
  const [counted] = await sql`
    WITH active AS (
      SELECT code FROM semesters
      WHERE is_active = true AND dataset_version = ${version}
    )
    SELECT (SELECT count(*) FROM active) = 1 AS version_match,
           COALESCE((SELECT count(*)::int FROM sessions s
                       JOIN active a ON a.code = s.semester_code
                      WHERE s.course_id = ANY(${courseIds})), 0) AS count
  `;

  // Short-circuit: a stale version must not reach the row query at all.
  if (!counted || counted.version_match !== true) {
    return jsonResponse(409, { error: 'version_changed' });
  }
  const count = Number(counted.count) || 0;
  if (count > SESSION_LIMIT) {
    return jsonResponse(200, { error: 'limit_exceeded', count, limit: SESSION_LIMIT },
      LIMIT_ENVELOPE_HEADERS);
  }

  // One envelope row, always: version_match plus the array, even when empty. An
  // ingest committing between the two statements therefore comes back as
  // version_match false rather than as a plausible empty success.
  const [envelope] = await sql`
    WITH active AS (
      SELECT code FROM semesters
      WHERE is_active = true AND dataset_version = ${version}
    )
    SELECT (SELECT count(*) FROM active) = 1 AS version_match,
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'course_id', s.course_id,
                         'date', to_char(s.date, 'DD.MM.YYYY'),
                         'start', to_char(s.start_time, 'HH24:MI'),
                         'end', to_char(s.end_time, 'HH24:MI'),
                         'type', s.type, 'room', s.room, 'weeks', s.weeks,
                         'comment', s.comment, 'instructor', s.instructor,
                         'groups', s.groups, 'is_veebiope', s.is_veebiope))
                       FROM sessions s JOIN active a ON a.code = s.semester_code
                      WHERE s.course_id = ANY(${courseIds})), '[]'::jsonb) AS sessions
  `;
  if (!envelope || envelope.version_match !== true) {
    return jsonResponse(409, { error: 'version_changed' });
  }
  return jsonResponse(200, envelope.sessions || [], IMMUTABLE_HEADERS);
}

async function handleRequest(event, sql) {
  const query = event.queryStringParameters || {};
  const coursesParam = query.courses;
  const version = query.version;

  // Missing version keeps the existing behaviour, so the frontend deployed
  // today stays compatible through the rollout.
  if (version !== undefined) {
    if (!isDatasetVersion(version)) {
      return jsonResponse(400, { error: 'bad_request' });
    }
  } else if (!coursesParam) {
    // Legacy shortcut, unchanged. A *versioned* request with no courses does
    // not take it: the client asked for a pinned answer, so it still gets the
    // version checked rather than an unpinned empty array cached for a year.
    return jsonResponse(200, [], JSON_HEADERS);
  }
  const courseIds = (coursesParam || '').split(',').map((s) => s.trim()).filter(Boolean);

  try {
    if (version !== undefined) {
      return await handleVersionedRequest(sql, courseIds, version);
    }
    const semesterCode = await getActiveSemesterCode(sql);

    const [{ count }] = await sql`
      SELECT count(*)::int AS count
      FROM sessions
      WHERE semester_code = ${semesterCode} AND course_id = ANY(${courseIds})
    `;

    if (count > SESSION_LIMIT) {
      return jsonResponse(200, { error: 'limit_exceeded', count, limit: SESSION_LIMIT },
        JSON_HEADERS);
    }

    // Wire format contract: dotted dates, HH:MM times, exact field names --
    // defined by what main.js parses (see spec). Internal id is never selected.
    const rows = await sql`
      SELECT course_id,
             to_char(date, 'DD.MM.YYYY')    AS date,
             to_char(start_time, 'HH24:MI') AS start,
             to_char(end_time, 'HH24:MI')   AS "end",
             type, room, weeks, comment, instructor, groups, is_veebiope
      FROM sessions
      WHERE semester_code = ${semesterCode} AND course_id = ANY(${courseIds})
    `;

    return jsonResponse(200, rows, JSON_HEADERS);
  } catch (error) {
    console.error('getTimetable query failed:', error);
    return jsonResponse(500, { error: 'Error processing timetable data.' });
  }
}

// Sessions are the most expensive thing here to serve and the most valuable
// thing to scrape, so the gate matters most on this endpoint. It wraps the
// handler rather than handleRequest so the contract test, which replays the
// legacy filter against handleRequest directly, keeps testing the query and not
// the admission check.
exports.handler = async (event) => withHumanGate(event, async () => {
  let sql;
  try {
    sql = getSql();
  } catch (error) {
    console.error('getTimetable configuration error:', error);
    return jsonResponse(500, { error: 'Error processing timetable data.' });
  }
  return handleRequest(event, sql);
});
exports.handleRequest = handleRequest;
exports._resetSemesterCache = () => { semesterCache = { code: null, expiresAt: 0 }; };
