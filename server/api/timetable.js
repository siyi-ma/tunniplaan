// GET getTimetable?courses=ID1,ID2[&version=<sha256>]
//
// Sessions for the requested courses. Shared by the Netlify function and the
// ChatGPT Sites worker; the adapters decide who is allowed to call it.
//
// The session cap is read per call. On Netlify that is CALENDAR_SESSION_LIMIT
// from the process environment (default 4000). On Sites the worker passes the
// value from that request's env, because a Site has no process.env and a
// secret can change without the isolate restarting.

const SEMESTER_CACHE_MS = 5 * 60 * 1000;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
};

const {
  IMMUTABLE_HEADERS,
  isDatasetVersion,
  jsonResponse,
} = require('../../netlify/functions/lib/dataset.js');

// limit_exceeded does NOT get the immutable policy. Its content depends on
// the session cap, which can change without the dataset version changing, so
// it is not content-addressed.
const LIMIT_ENVELOPE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
};

function sessionLimit(options) {
  if (options && Object.prototype.hasOwnProperty.call(options, 'sessionLimit')) {
    const parsed = Number(options.sessionLimit);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 4000;
  }
  const raw = typeof process !== 'undefined' && process.env
    ? process.env.CALENDAR_SESSION_LIMIT
    : undefined;
  const parsed = parseInt(raw, 10);
  // `|| 4000` is the historical Netlify behaviour: 0, NaN and unset all mean
  // the default. A positive integer is taken as written.
  return parsed || 4000;
}

// Cached with a TTL so a semester flip at ingest reaches warm isolates within
// minutes. Versioned requests do not use this cache.
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
// request served from a five-minute warm cache could answer for a semester
// that is no longer active, under a version the client trusts.
async function handleVersionedRequest(sql, courseIds, version, limit) {
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
  if (count > limit) {
    return jsonResponse(200, { error: 'limit_exceeded', count, limit },
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

async function handleRequest(event, sql, options) {
  const query = event.queryStringParameters || {};
  const coursesParam = query.courses;
  const version = query.version;
  const limit = sessionLimit(options);

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
      return await handleVersionedRequest(sql, courseIds, version, limit);
    }
    const semesterCode = await getActiveSemesterCode(sql);

    const [{ count }] = await sql`
      SELECT count(*)::int AS count
      FROM sessions
      WHERE semester_code = ${semesterCode} AND course_id = ANY(${courseIds})
    `;

    if (count > limit) {
      return jsonResponse(200, { error: 'limit_exceeded', count, limit },
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

exports.handleRequest = handleRequest;
exports._resetSemesterCache = () => { semesterCache = { code: null, expiresAt: 0 }; };
