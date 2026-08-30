-- Phase 2: dataset identity on the active semester.
--
-- dataset_version is the content address the browser pins a page load to, computed
-- by the producer as SHA256(unified_courses.json bytes || 0x00 || sessions.json bytes).
-- ingested_at records when the transaction that wrote the dataset committed.
--
-- Additive and idempotent: safe to re-run. Both columns are nullable because the
-- existing row predates Phase 2 and only the first atomic ingest can fill them.
-- Do not add NOT NULL here.
--
-- Apply with: node scripts/run-sql.js db/migrations/20260829_phase2_dataset_version.sql <ENV_VAR>

ALTER TABLE semesters ADD COLUMN IF NOT EXISTS dataset_version text;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS ingested_at timestamptz;
