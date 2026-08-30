# Task 1 brief — Add dataset identity columns and an idempotent migration

**Plan:** `docs/superpowers/plans/260829-neon-phase2-live-dataset.md`, Task 1
**Spec:** §7.2 (version computation), §8 (schema), §9.1 (manifest fields)
**Repository:** webapp `C:\Projects\tunniplaan` only
**Preconditions:** Task 0 complete and independently reviewed. Live schema confirmed
identical to `db/schema.sql`; neither new column exists anywhere.

## Scope

- Modify `db/schema.sql`: add nullable `semesters.dataset_version text` and
  `semesters.ingested_at timestamptz`.
- Create `db/migrations/20260829_phase2_dataset_version.sql` using
  `ADD COLUMN IF NOT EXISTS`.
- Create a static schema assertion under `tests/db/` that fails while the columns are
  absent, so the clean schema and the migration cannot drift apart.
- Apply the migration twice to a **disposable** Neon branch; the second apply must
  succeed without a duplicate-column error.
- Verify `webapp_ro` can select the new columns and cannot update them.

## Interfaces

- Clean schema creation and migration of an existing database converge on the same
  eleven-column `semesters` table.
- Production is not mutated in this task.

## Forbidden

- No production DDL.
- No `NOT NULL` before the first ingest backfills existing rows.
- No new uniqueness constraint on `is_active`.
- No credential changes.
- No change to any Netlify function, `main.js`, or wire contract.

## Verification commands

```bash
node --test          # 10 pass, 0 fail (7 pre-existing + 3 new)
git diff --check
git diff --stat
```

Plus, on the disposable branch: `information_schema.columns` before and after each
apply, and a `webapp_ro` select/update pair.

## Completion evidence

First and second migration outputs; the post-migration column list; the read-only
mutation denial; a clean independent review verdict.
