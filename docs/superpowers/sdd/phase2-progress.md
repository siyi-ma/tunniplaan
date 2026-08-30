# Neon Phase 2 — execution ledger

The ledger of record for `docs/superpowers/plans/260829-neon-phase2-live-dataset.md`.
Updated in the same commit as each task's final change.

**Approval:** the owner authorised execution on 2026-08-30, starting at Task 0. Both the
spec and the plan were moved from `Draft — pending review` to `Approved` in the same commit
as this ledger's creation.

## Repositories and starting points

| Repo | Path | Branch | Starting SHA |
|---|---|---|---|
| webapp | `C:\Projects\tunniplaan` | `dev` | `4e1795804a90571ea965f402bf7f2e968b999721` |
| scraper | `C:\Projects\tunniplaanScraping` | `dev` | `30a0ad8b91c15cbd2bdddd5eac016494034f800b` |

Both worktrees were clean at Phase 2 start.

**Branch topology (plan §1.4).** Task 0 is controller artifacts only and belongs on `dev`.
Every implementation task belongs on its own branch:

| Branch | Base | Carries | State |
|---|---|---|---|
| webapp `dev` | — | Task 0 only | `7500c2a` |
| webapp `phase2-api` | `dev` @ `7500c2a` | Tasks 1, 4, 5, 6 | created 2026-08-30 |
| webapp `phase2-frontend` | `phase2-api` head | Tasks 7, 8, 9 | not yet created |
| scraper `phase2-neon-ingest` | scraper `dev` @ `30a0ad8` | manifest prerequisite, Tasks 2, 3 | created 2026-08-30 |

Task 1 was first committed to `dev` by mistake and its independent review caught it
(finding I1). Since nothing had been pushed — `origin/dev` was still at `4e17958` — the
commit was moved with `git branch phase2-api ffce930` followed by
`git reset --hard 7500c2a` on `dev`. No commit was lost and no history was rewritten
anywhere a remote could see. Had this gone unnoticed until Tasks 7–9 also landed on `dev`,
§1.4's two-stage rollout would have required exactly the cherry-picking it exists to avoid.

## Environment

| | |
|---|---|
| node | v22.17.0 |
| python | 3.13.1 |
| pytest | 9.1.1 |
| npm / npx | 10.9.2 — usable on this device (see task 00 report §2); gates stay on `node` |
| Neon project | `tunniplaan-aws` / `billowing-haze-50098055`, `aws-eu-central-1`, PG 17 |
| source artifacts | `C:\Users\siyi.ma\OneDrive - Tallinna Tehnikaülikool\M_õppetöö\TunniplaaniAI\26s\data` |
| dataset version at start | `1bf46c1d14e3d474ac97396a77645e7f54657bbc4463bda9767a5a4d56c8da14` |

`.env` exists in both repos with `TUNNIPLAAN_DATA_DIR` set; all `NEON_*` values are still
blank and are owner-supplied. Credentials never appear in a tracked file.

## Task status

