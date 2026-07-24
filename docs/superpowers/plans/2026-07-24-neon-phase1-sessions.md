# Neon Phase 1 — Sessions Table + getTimetable Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve calendar session data from Neon Postgres instead of the bundled 26 MB `sessions.json`, with a server-enforced session limit, so scrapes update the live site without a deploy and the production 502 at 280+ courses (audit finding #14) is fixed.

**Architecture:** Create the full four-table schema (`semesters`, `groups`, `courses`, `sessions`) in Neon per the approved spec; rewrite `netlify/functions/getTimetable.js` to query the `sessions` table via the `@neondatabase/serverless` HTTP driver with a count-first limit check; make the one in-scope client change (build the too-many-sessions message from the response's `count`/`limit` fields). A temporary Node seed script loads the repo's current `sessions.json` into Neon so the old-vs-new contract test runs without waiting on the scraper repo's ingest work.

**Tech Stack:** Node.js (CommonJS), `@neondatabase/serverless` (HTTP driver), Node built-in test runner (`node:test`), Netlify Functions, Neon Postgres.

**Spec:** `docs/superpowers/specs/2026-07-24-neon-schema-design.md` — read it before starting. This plan implements its "Phase 1 — sessions" scope for the tunniplaan repo only. The scraper repo's ingest (spec section "Ingest contract") is a **separate plan in the scraper repo** (`C:\Projects\scrape_taltech_tunniplaan`).

## Global Constraints

- Wire format for session rows (exact, from spec): dates `DD.MM.YYYY`, times `HH:MM` (`HH24:MI`), field names exactly `course_id`, `date`, `start`, `end`, `type`, `room`, `weeks`, `comment`, `instructor`, `groups`, `is_veebiope`. The internal `sessions.id` is never emitted.
- Success response is a **bare JSON array** (byte-compatible with today). No `courses` param → `200` with `[]`. Limit exceeded → `200` with `{"error": "limit_exceeded", "count": <n>, "limit": <limit>}`. DB failure → `500` with `{"error": "..."}`.
- Cache header on every 200: `Cache-Control: public, max-age=300, stale-while-revalidate=3600`.
- Session limit default: `4000`, overridable via env var `CALENDAR_SESSION_LIMIT`.
- Roles: `webapp_ro` (SELECT only) is the ONLY role the Netlify function may use, via env var `NEON_DATABASE_URL`. `scraper_rw` is for ingest/seed. Connection strings are secrets: `.env` locally (already gitignored), Netlify env vars in production. Never commit them.
- Module system: CommonJS (`package.json` has `"type": "commonjs"`). No new frameworks; tests use Node's built-in `node:test` + `assert`.
- All user-facing UI strings bilingual (Estonian `et` + English `en`), matching the `uiTexts` pattern in `main.js`.
- Commit messages: plain imperative, matching repo style (e.g. "Add Neon schema for timetable backend"), no `feat:`/`fix:` prefixes.
- `sessions.json` and its Netlify bundling stay in place until Task 8's production-verification gate passes — every task before that must leave the old file-based path deployable.
- The "exactly one active semester" invariant is deliberately NOT enforced with a DB constraint (spec keeps it a comment; the scraper's ingest transaction owns it). Do not add a unique index for it.

---

### Task 1: Neon project, schema, and roles

**Files:**
- Create: `db/schema.sql`
- Create: `db/roles.sql`
- Create: `scripts/run-sql.js`
- Create: `.env` (local only — never committed; `.gitignore` already covers it)

**Interfaces:**
- Produces: a Neon database containing tables `semesters`, `groups`, `courses`, `sessions` (+ index `sessions_semester_course_idx`); roles `scraper_rw` and `webapp_ro`; three connection strings in `.env` as `NEON_ADMIN_URL`, `NEON_SCRAPER_URL`, `NEON_DATABASE_URL`. Later tasks read exactly those env var names.
- Produces: `scripts/run-sql.js` usable as `node scripts/run-sql.js <file.sql> [ENV_VAR_WITH_URL]`.

- [ ] **Step 1: Create (or locate) the Neon project**

Check for an existing project first:

```bash
npx neonctl projects list
```

If `neonctl` is not authenticated (`npx neonctl auth` opens a browser) and cannot be authenticated non-interactively, this is a **user checkpoint**: ask the user to either run `npx neonctl auth`, or create a project named `tunniplaan` in the Neon console and paste the owner connection string.

If no project exists, create one. Region choice: Netlify Functions for this site run in Netlify's default AWS region `us-east-2` (unless the site's UI says otherwise under Site configuration → Functions) — match it so function→DB latency is single-digit ms:

```bash
npx neonctl projects create --name tunniplaan --region-id aws-us-east-2
```

Expected output includes a connection string like `postgresql://neondb_owner:...@ep-....aws-us-east-2.aws.neon.tech/neondb?sslmode=require`.

- [ ] **Step 2: Write `.env` with the owner connection string**

Create `.env` in the repo root (it is gitignored — verify with `git check-ignore .env` which must print `.env`):

```
NEON_ADMIN_URL=postgresql://neondb_owner:<password>@<host>/neondb?sslmode=require
```

(`NEON_SCRAPER_URL` and `NEON_DATABASE_URL` are added in Step 6.)

- [ ] **Step 3: Write `db/schema.sql`**

Copied verbatim from the spec's Schema section:

```sql
CREATE TABLE semesters (
  code          text PRIMARY KEY,          -- "26s"
  label         text NOT NULL,             -- "2026/2027 sügis"
  name_et       text,                      -- "sügis 2026"
  name_en       text,                      -- "autumn 2026"
  start_date    date,
  end_date      date,
  week1_monday  date,
  is_active     boolean NOT NULL DEFAULT false,
  scraping_datetime text                   -- as-scraped ("16.07.2026 19:48"); informational only
);
-- Exactly one row has is_active = true; the scraper sets it at ingest.

CREATE TABLE groups (
  semester_code text NOT NULL REFERENCES semesters(code),
  code          text NOT NULL,             -- "VDLR31"
  faculty_code  text NOT NULL,             -- "V"
  PRIMARY KEY (semester_code, code)
);

CREATE TABLE courses (
  semester_code   text NOT NULL REFERENCES semesters(code),
  id              text NOT NULL,           -- "DMK1021"
  name_et text, name_en text,
  eap             numeric,
  assessment_form_et text,
  keel_et text, keel_en text,
  school_code text, school_name text, school_name_en text,
  institute_code text, institute_name text, institute_name_en text,
  course_card_link text, timetable_link text,
  objectives_et text, objectives_en text,
  learning_outcomes_et text, learning_outcomes_en text,
  description_short_et text, description_short_en text,
  groups            jsonb,                 -- course's groups[] array
  group_sessions    jsonb,                 -- per-group offering (status, ainekv, instructors, keel, session_details, comments)
  study_programmes  jsonb,                 -- {et: [...], en: [...]}
  PRIMARY KEY (semester_code, id)
);

CREATE TABLE sessions (
  id            bigserial PRIMARY KEY,     -- internal only; never emitted in responses
  semester_code text NOT NULL REFERENCES semesters(code),
  course_id     text NOT NULL,             -- "ITX0020"
  date          date,                      -- NULL for online sessions
  start_time    time,                      -- NULL for online sessions
  end_time      time,
  type          text,                      -- "loeng", "harjutus", ...
  room          text,
  weeks         text,                      -- range string: "1-16", "1, 3, 5, 7, ..." (parsed client-side)
  comment       text,
  is_veebiope   boolean,
  instructor    jsonb,                     -- {name, title}
  groups        jsonb                      -- [{group, ainekv}, ...]
);

CREATE INDEX sessions_semester_course_idx ON sessions (semester_code, course_id);
```

- [ ] **Step 4: Write `db/roles.sql`**

Passwords are `{{PLACEHOLDER}}`-substituted from env by `scripts/run-sql.js` — the file itself contains no secrets:

```sql
CREATE ROLE scraper_rw LOGIN PASSWORD '{{SCRAPER_RW_PASSWORD}}';
CREATE ROLE webapp_ro LOGIN PASSWORD '{{WEBAPP_RO_PASSWORD}}';

GRANT USAGE ON SCHEMA public TO scraper_rw;
GRANT USAGE ON SCHEMA public TO webapp_ro;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE semesters, groups, courses, sessions TO scraper_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO scraper_rw;

GRANT SELECT ON TABLE semesters, groups, courses, sessions TO webapp_ro;
```

- [ ] **Step 5: Write `scripts/run-sql.js` and install the driver**

```bash
npm install @neondatabase/serverless
```

(This adds it to `"dependencies"` — required so Netlify bundles it into the function later.)

```javascript
// scripts/run-sql.js
// Executes each ;-terminated statement of a .sql file against the connection
// string in the given env var. {{NAME}} placeholders are substituted from the
// environment before execution, so .sql files never contain secrets.
// Usage: node scripts/run-sql.js <file.sql> [ENV_VAR]   (ENV_VAR defaults to NEON_ADMIN_URL)
// Limitation: statements must not contain a ';' at end-of-line mid-statement.
const fs = require('fs');
const { neon } = require('@neondatabase/serverless');

async function main() {
  const [file, envVar = 'NEON_ADMIN_URL'] = process.argv.slice(2);
  if (!file) throw new Error('Usage: node scripts/run-sql.js <file.sql> [ENV_VAR]');
  const url = process.env[envVar];
  if (!url) throw new Error(`Env var ${envVar} is not set`);

  let text = fs.readFileSync(file, 'utf-8');
  text = text.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const val = process.env[name];
    if (!val) throw new Error(`Placeholder {{${name}}} needs env var ${name}`);
    return val;
  });

  const statements = text
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);

  const sql = neon(url);
  for (const stmt of statements) {
    console.log('> ' + stmt.split('\n')[0].slice(0, 70) + ' ...');
    await sql.query(stmt);
  }
  console.log(`Executed ${statements.length} statements from ${file}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
```

Note: `.env` is not auto-loaded by plain `node`. Run scripts with the env inline, e.g. in Git Bash: `export $(grep -v '^#' .env | xargs)` once per shell, or `node --env-file=.env scripts/run-sql.js ...` (Node ≥ 20.6 supports `--env-file`; local Node is v24, so use that form throughout).

- [ ] **Step 6: Apply schema and roles; record the two new connection strings**

Generate the two role passwords:

```bash
node -e "console.log('SCRAPER_RW_PASSWORD=' + require('crypto').randomBytes(24).toString('base64url')); console.log('WEBAPP_RO_PASSWORD=' + require('crypto').randomBytes(24).toString('base64url'))"
```

Append both lines to `.env`, then:

```bash
node --env-file=.env scripts/run-sql.js db/schema.sql NEON_ADMIN_URL
node --env-file=.env scripts/run-sql.js db/roles.sql NEON_ADMIN_URL
```

Expected: `Executed 5 statements from db/schema.sql` and `Executed 7 statements from db/roles.sql`, no errors.

Now derive the role connection strings from `NEON_ADMIN_URL` by swapping the `user:password@` part, and append to `.env`:

```
NEON_SCRAPER_URL=postgresql://scraper_rw:<SCRAPER_RW_PASSWORD>@<same-host>/neondb?sslmode=require
NEON_DATABASE_URL=postgresql://webapp_ro:<WEBAPP_RO_PASSWORD>@<same-host>/neondb?sslmode=require
```

- [ ] **Step 7: Verify tables and grants**

```bash
node --env-file=.env -e "
const { neon } = require('@neondatabase/serverless');
(async () => {
  const ro = neon(process.env.NEON_DATABASE_URL);
  const tables = await ro.query(\"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1\");
  console.log('tables:', tables.map(r => r.table_name).join(', '));
  try { await ro.query(\"DELETE FROM sessions\"); console.log('FAIL: webapp_ro can DELETE'); process.exit(1); }
  catch { console.log('OK: webapp_ro is read-only'); }
})();
"
```

Expected: `tables: courses, groups, semesters, sessions` and `OK: webapp_ro is read-only`.

- [ ] **Step 8: Commit**

```bash
git add db/schema.sql db/roles.sql scripts/run-sql.js package.json package-lock.json
git commit -m "Add Neon schema, roles, and SQL runner for timetable backend"
```

(Confirm `git status` shows no `.env` — it must stay untracked.)

---

### Task 2: Rewrite getTimetable.js (TDD, no live DB needed)

**Files:**
- Modify: `netlify/functions/getTimetable.js` (full rewrite)
- Create: `tests/functions/getTimetable.test.js`
- Modify: `package.json` (test script)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime in tests (the DB is faked); the real handler reads env vars `NEON_DATABASE_URL` and optional `CALENDAR_SESSION_LIMIT`.
- Produces: `exports.handler(event)` (Netlify entry point), `exports.handleRequest(event, sql)` (testable core; `sql` is a Neon-style async tagged-template function returning row arrays), `exports._resetSemesterCache()` (test/contract-script helper). Response contract per Global Constraints.

- [ ] **Step 1: Add the test script to `package.json`**

In `"scripts"`, replace the placeholder test entry:

```json
"test": "node --test tests/"
```

- [ ] **Step 2: Write the failing tests**

`tests/functions/getTimetable.test.js`:

```javascript
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { handleRequest, _resetSemesterCache } = require('../../netlify/functions/getTimetable.js');

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

// Mimics the neon() tagged-template client: routes each query by its SQL text.
function makeFakeSql({ semesterRows, countRows, sessionRows, failWith } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (failWith) throw failWith;
    if (text.includes('is_active')) return semesterRows;
    if (text.includes('count(*)')) return countRows;
    return sessionRows;
  };
  return { sql, calls };
}

const SAMPLE_ROW = {
  course_id: 'ITX0020', date: '01.09.2026', start: '10:00', end: '11:30',
  type: 'loeng', room: 'U06-201', weeks: '1-16', comment: '',
  instructor: { name: 'Evelin Halling', title: 'vanemlektor' },
  groups: [{ group: 'EACB31', ainekv: 'kohustuslik' }], is_veebiope: false,
};

beforeEach(() => _resetSemesterCache());

test('no courses param returns 200 with empty array', async () => {
  const { sql } = makeFakeSql();
  const res = await handleRequest({ queryStringParameters: {} }, sql);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body), []);
  assert.strictEqual(res.headers['Cache-Control'], CACHE_CONTROL);
});

test('returns session rows as a bare array with cache headers', async () => {
  const { sql, calls } = makeFakeSql({
    semesterRows: [{ code: '26s' }],
    countRows: [{ count: 1 }],
    sessionRows: [SAMPLE_ROW],
  });
  const res = await handleRequest({ queryStringParameters: { courses: 'ITX0020,VAA0240' } }, sql);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body), [SAMPLE_ROW]);
  assert.strictEqual(res.headers['Cache-Control'], CACHE_CONTROL);
  // Both data queries are parameterized with the semester code and the id array.
  const dataCalls = calls.filter((c) => !c.text.includes('is_active'));
  assert.strictEqual(dataCalls.length, 2);
  for (const call of dataCalls) {
    assert.deepStrictEqual(call.values, ['26s', ['ITX0020', 'VAA0240']]);
  }
});

