const { neon } = require('@neondatabase/serverless');

const SESSION_LIMIT = parseInt(process.env.CALENDAR_SESSION_LIMIT, 10) || 4000;
const SEMESTER_CACHE_MS = 5 * 60 * 1000;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
};

// A versioned 200 whose body is the session array is content-addressed: the URL
// names a hash of the source artifacts, so those bytes can never change.
const IMMUTABLE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=31536000, immutable',
};

// limit_exceeded does NOT get that policy. Its content depends on
// CALENDAR_SESSION_LIMIT, an environment variable that can change without the
// dataset version changing, so it is not content-addressed.
const LIMIT_ENVELOPE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
};

const NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const DATASET_VERSION_PATTERN = /^[0-9a-f]{64}$/;

let cachedSql = null;
function getSql() {
  if (!cachedSql) {
    cachedSql = neon(process.env.NEON_DATABASE_URL);
  }
  return cachedSql;
}

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
    return { statusCode: 409, headers: NO_STORE_HEADERS,
      body: JSON.stringify({ error: 'version_changed' }) };
  }
  const count = Number(counted.count) || 0;
  if (count > SESSION_LIMIT) {
    return { statusCode: 200, headers: LIMIT_ENVELOPE_HEADERS,
      body: JSON.stringify({ error: 'limit_exceeded', count, limit: SESSION_LIMIT }) };
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
    return { statusCode: 409, headers: NO_STORE_HEADERS,
      body: JSON.stringify({ error: 'version_changed' }) };
  }
  return { statusCode: 200, headers: IMMUTABLE_HEADERS,
    body: JSON.stringify(envelope.sessions || []) };
}

async function handleRequest(event, sql) {
  const query = event.queryStringParameters || {};
  const coursesParam = query.courses;
  const version = query.version;

  // Missing version keeps the existing behaviour, so the frontend deployed
  // today stays compatible through the rollout.
  if (version !== undefined) {
    if (typeof version !== 'string' || !DATASET_VERSION_PATTERN.test(version)) {
      return { statusCode: 400, headers: NO_STORE_HEADERS,
        body: JSON.stringify({ error: 'bad_request' }) };
    }
  }

  if (!coursesParam) {
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify([]) };
  }
  const courseIds = coursesParam.split(',').map((s) => s.trim()).filter(Boolean);

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
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'limit_exceeded', count, limit: SESSION_LIMIT }),
      };
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

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('getTimetable query failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Error processing timetable data.' }) };
  }
}

exports.handler = async (event) => {
  let sql;
  try {
    sql = getSql();
  } catch (error) {
    console.error('getTimetable configuration error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Error processing timetable data.' }) };
  }
  return handleRequest(event, sql);
};
exports.handleRequest = handleRequest;
exports._resetSemesterCache = () => { semesterCache = { code: null, expiresAt: 0 }; };
