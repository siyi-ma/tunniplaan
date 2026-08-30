CREATE TABLE semesters (
  code          text PRIMARY KEY,          -- "26s"
  label         text NOT NULL,             -- "2026/2027 sügis"
  name_et       text,                      -- "sügis 2026"
  name_en       text,                      -- "autumn 2026"
  start_date    date,
  end_date      date,
  week1_monday  date,
  is_active     boolean NOT NULL DEFAULT false,
  scraping_datetime text,                  -- as-scraped ("16.07.2026 19:48"); informational only
  dataset_version text,                    -- SHA256(unified_courses.json || 0x00 || sessions.json)
  ingested_at   timestamptz                -- when the transaction that wrote this dataset committed
);
-- dataset_version and ingested_at stay nullable: rows written before Phase 2 have
-- neither, and the first atomic ingest is what backfills them.
-- Exactly one row has is_active = true; the scraper sets it at ingest. Enforced,
-- not merely asserted: both getDatasetManifest and getTimetable pick the active
-- semester with an unordered LIMIT 1, so if two rows were ever active they could
-- resolve differently per request and hand different clients different
-- dataset_versions.
CREATE UNIQUE INDEX semesters_one_active ON semesters ((true)) WHERE is_active;

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