| Task | Status | Repo | Commits | Notes |
|---|---|---|---|---|
| 0 Baselines and ledger | **complete, reviewed** | both | `7500c2a` (+ 3 text fixes in Task 1's commit) | independent review: *approved with minor findings*, 3 doc-consistency fixes, all applied |
| 1 Dataset identity columns | **complete, reviewed** | webapp `phase2-api` | `ffce930` + this fix commit | review: *changes required* → all findings applied. Migration proven idempotent on disposable branch `br-calm-art-as9qjjef`; production untouched |
| — Scraper manifest prerequisite | **review** | scraper `phase2-neon-ingest` | `9182c49` | `metadata.json` gains an `artifacts` block + `verify_artifacts()`; blocks Task 2 |
| 2 Producer validation + mapping | pending | scraper | | must add source-dir resolution |
| 3 Atomic ingest + rollback proof | pending | scraper | | blocks Task 6 |
| 4 Manifest endpoint | pending | webapp | | needs `NEON_DATABASE_URL` |
| 5 Paged courses endpoint | pending | webapp | | 6 pages, largest 1.050 MiB |
| 6 Source→Neon→API contract gate | pending | both | | requires Task 3 reviewed |
| 7 Frontend loader + sync date | pending | webapp | | |
| 8 Versioned calendar | pending | webapp | | owns contract-test source path |
| 9 Local E2E | pending | webapp | | function server still unspecified |
| 10 Docs / runbook | pending | both | | |
| 11 Staged rollout | pending | both | | explicit user gate |
| 12 Gated cleanup | pending | webapp | | not before 2026-09-15 |

## Production checkpoints

None reached. No DDL, ingest, push, merge, or deploy has been performed in Phase 2.

## Cross-task findings

| # | Finding | Owner |
|---|---|---|
| F1 | `NEON_DATABASE_URL` / `NEON_SCRAPER_URL` / `NEON_TEST_*` still blank | owner, before Task 4 |
| F2 | Hardcoded `DATA_DIRECTORY` embeds username `siyima`; unusable on this device | Task 2 |
| F3 | `scripts/contract-test-gettimetable.js` reads a deleted repo-root `sessions.json` | Task 8 |
| F4 | `groups` and `courses` are empty in production (0 rows); only Task 3 can populate them | Task 6 |
| F5 | The map key is `groupToFacultyMap` (camelCase), not snake_case | Task 4 |
| F6 | Live `semesters.scraping_datetime` (`16:43`) disagrees with the source pair (`17:05`) — a real instance of the §7.2.1 hazard | scraper manifest task |
| F7 | `db/roles.sql` **was** applied: `webapp_ro` holds SELECT only on all four tables (closes handoff finding 7) | resolved |
| F8 | `npm` is usable here, contradicting the recorded group-policy block; unverified for real installs | informational |
| F9 | Disposable Neon branch `phase2-task1-migration-test` (`br-calm-art-as9qjjef`) holds a copy of production data and one additional, **redundant** `webapp_ro → neondb_owner` membership row (production already grants that membership via `cloud_admin`). Delete after Task 1's review — needs owner approval | owner, after Task 1 review |
| F10 | `db/roles.sql` needs no change for the new columns: table-level grants extend to columns added later (verified both by catalog and by acting as the role) | Task 10 runbook |

## Deviations from the plan

| # | Deviation | Rationale |
|---|---|---|
| D1 | Task 0's final step named `.superpowers/sdd/phase2-progress.md`; the ledger was created at `docs/superpowers/sdd/` and the plan line corrected | leftover from review pass 1's B2 fix; §1.1 already specified `docs/superpowers/sdd/` |
| D2 | Neon was inspected through the Neon control plane rather than a `webapp_ro` psql session | `NEON_DATABASE_URL` is not yet available; the queries were read-only `information_schema` and `count(*)` reads, and grants were verified directly. A `webapp_ro` connectivity check is carried into Task 4 |
| D3 | Task 0's "Expected evidence" said `No tracked commit`, but §1.1 requires the ledger, brief, and report to be tracked and committed with the task. The bullet was corrected to forbid tracked *application-code, schema, or data* commits, which is what Task 0 actually means | same class of leftover as D1; raised by the Task 0 independent reviewer |
| D5 | The scraper's manifest prerequisite (spec §7.2.1, scraper `docs/260830-scrape-manifest-task.md`) was executed **before** plan Task 2, which the plan lists first | Task 2's `check_pair_consistency` consumes the manifest, and the scraper task states it "must land first". Its brief/report live in the scraper repo beside the code they describe, per §1.1's rule that evidence reverts with its task; this ledger keeps the cross-repo narrative and its live copy follows the active implementation branch rather than `dev`, so there is one lineage to merge |
| D4 | Moving the spec and plan from `Draft` to `Approved` is not one of Task 0's enumerated steps | it rests on the owner's authorisation to begin Task 0, which no reviewer can verify independently. Recorded here so the provenance of the status change is explicit. Plan §1.4 gates only branch creation on review, and §1.3 gates push/merge/deploy/DDL/ingest on Task 11 — none of which occurred |

## Commands run in Task 0

```text
git branch --show-current / rev-parse HEAD / status --short / lfs ls-files   both repos
node --version, python --version, python -m pytest --version, npm --version
npm ls --depth=0 ; npm install --dry-run                       (probe only, no install)
node --test                                                    7 pass, 0 fail
node --check main.js                                           OK
python -m pytest tests/ -q                                     57 passed, 2 skipped
python -m py_compile 26s_pipeline.py publish_to_webapp.py       OK
information_schema.columns / role_table_grants, count(*) x4    read-only
node <scratch>/measure-source.js "<source dir>"                see task 00 report §6
```

## Commands run in Task 1

Worktree before: webapp `dev` @ `7500c2a`, clean. Scraper untouched.

```text
node --test                    red: 10 tests, 7 pass, 3 fail (columns/migration absent)
node --test                    green: 10 tests, 10 pass, 0 fail
git diff --check               no output
git diff --cached --stat       9 files, +306 / -10

on disposable branch br-calm-art-as9qjjef (created from production HEAD):
  select … information_schema.columns                     -> [] (neither column exists)
  ALTER TABLE semesters ADD COLUMN IF NOT EXISTS x2       -> first apply, success
  select … information_schema.columns                     -> 11 columns, both nullable
  ALTER TABLE semesters ADD COLUMN IF NOT EXISTS x2       -> second apply, success, still 11
  has_column_privilege(webapp_ro, …, SELECT)              -> true, true
  has_column_privilege(webapp_ro, …, UPDATE)              -> false, false
  SET LOCAL ROLE webapp_ro; select dataset_version …      -> reads, returns null
  SET LOCAL ROLE webapp_ro; update semesters …            -> ERROR: permission denied

on the production default branch (read-only):
  phase2 columns = 0, semesters = 1, sessions = 66846     -> unmigrated, unchanged
```