test('count above limit returns limit_exceeded envelope, not the rows', async () => {
  const { sql, calls } = makeFakeSql({
    semesterRows: [{ code: '26s' }],
    countRows: [{ count: 4001 }],
    sessionRows: [SAMPLE_ROW],
  });
  const res = await handleRequest({ queryStringParameters: { courses: 'ITX0020' } }, sql);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body), { error: 'limit_exceeded', count: 4001, limit: 4000 });
  // The row query must not have been issued.
  assert.strictEqual(calls.filter((c) => c.text.includes('to_char')).length, 0);
});

test('query failure returns 500 with error body', async () => {
  const { sql } = makeFakeSql({ failWith: new Error('connection refused') });
  const res = await handleRequest({ queryStringParameters: { courses: 'ITX0020' } }, sql);
  assert.strictEqual(res.statusCode, 500);
  assert.ok(JSON.parse(res.body).error);
});

test('missing active semester returns 500', async () => {
  const { sql } = makeFakeSql({ semesterRows: [] });
  const res = await handleRequest({ queryStringParameters: { courses: 'ITX0020' } }, sql);
  assert.strictEqual(res.statusCode, 500);
});

test('active semester lookup is cached across requests', async () => {
  const { sql, calls } = makeFakeSql({
    semesterRows: [{ code: '26s' }], countRows: [{ count: 0 }], sessionRows: [],
  });
  await handleRequest({ queryStringParameters: { courses: 'A' } }, sql);
  await handleRequest({ queryStringParameters: { courses: 'B' } }, sql);
  assert.strictEqual(calls.filter((c) => c.text.includes('is_active')).length, 1);
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `handleRequest is not a function` / `_resetSemesterCache is not a function` (the current file-based implementation exports only `handler`).

- [ ] **Step 4: Rewrite `netlify/functions/getTimetable.js`**

Full replacement of the file:

```javascript
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

exports.handler = (event) => handleRequest(event, getSql());
exports.handleRequest = handleRequest;
exports._resetSemesterCache = () => { semesterCache = { code: null, expiresAt: 0 }; };
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: 6 passing, 0 failing.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/getTimetable.js tests/functions/getTimetable.test.js package.json
git commit -m "Rewrite getTimetable to query Neon with server-side session limit"
```

---

### Task 3: Seed script — load current sessions.json into Neon

**Files:**
- Create: `scripts/seed-sessions-from-json.js`

**Interfaces:**
- Consumes: `.env` vars `NEON_SCRAPER_URL` (Task 1); repo-root `sessions.json` and `unified_courses.json` (Git LFS — run `git lfs pull` first if they are pointer files).
- Produces: Neon `semesters` row for the current semester with `is_active = true`, and one `sessions` row per element of `sessions.json`. Task 4's contract test depends on this exact data.

- [ ] **Step 1: Verify the data files are real (not LFS pointers)**

```bash
node -e "const s = require('fs').statSync('sessions.json'); if (s.size < 1e6) { console.error('sessions.json looks like an LFS pointer - run: git lfs pull'); process.exit(1);} console.log('OK', s.size, 'bytes')"
```

Expected: `OK <about 26-42 million> bytes`. If it fails, run `git lfs pull` and re-check.

- [ ] **Step 2: Write `scripts/seed-sessions-from-json.js`**

```javascript
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
```

- [ ] **Step 3: Run the seed**

```bash
node --env-file=.env scripts/seed-sessions-from-json.js
```

Expected: progress counter up to the source total, then `Done. Rows in DB: <n>; rows in source: <n>` with equal numbers, exit code 0. (Around 5,700 rows in the current scrape; takes a couple of minutes over HTTP.)

- [ ] **Step 4: Spot-check null handling (online sessions)**

```bash
node --env-file=.env -e "
const { neon } = require('@neondatabase/serverless');
(async () => {
  const sql = neon(process.env.NEON_DATABASE_URL);
  const [r] = await sql.query(\"SELECT count(*)::int AS c FROM sessions WHERE date IS NULL\");
  console.log('null-date sessions in DB:', r.c);
})();
"
```

Expected: matches the source count (spec noted 35 in the 2026-07-24 data; recount in source with `node -e "console.log(JSON.parse(require('fs').readFileSync('sessions.json','utf-8')).filter(s => s.date === null).length)"` and compare).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-sessions-from-json.js
git commit -m "Add dev seed script loading sessions.json into Neon"
```

---

### Task 4: Contract test — old file-based vs new Neon-based responses

**Files:**
- Create: `scripts/contract-test-gettimetable.js`

**Interfaces:**
- Consumes: `handleRequest(event, sql)` and `_resetSemesterCache()` from `netlify/functions/getTimetable.js` (Task 2); seeded DB (Task 3); `NEON_DATABASE_URL` from `.env`; repo-root `sessions.json`.
- Produces: a pass/fail verdict (exit code) that the Neon path is response-identical to the legacy file path for every course in the dataset.

- [ ] **Step 1: Write `scripts/contract-test-gettimetable.js`**

```javascript
// scripts/contract-test-gettimetable.js
// Replays the legacy file-based filter against the new Neon-backed handler for
// every course_id in sessions.json (in batches small enough to stay under the
// session limit) and requires deep-equal responses. Row order and JSON key
// order are not part of the contract, so both sides are canonicalized first.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { neon } = require('@neondatabase/serverless');
const { handleRequest, _resetSemesterCache } = require('../netlify/functions/getTimetable.js');

const BATCH_SIZE = 50;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonicalize(value[k])]));
  }
  return value;
}

