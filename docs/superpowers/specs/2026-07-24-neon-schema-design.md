# Design: Neon Postgres schema for tunniplaan data backend

Date: 2026-07-24
Status: Approved by owner (brainstorm 2026-07-24); ready for implementation planning
Companion assessment: `docs/20260724-neon-data-backend-assessment.md`

## Goal

Move timetable data out of the deploy artifact and into Neon Postgres so that:

1. A scrape updates the live site **without triggering a Netlify deploy**.
2. The calendar endpoint queries an indexed table instead of parsing a bundled 26 MB
   `sessions.json` per invocation (fixes the production 502 at 280+ courses — audit
   finding #14).
3. Git LFS churn (~31 MB per scrape) is eliminated.

Non-goals: no frontend filtering rewrite, no UI changes, no semester picker UI. The
browser keeps doing client-side filtering exactly as today.

## Decisions taken (with owner)

| Decision | Choice |
|---|---|
| Semester scope | **Accumulate semesters in DB; app serves active only.** Every table keyed by `semester_code`; functions default to the active semester. History kept for rollback; no UI change. |
| Normalization | **Hybrid: real columns + JSONB.** Filterable/joinable fields are indexed columns; nested payloads (`group_sessions`, session `groups[]`, `instructor`, study programmes) stay JSONB so the wire format matches today. |
| Session identity | **Replace-per-semester.** Source sessions have no stable key. Scraper deletes + bulk-inserts the active semester's sessions in one transaction. Courses/groups use true upsert (`ON CONFLICT ... DO UPDATE`) on their natural keys. |
| `groupToFacultyMap` | Real `groups` table (427 rows, semester-scoped), reassembled into the flat map by `getCourses`. |

## Schema

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
  date          date,                      -- NULL for online sessions (35/5692 in current data)
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

## Wire-format contract (the critical part)

**The JSON contract is defined by what `main.js` parses, not by what the database
stores.** Verified against `main.js` on 2026-07-24:

- `main.js:211` `parseDate` splits session dates on `.` — the wire format MUST be
  `DD.MM.YYYY`. A raw Postgres `date` serializes as ISO and would silently render an
  empty calendar.
- Times must be `HH:MM` (Postgres `time` default `HH:MM:SS` breaks the dedupe key at
  `main.js:1062` and slot matching).
- Field names must be exactly `date`, `start`, `end` (reserved word in SQL — alias
  with quotes), `type`, `room`, `weeks`, `comment`, `instructor`, `groups`,
  `is_veebiope`, `course_id`. The internal `sessions.id` is never emitted.

### getTimetable (Phase 1 rewrite)

Request: unchanged — `GET /.netlify/functions/getTimetable?courses=ID1,ID2,...`

Query:

```sql
SELECT course_id,
       to_char(date, 'DD.MM.YYYY')    AS date,
       to_char(start_time, 'HH24:MI') AS start,
       to_char(end_time, 'HH24:MI')   AS "end",
       type, room, weeks, comment, instructor, groups, is_veebiope
FROM sessions
WHERE semester_code = $1 AND course_id = ANY($2)
```

`$1` = active semester code (one cached lookup of `semesters WHERE is_active`).
NULL date/times pass through as JSON `null`, matching today's online sessions.

**Server-side session limit (closes audit H7 / finding #14):** before returning rows,
run `SELECT count(*)` with the same WHERE. If count > limit, return `200` with
`{ "error": "limit_exceeded", "count": <n>, "limit": <limit> }` instead of the array.
Per the roadmap Phase 6 amendment, the client builds the too-many-sessions message from
the response's `count`/`limit` fields, not the local `CALENDAR_SESSION_LIMIT` constant.
This is the only client change in scope, and it is already specified by the audit
roadmap. Success response stays a bare JSON array, byte-compatible with today.

### getCourses (Phase 2, new function)

`main.js:1670-1675` consumes a four-part envelope. The function reassembles it from
three tables (all scoped to the active semester):

```json
{
  "semester":          { "label", "code", "name_et", "name_en",
                         "start_date", "end_date", "week1_monday" },
  "courses":           [ { ...course row, groups, group_sessions, study_programmes_et/en } ],
  "groupToFacultyMap": { "VDLR31": "V", ... },
  "scraping_datetime": "16.07.2026 19:48"
}
```

Notes:
- `semester.start_date` / `end_date` / `week1_monday` must be emitted as ISO
  `YYYY-MM-DD` strings (that IS today's format for the semester block — unlike session
  dates, which are dotted). `applySemesterInfo` (`main.js:1637`) concatenates them into
  `Date` constructors as ISO.
- Course rows are flattened back: JSONB `study_programmes` splits into
  `study_programmes_et` / `study_programmes_en` top-level keys to match today's shape.
- `groupToFacultyMap` = `SELECT code, faculty_code FROM groups WHERE semester_code = $1`
  folded into an object.
- During Phase 1, `unified_courses.json` remains a static file; this endpoint ships in
  Phase 2 and `index.html`'s fetch URL flips from the static file to the function.

## Ingest contract (scraper repo)

Replaces `publish_to_webapp.py`'s copy-to-repo step. Per scrape run, one transaction:

1. Upsert the `semesters` row (`ON CONFLICT (code) DO UPDATE`), set `is_active = true`
   for it and `false` for all others.
2. Upsert `groups` rows for the semester; delete rows for the semester not present in
   this scrape.
3. Upsert `courses` rows (`ON CONFLICT (semester_code, id) DO UPDATE`); delete courses
   for the semester not present in this scrape.
4. `DELETE FROM sessions WHERE semester_code = :code`, then bulk `INSERT` all scraped
   sessions.
5. Commit. A failure anywhere rolls back — a half-scraped dataset is never visible.

Date/time parsing at ingest: session `date` `DD.MM.YYYY` → `date`; `start`/`end`
`HH:MM` → `time`; semester dates are already ISO. Empty strings (`room`, `comment`)
stored as-is (empty string, not NULL) to keep the wire format identical.

## Roles and secrets

- `scraper_rw`: INSERT/UPDATE/DELETE on all four tables. Connection string lives in the
  scraper repo's environment (never committed).
- `webapp_ro`: SELECT only. Connection string in Netlify env var
  (`NEON_DATABASE_URL`), consumed via `@neondatabase/serverless` (HTTP driver — no
  connection pooling needed in Lambda).

## Caching

Data changes only when the scraper runs. Function responses get
`Cache-Control: public, max-age=300, stale-while-revalidate=3600` (tunable) so Netlify's
CDN absorbs repeat traffic and Neon's scale-to-zero cold start (~few hundred ms) is
rarely user-visible.

## Error handling

- `getTimetable` with no `courses` param: keep today's behavior — `200` with `[]`.
- Neon unreachable / query error: `500` with `{ "error": "..." }`; `main.js:980-984`
  already renders a bilingual server-error message for 5xx.
- Limit exceeded: `200` with `{error, count, limit}` as specified above (not a 5xx —
  it is a valid, expected outcome).

## Phasing

1. **Phase 1 — sessions.** Create schema in Neon; scraper ingests sessions (+ semesters
   row); rewrite `getTimetable.js` to the query above with the limit contract; client
   change limited to reading `count`/`limit` from the limit response. Remove
   `sessions.json` from the repo/LFS once verified in production.
2. **Phase 2 — courses.** Scraper ingests courses + groups; new `getCourses` function;
   flip `index.html` data URL; remove `unified_courses.json` from the repo/LFS.
3. **Phase 3 (optional, unscheduled).** Server-side filtering/search in SQL if the
   course payload ever grows too large.

Each phase is independently shippable and independently revertible (the static files
stay in place until their replacement is verified live).

## Testing

- **Contract test (the important one):** run old `getTimetable` (file-based) and new
  (Neon-based) against the same scrape for identical course-ID sets; responses must be
  deep-equal after JSON parse. Same idea for `getCourses` vs the static file (envelope
  deep-equal, key order ignored).
- Ingest round-trip: scrape → ingest → export query → compare against source JSON
  (dates/times formatted back).
- Limit path: request a course set known to exceed the limit; assert `{error, count,
  limit}` shape and that the client renders the message from response fields.
- Null handling: online sessions (null date/times) survive round-trip as `null`.

## Risks

- **Live external dependency:** if Neon is down or cold, calendar/cards fail to load.
  Accepted trade-off (assessment §8); mitigated by CDN caching.
- **Two-repo coordination:** the DB schema replaces `docs/data-contract.md` as the
  contract; scraper ingest and webapp functions must change in lockstep. Phase
  boundaries are the coordination points.
- **`DD.MM.YYYY` coupling:** the dotted wire format is legacy client behavior preserved
  deliberately. If the frontend is ever refactored to ISO, only the `to_char` calls and
  `parseDate` change — noted here so a future refactor knows where the seam is.
