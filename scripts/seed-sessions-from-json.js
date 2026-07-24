// scripts/seed-sessions-from-json.js
// Phase 1 verification seed: loads the repo's sessions.json (and the semester
// block of unified_courses.json) into Neon. The production ingest lives in the
// scraper repo and runs in a single transaction; this dev script is sequential,
// so do not point it at a database serving live traffic mid-run.
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const CHUNK_SIZE = 500;

async function main() {
  const url = process.env.NEON_SCRAPER_URL;
  if (!url) throw new Error('Set NEON_SCRAPER_URL (scraper_rw connection string)');
  const sql = neon(url);

  const root = path.resolve(__dirname, '..');
  const unified = JSON.parse(fs.readFileSync(path.join(root, 'unified_courses.json'), 'utf-8'));
  const sessions = JSON.parse(fs.readFileSync(path.join(root, 'sessions.json'), 'utf-8'));
  const sem = unified.semester;
  console.log(`Seeding ${sessions.length} sessions for semester ${sem.code} (${sem.label})`);

  await sql`
    INSERT INTO semesters (code, label, name_et, name_en, start_date, end_date,
                           week1_monday, is_active, scraping_datetime)
    VALUES (${sem.code}, ${sem.label}, ${sem.name_et}, ${sem.name_en},
            ${sem.start_date}, ${sem.end_date}, ${sem.week1_monday}, true,
            ${unified.scraping_datetime})
    ON CONFLICT (code) DO UPDATE SET
      label = EXCLUDED.label, name_et = EXCLUDED.name_et, name_en = EXCLUDED.name_en,
      start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
      week1_monday = EXCLUDED.week1_monday, is_active = true,
      scraping_datetime = EXCLUDED.scraping_datetime
  `;
  await sql`UPDATE semesters SET is_active = false WHERE code <> ${sem.code}`;
  await sql`DELETE FROM sessions WHERE semester_code = ${sem.code}`;

  for (let i = 0; i < sessions.length; i += CHUNK_SIZE) {
    const chunk = sessions.slice(i, i + CHUNK_SIZE);
    await sql`
      INSERT INTO sessions (semester_code, course_id, date, start_time, end_time,
                            type, room, weeks, comment, is_veebiope, instructor, groups)
      SELECT ${sem.code},
             r.course_id,
             to_date(NULLIF(r.date, ''), 'DD.MM.YYYY'),
             NULLIF(r."start", '')::time,
             NULLIF(r."end", '')::time,
             r.type, r.room, r.weeks, r.comment, r.is_veebiope, r.instructor, r.groups
      FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS r(
        course_id text, date text, "start" text, "end" text, type text, room text,
        weeks text, comment text, is_veebiope boolean, instructor jsonb, groups jsonb
      )
    `;
    process.stdout.write(`\r  inserted ${Math.min(i + CHUNK_SIZE, sessions.length)}/${sessions.length}`);
  }

  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM sessions WHERE semester_code = ${sem.code}
  `;
  console.log(`\nDone. Rows in DB: ${count}; rows in source: ${sessions.length}`);
  if (count !== sessions.length) {
    console.error('ROW COUNT MISMATCH');
    process.exitCode = 1;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