// One sortable string per event so the two sides compare order-independently.
function fingerprints(events) {
  return events.map((e) => JSON.stringify(canonicalize(e))).sort();
}

async function main() {
  if (!process.env.NEON_DATABASE_URL) throw new Error('Set NEON_DATABASE_URL');
  const sql = neon(process.env.NEON_DATABASE_URL);

  const root = path.resolve(__dirname, '..');
  const allEvents = JSON.parse(fs.readFileSync(path.join(root, 'sessions.json'), 'utf-8'));
  const courseIds = [...new Set(allEvents.map((e) => e.course_id))].sort();
  console.log(`${allEvents.length} events, ${courseIds.length} distinct courses`);

  let compared = 0;
  for (let i = 0; i < courseIds.length; i += BATCH_SIZE) {
    const batch = courseIds.slice(i, i + BATCH_SIZE);
    const batchSet = new Set(batch);

    const legacy = allEvents.filter((e) => batchSet.has(e.course_id));

    _resetSemesterCache();
    const res = await handleRequest({ queryStringParameters: { courses: batch.join(',') } }, sql);
    assert.strictEqual(res.statusCode, 200, `batch ${i}: status ${res.statusCode} body ${res.body}`);
    const fresh = JSON.parse(res.body);
    assert.ok(Array.isArray(fresh), `batch ${i}: expected array, got ${res.body.slice(0, 200)}`);

    const a = fingerprints(legacy);
    const b = fingerprints(fresh);
    assert.strictEqual(b.length, a.length, `batch ${i}: ${a.length} legacy vs ${b.length} neon events`);
    for (let j = 0; j < a.length; j++) {
      if (a[j] !== b[j]) {
        console.error('First mismatch in batch starting at course index ' + i);
        console.error('legacy:', a[j]);
        console.error('neon:  ', b[j]);
        process.exit(1);
      }
    }
    compared += a.length;
    process.stdout.write(`\r  compared ${compared}/${allEvents.length} events`);
  }
  console.log('\nCONTRACT OK: all responses deep-equal');
}

