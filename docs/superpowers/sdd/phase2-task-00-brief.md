# Task 0 brief — Freeze baselines and create the Phase 2 ledger

**Plan:** `docs/superpowers/plans/260829-neon-phase2-live-dataset.md`, Task 0
**Spec:** `docs/superpowers/specs/260829-neon-phase2-live-dataset.md`, §7.2, §7.2.1, §7.2.2, §9.2
**Repositories:** webapp `C:\Projects\tunniplaan`, scraper `C:\Projects\tunniplaanScraping`
**Mutation allowed:** controller artifacts only. No tracked application code, no DDL, no ingest,
no push, no deploy.

## Scope

Produce the authoritative baseline for Phase 2:

1. Branch, HEAD SHA, `git status --short`, `git lfs ls-files` in both repos.
2. `node`, `python`, `pytest` versions; whether `npm`/`npx` are usable on this device.
3. Webapp baseline: `node --test`, `node --check main.js`.
4. Scraper baseline: `python -m pytest tests/ -q`, `python -m py_compile 26s_pipeline.py publish_to_webapp.py`.
5. Read-only Neon inspection: column names for all four tables, active semester code/label/
   `scraping_datetime`, row counts, and whether `dataset_version` / `ingested_at` exist.
   Also `information_schema.role_table_grants` (handoff finding 7 — whether `db/roles.sql`
   was ever applied to production).
6. Resolve the source-artifact directory per spec §7.2.2 and record absolute path, per-file
   size, mtime, SHA-256; confirm the pair is `PRODUCTION`, not `*_test.json`.
7. Confirm OneDrive hydration. A zero-byte or stalled read is a stop condition, not a retry.
8. Copy `.env.example` → `.env` in both repos. Never print the values.
9. Measure raw bytes, compact bytes, largest 200-course page, and source counts with a
   deterministic script run against the resolved source directory.
10. Create `docs/superpowers/sdd/phase2-progress.md` with all evidence attached.

## Forbidden

- Any schema change, ingest, or write to Neon.
- Committing `sessions.json`, `.env`, or any credential value.
- Treating `scripts/contract-test-gettimetable.js` failing as a baseline regression: as
  committed it reads `<repo-root>/sessions.json`, which Phase 1 deleted. Its source path
  becomes an explicit input in Task 8.
- Running `npm install`.

## Stop conditions

- Either tracked worktree has changes overlapping planned files with unclear ownership.
- Baseline tests fail for an unrelated reason.
- The live schema differs materially from `db/schema.sql` — document and re-plan Task 1.
- A source artifact reads as empty or blocks (unhydrated OneDrive placeholder).

## Verification commands

```bash
# webapp
git branch --show-current && git rev-parse HEAD && git status --short && git lfs ls-files
node --test
node --check main.js

# scraper
python -m pytest tests/ -q
python -m py_compile 26s_pipeline.py publish_to_webapp.py
```

## Expected evidence

Clean or fully inventoried worktrees; both baselines green; DB counts and schema state with
no secret output; the resolved source directory with hashes; the measurement output. One
commit containing only controller artifacts.
