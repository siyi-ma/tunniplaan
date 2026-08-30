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

Both worktrees were clean at Phase 2 start. Implementation branches
(`phase2-neon-ingest`, `phase2-api`, `phase2-frontend`, plan §1.4) are **not yet created**;
Task 0 mutates controller artifacts only and stays on `dev`.

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
| 0 Baselines and ledger | **complete** | both | this commit | no code diff; see task 00 report |
| 1 Dataset identity columns | pending | webapp | | schema confirmed unchanged from `db/schema.sql` |
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

## Deviations from the plan

| # | Deviation | Rationale |
|---|---|---|
| D1 | Task 0's final step named `.superpowers/sdd/phase2-progress.md`; the ledger was created at `docs/superpowers/sdd/` and the plan line corrected | leftover from review pass 1's B2 fix; §1.1 already specified `docs/superpowers/sdd/` |
| D2 | Neon was inspected through the Neon control plane rather than a `webapp_ro` psql session | `NEON_DATABASE_URL` is not yet available; the queries were read-only `information_schema` and `count(*)` reads, and grants were verified directly. A `webapp_ro` connectivity check is carried into Task 4 |

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