main().catch((err) => { console.error('\n' + (err.stack || err)); process.exit(1); });
```

- [ ] **Step 2: Run it**

```bash
node --env-file=.env scripts/contract-test-gettimetable.js
```

Expected: `CONTRACT OK: all responses deep-equal` with the compared total equal to the source event count, exit 0.

If it fails on a formatting difference (e.g. the source file has a time like `8:00` where `to_char` emits `08:00`), that is a real contract finding: **stop and record it** — do not "fix" the test to pass. The resolution (normalize at ingest vs. accept the diff) is a spec decision.

- [ ] **Step 3: Commit**

```bash
git add scripts/contract-test-gettimetable.js
git commit -m "Add contract test comparing file-based and Neon timetable responses"
```

---

### Task 5: Client — build the limit message from the response's count/limit

**Files:**
- Modify: `main.js:83` (limit state), `main.js:149` (uiTexts), `main.js:950-958` (response handling), `main.js:1001-1002` (button/message rendering)

**Interfaces:**
- Consumes: the `{ error: 'limit_exceeded', count, limit }` response shape produced by Task 2.
- Produces: no new exports — `main.js` is a browser script. New module-level variable `calendarSessionLimit` (number), seeded from the existing `CALENDAR_SESSION_LIMIT` constant and overwritten from each limit response.

Line numbers below are as of commit `44885dd`; locate by content if they have drifted.

- [ ] **Step 1: Add the mutable limit variable**

At `main.js:83`, after the constant:

```javascript
const CALENDAR_SESSION_LIMIT = 4000;
let calendarSessionLimit = CALENDAR_SESSION_LIMIT;
```

- [ ] **Step 2: Make the bilingual message take the limit as a parameter**

Replace the `calendarLimitExceeded` entry (`main.js:149`):

```javascript
calendarLimitExceeded: { et: (n, limit) => `Leitud ${n} sessiooni. Kalendrivaate kuvamiseks (max ${limit}) kitsenda valikut.`, en: (n, limit) => `Found ${n} sessions. Please narrow your search to display the calendar view (max ${limit}).` },
```

- [ ] **Step 3: Handle the limit envelope in `toggleCalendarView`**

Replace this block (`main.js:950-958`):

```javascript
        const filteredTimetableData = await response.json();
        totalFilteredSessions = filteredTimetableData.length;

        // This handles the session limit error.
        if (totalFilteredSessions > CALENDAR_SESSION_LIMIT) {
            updateViewToggleButton(); // Renders the "session limit exceeded" message
            loadingIndicatorDOM.classList.add('hidden');
            return; // Stops the function to ensure the message stays visible.
        }
