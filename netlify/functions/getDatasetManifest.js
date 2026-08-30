// GET /.netlify/functions/getDatasetManifest
//
// The small, uncached document every page load starts from. It names the
// dataset version that the browser then pins its course-page and calendar
// requests to, so that one load can never mix two datasets.
//
// Contract: specification section 9.1.

const {
  PAGE_SIZE,
  NO_STORE_HEADERS,
  GroupMapConflict,
  getSql,
  jsonResponse,
  isDatasetVersion,
  toCount,
  totalPages,
  toIsoDate,
  foldGroupMap,
} = require('./lib/dataset.js');

async function handleRequest(event, sql) {
  try {
    // One statement, one snapshot. Separate reads for the semester, the course
    // count and the group map could straddle an ingest commit and return a
    // manifest describing two different datasets.
    const rows = await sql`
      WITH active AS (
        SELECT code, label, name_et, name_en,
               to_char(start_date, 'YYYY-MM-DD')   AS start_date,
               to_char(end_date, 'YYYY-MM-DD')     AS end_date,
               to_char(week1_monday, 'YYYY-MM-DD') AS week1_monday,
               scraping_datetime, dataset_version
        FROM semesters
        WHERE is_active = true
        LIMIT 1
      )
      SELECT a.code, a.label, a.name_et, a.name_en,
             a.start_date, a.end_date, a.week1_monday,
             a.scraping_datetime, a.dataset_version,
             (SELECT count(*)::int FROM courses c WHERE c.semester_code = a.code)
               AS course_count,
             COALESCE(
               (SELECT jsonb_agg(jsonb_build_array(g.code, g.faculty_code) ORDER BY g.code)
                  FROM groups g WHERE g.semester_code = a.code),
               '[]'::jsonb
             ) AS groups
      FROM active a
    `;

    const row = rows[0];
    // No active semester, or one that predates Phase 2 and carries no version.
    // Serving a null version would let a client pin itself to "null" forever.
    if (!row || !isDatasetVersion(row.dataset_version)) {
      return jsonResponse(503, { error: 'dataset_unavailable' });
    }

    const courseCount = toCount(row.course_count);
    return jsonResponse(200, {
      dataset_version: row.dataset_version,
      scraping_datetime: row.scraping_datetime,
      semester: {
        label: row.label,
        code: row.code,
        name_et: row.name_et,
        name_en: row.name_en,
        start_date: toIsoDate(row.start_date),
        end_date: toIsoDate(row.end_date),
        week1_monday: toIsoDate(row.week1_monday),
      },
      groupToFacultyMap: foldGroupMap(row.groups),
      course_count: courseCount,
      page_size: PAGE_SIZE,
      total_pages: totalPages(courseCount),
    });
  } catch (error) {
    if (error instanceof GroupMapConflict) {
      console.error('getDatasetManifest: groups invariant violated:', error.message);
    } else {
      console.error('getDatasetManifest query failed:', error);
    }
    return jsonResponse(500, { error: 'manifest_unavailable' });
  }
}

exports.handler = async (event) => {
  let sql;
  try {
    sql = getSql();
  } catch (error) {
    console.error('getDatasetManifest configuration error:', error);
    return jsonResponse(500, { error: 'manifest_unavailable' });
  }
  return handleRequest(event, sql);
};
exports.handleRequest = handleRequest;
exports.PAGE_SIZE = PAGE_SIZE;
exports.NO_STORE_HEADERS = NO_STORE_HEADERS;
