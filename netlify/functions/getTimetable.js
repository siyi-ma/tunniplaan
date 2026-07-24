const { neon } = require('@neondatabase/serverless');

const SESSION_LIMIT = parseInt(process.env.CALENDAR_SESSION_LIMIT, 10) || 4000;
const SEMESTER_CACHE_MS = 5 * 60 * 1000;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
};

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

async function handleRequest(event, sql) {
  const coursesParam = event.queryStringParameters && event.queryStringParameters.courses;
  if (!coursesParam) {
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify([]) };
  }
  const courseIds = coursesParam.split(',').map((s) => s.trim()).filter(Boolean);

  try {
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