```

with:

```javascript
        const filteredTimetableData = await response.json();

        // The server enforces the session limit and returns
        // { error: 'limit_exceeded', count, limit } instead of an array.
        if (!Array.isArray(filteredTimetableData)) {
            if (filteredTimetableData && filteredTimetableData.error === 'limit_exceeded') {
                totalFilteredSessions = filteredTimetableData.count;
                calendarSessionLimit = filteredTimetableData.limit;
                updateViewToggleButton(); // Renders the "session limit exceeded" message
                loadingIndicatorDOM.classList.add('hidden');
                return; // Stops the function to ensure the message stays visible.
            }
            throw new Error('Unexpected timetable response shape');
        }

        totalFilteredSessions = filteredTimetableData.length;

        // Safety net for a server that does not enforce the limit (e.g. stale deploy).
        if (totalFilteredSessions > calendarSessionLimit) {
            updateViewToggleButton();
            loadingIndicatorDOM.classList.add('hidden');
            return;
        }
```

- [ ] **Step 4: Use the response-derived limit when rendering**

In `updateViewToggleButton` (`main.js:1001-1002`), change the condition and the message call:

```javascript
    } else if (totalFilteredSessions > calendarSessionLimit) {
        buttonHTML = `<div class="flex flex-col items-end"><button class="px-3 py-1 rounded text-sm font-medium bg-gray-400 text-white cursor-not-allowed" disabled><i class="fas fa-calendar-week mr-1"></i> ${uiTexts.showCalendarView[currentLanguage]}</button><p class="text-xs text-red-600 mt-1 text-right">${uiTexts.calendarLimitExceeded[currentLanguage](totalFilteredSessions, calendarSessionLimit)}</p></div>`;
```

Verify with `grep -n "CALENDAR_SESSION_LIMIT\|calendarLimitExceeded" main.js` that the only remaining uses of the constant are its declaration and the `calendarSessionLimit` seed (the uiTexts entry and both rendering sites now use the parameter/variable).

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "Build calendar limit message from server count and limit fields"
```

(End-to-end verification of this change happens in Task 6 — it needs the local Netlify dev server.)

---

### Task 6: Local end-to-end verification (netlify dev + browser)

**Files:**
- None created/modified — verification only. Temporary edits to `.env` are reverted within the task.

**Interfaces:**
- Consumes: everything from Tasks 1-5; `npm run dev:netlify` (serves site + functions on port 8000; Netlify Dev auto-loads `.env`, so the function sees `NEON_DATABASE_URL`).

- [ ] **Step 1: Start the dev server in the background**

```bash
npm run dev:netlify
```

Wait for the "Server now ready on http://localhost:8000" line.

- [ ] **Step 2: Verify the function over HTTP**

```bash
curl -s "http://localhost:8000/.netlify/functions/getTimetable?courses=ITX0020" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(Array.isArray(j)?'array of '+j.length:'NOT ARRAY: '+d.slice(0,200))})"
curl -s "http://localhost:8000/.netlify/functions/getTimetable" 
curl -s -o /dev/null -w "%{http_code} %{size_download} bytes\n" "http://localhost:8000/.netlify/functions/getTimetable?courses=ITX0020"
```

Expected: `array of <n>` (n ≥ 1); bare `[]`; `200` with a small byte count.

- [ ] **Step 3: Verify the calendar renders in the browser**

Open `http://localhost:8000`, run a search that returns a handful of courses (e.g. search `ITX0020`), and switch to Calendar View. Expected: sessions render in the weekly grid exactly as before the change (check one known offline session shows its room, and no console errors). Use browser automation tools if available; otherwise ask the user to confirm.

- [ ] **Step 4: Verify the limit path with a tiny server-side limit**

Add `CALENDAR_SESSION_LIMIT=10` to `.env`, restart `npm run dev:netlify`, reload the page, search for a course set with more than 10 sessions, and click Calendar View. Expected: the disabled button plus the bilingual message reading "Leitud <n> sessiooni. Kalendrivaate kuvamiseks (max 10) kitsenda valikut." — the **10 comes from the response**, proving the client no longer uses its local constant. Confirm with:

```bash
curl -s "http://localhost:8000/.netlify/functions/getTimetable?courses=ITX0020,VAA0240,DMK1021"
```

Expected: `{"error":"limit_exceeded","count":<n>,"limit":10}`.

- [ ] **Step 5: Revert the temporary limit**

Remove the `CALENDAR_SESSION_LIMIT=10` line from `.env`. Stop the dev server. Nothing to commit.

---

### Task 7: Deploy to Netlify and verify in production

**Files:**
- None in-repo — Netlify environment configuration + deploy + verification.

**Interfaces:**
- Consumes: `NEON_DATABASE_URL` value from `.env` (the `webapp_ro` string, Task 1); the repo's deploy flow (dev branch → dev site deploy; main → production).
- Produces: the verified production behavior that gates Task 8.

- [ ] **Step 1: Set the function env var on the Netlify site**

```bash
netlify env:set NEON_DATABASE_URL "postgresql://webapp_ro:<password>@<host>/neondb?sslmode=require"
```

(The Netlify CLI is already authenticated and linked for this site. Do not set `CALENDAR_SESSION_LIMIT` — the code's 4000 default is the intended production value.)

- [ ] **Step 2: Push and deploy the dev branch**

```bash
git push origin dev
```

Then trigger the dev deploy: VS Code task "Netlify: Deploy Dev Branch", or the dev build-hook URL from the Netlify UI (Site configuration → Build & deploy → Build hooks — the URL is a secret; ask the user if it is not at hand). Wait for the deploy to finish (Netlify UI or `netlify watch`).

- [ ] **Step 3: Verify on the dev site**

Against the dev site URL (from `netlify status` or the UI):

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://<dev-site>/.netlify/functions/getTimetable?courses=ITX0020"
```

Expected: `200`. Then reproduce audit finding #14 — request a large course set (280+ ids; build it from the browser by selecting a school-wide filter, or from `sessions.json` course ids). Expected: `200` with either an array or the `limit_exceeded` envelope — **not a 502**. Also load the dev site in a browser and repeat Task 6 Step 3's calendar check.

- [ ] **Step 4: Merge to main and deploy production**

```bash
git checkout main
git pull origin main
git merge dev
git push origin main
git checkout dev
```

Trigger the production deploy (VS Code task "Netlify: Deploy Main Branch" or the main build hook). This is an outward-facing production change: confirm with the user before this step if the session has no standing approval for production deploys.

- [ ] **Step 5: Verify production**

Same checks as Step 3 against the production URL, most importantly the 280+ course request returning `200`. Record the result (this is the gate for Task 8).

---

### Task 8: Remove sessions.json from the repo (GATED on Task 7 production verification)

**Do not start this task unless Task 7 Step 5 passed in production.** The static file is the rollback path until then.

**Files:**
- Delete: `sessions.json`
- Modify: `.gitattributes` (drop the sessions.json LFS rule), `.gitignore` (guard against re-adding), `netlify.toml` (drop `included_files`), `CLAUDE.md` (data files + backend sections)

**Interfaces:**
- Consumes: verified production state from Task 7.
- Produces: a repo where scrapes no longer touch `sessions.json`. (The scraper's `publish_to_webapp.py` must stop copying `sessions.json` here — that change belongs to the scraper repo's ingest plan; until it lands, an ignored stray copy may appear in the working tree, which is harmless.)

- [ ] **Step 1: Remove the file and its LFS/Netlify wiring**

```bash
git rm sessions.json
```

In `.gitattributes`, delete the line matching `sessions.json` (keep the `unified_courses.json` rule — that file remains until Phase 2). In `.gitignore`, add a line `sessions.json` so a scraper still copying it cannot be accidentally committed. In `netlify.toml`, remove the `included_files = ["sessions.json"]` line; if that leaves an empty `[functions]` section, remove the section too.

- [ ] **Step 2: Update `CLAUDE.md`**

In the "Data Files" section, replace the two-file description: session data now lives in Neon Postgres (`sessions` table, schema in `db/schema.sql`), queried by `netlify/functions/getTimetable.js` via the `NEON_DATABASE_URL` (read-only role) env var; `unified_courses.json` (~6 MB, Git LFS) remains the course-metadata source until Phase 2. Also update the "Backend Architecture" description of `getTimetable.js` (reads Neon, enforces the session limit server-side, returns `{error, count, limit}` when exceeded) and the Git LFS note that only `unified_courses.json` remains tracked.

- [ ] **Step 3: Verify the local site still works without the file**

```bash
npm run dev:netlify
```

Repeat Task 6 Steps 2-3 (function returns arrays; calendar renders). Stop the server.

- [ ] **Step 4: Run the full test suite one last time**

```bash
npm test
```

Expected: all passing. (The contract test script now has no `sessions.json` to read — that is expected; it did its job in Task 4 and stays in `scripts/` for rerunning against any future scrape by restoring the file locally.)

- [ ] **Step 5: Commit, push, deploy**

```bash
git add -A
git commit -m "Remove sessions.json from repo after Neon backend verified in production"
git push origin dev
```

Then merge/deploy per Task 7 Steps 4-5 flow (dev site first, then production), and confirm the production function still returns `200` after a deploy that no longer bundles the file.

---

## Out of scope (tracked elsewhere)

- **Scraper repo ingest** (spec "Ingest contract", ingest round-trip test): separate plan in `C:\Projects\scrape_taltech_tunniplaan`. Until it lands, data refreshes happen by re-running `scripts/seed-sessions-from-json.js` against a fresh `sessions.json`.
- **Phase 2** (`courses`/`groups` ingest, `getCourses` function, `unified_courses.json` removal): future plan; the schema for it already exists after Task 1.
