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
| webapp `phase2-frontend` | `phase2-api` head | Tasks 7, 8, 9, webapp half of Task 10 | `a4c9d76`; Tasks 7–9 complete, Task 10 review pending |
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

`.env` exists in both repos with `TUNNIPLAAN_DATA_DIR` set and with test-branch credentials
(see F1). `NEON_SCRAPER_URL` — the production write credential — is deliberately still unset,
so a production ingest cannot be run by accident. Credentials never appear in a tracked file.

## Task status

| Task | Status | Repo | Commits | Notes |
|---|---|---|---|---|
| 0 Baselines and ledger | **complete, reviewed** | both | `7500c2a` (+ 3 text fixes in Task 1's commit) | independent review: *approved with minor findings*, 3 doc-consistency fixes, all applied |
| 1 Dataset identity columns | **complete, reviewed** | webapp `phase2-api` | `ffce930`, `2a26c29` | review: *changes required* → all findings applied. Migration proven idempotent on disposable branch `br-calm-art-as9qjjef`; production untouched |
| — Scraper manifest prerequisite | **complete, reviewed** | scraper `phase2-neon-ingest` | `9182c49`, `c38a87e` | review: *approved with minor findings*; 3 hardening gaps closed (empty dataset, sessions-not-an-array, malformed manifest shapes) |
| 2 Producer validation + mapping | **complete, reviewed** | scraper `phase2-neon-ingest` | `289f46d`, `f2efefc` | review proved behavioural equivalence over 4,000 randomised payloads + the real pair; spec 8.1.3 preconditions added |
| 3 Atomic ingest + rollback proof | **complete, reviewed** | scraper `phase2-neon-ingest` | `a03b335`, `12db09e` | rollback proven at production scale and, by the reviewer, under a real constraint violation, a COPY failure and a dropped connection. 2.5-3.7s for 67k sessions |
| 4 Manifest endpoint | **complete, reviewed** | webapp `phase2-api` | `c78ca7e`, `7982d18`, `01ea187` | one statement, one snapshot; `no-store` on every path |
| 5 Paged courses endpoint | **complete, reviewed** | webapp `phase2-api` | `bada03c`, `57ff694` | 6 pages, largest 1.050 MiB, all 1030 courses deep-equal to source |
| 6 Source→Neon→API contract gate | **complete, reviewed** | webapp `phase2-api` | `cbd831b` + fixes | reviewer attacked it 26 ways, 24 caught; the 2 misses were the disclosed null rule, one a real counter blind spot, now fixed |
| 7 Frontend loader + sync date | **complete, reviewed** | webapp `phase2-frontend` | `77e149d`, `ddbe817` | loader, fallback, freshness notice, and sync-date fixes; 86 tests pass |
| 8 Versioned calendar | **complete, reviewed** | webapp `phase2-frontend` | `5e3cc64`, `0ac0c64` | version pinning, 409 handling, cache split, and contract coverage |
| 9 Local E2E | **complete, reviewed** | webapp `phase2-frontend` | `097f901`, `a4c9d76` | HTTP matrix and real-browser matrix pass; 15/15 browser checks |
| 10 Docs / runbook | implemented; independent review pending | both | `4a2556a`, `ef1d92f`, `867950d` | cold-operator findings applied; final independent review still required |
| 11 Staged rollout | **in progress — webapp branches consolidated into `dev`** | both | webapp closeout commit | owner explicitly directed both Phase 2 branches into `dev`; deployment, production-data, review, and `main` gates remain |
| 12 Gated cleanup | pending | webapp | | not before 2026-09-15 |

## Production checkpoints

The webapp code rollout to `dev` was completed on 2026-08-30. After the initial API-only
push, the owner explicitly directed `phase2-frontend` to be fast-forwarded into `dev` and
both remote feature refs to be removed. No production DDL, production ingest, merge to
`main`, or Task 12 cleanup has been performed.

The deployment gate has two halves and only one has passed:

| Gate | State |
|---|---|
| Code deployment, fallback mode | **passed 2026-08-30.** `dev` serves `4c8b58d` byte-for-byte; Edge rendered 1,030 fallback cards, dated notices in both languages, disabled calendar, working search/reset and the `?group=IADB11` deep link, no unexpected console errors |
| API-mode data verification | **blocked.** Production Neon is unmigrated, so the manifest returns `500 manifest_unavailable` (correctly `no-store`) and the browser falls back. Unblocked only by the Task 11 migrations and ingest |

## Cross-task findings

| # | Finding | Owner |
|---|---|---|
| F1 | ~~`NEON_*` blank~~ **closed 2026-08-30.** Test-branch credentials generated from the Neon control plane at the owner's instruction and written to both `.env` files (gitignored). `webapp_ro` connectivity confirmed against `br-calm-art-as9qjjef`: reads 66,846 sessions and both Phase 2 columns. **`NEON_SCRAPER_URL` (production write) remains deliberately unset** — production ingest is Task 11's gate | closed; production credential still owner-only |
| F2 | ~~Hardcoded `DATA_DIRECTORY` embeds username `siyima`; unusable on this device~~ **closed 2026-08-30 in the pipeline itself.** Task 2 taught the ingest and publish scripts `TUNNIPLAAN_DATA_DIR` but left `26s_pipeline.py:35` hardcoded, so the first attempt at Task 11's scrape died on `PermissionError: Access is denied: 'C:\Users\siyima'` before any network call. `ensure_directories()` now resolves the artifact directory from `TUNNIPLAAN_DATA_DIR` via the repo's own `load_env_file`, with the root as its parent; 172 scraper tests still pass | closed |
| F3 | ~~`contract-test-gettimetable.js` reads a deleted repo-root `sessions.json`~~ **closed in Task 6.** It resolves `--source-dir` > `TUNNIPLAAN_DATA_DIR` now and passes: 66,846 events deep-equal, its first successful run since Phase 1 | closed |
| F4 | `groups` and `courses` are empty **in production** (0 rows). The disposable branch is now fully populated by Task 3, which is what unblocked Task 6; production stays empty until Task 11 | Task 11 |
| F5 | The map key is `groupToFacultyMap` (camelCase), not snake_case | Task 4 |
| F6 | ~~Live `semesters.scraping_datetime` (`16:43`) disagreed with the source pair (`17:05`)~~ **closed on the test branch by Task 3's ingest**, which writes `17:05`. Production still shows `16:43` until Task 11 | Task 11 |
| F7 | `db/roles.sql` **was** applied: `webapp_ro` holds SELECT only on all four tables (closes handoff finding 7) | resolved |
| F8 | `npm` is usable here, contradicting the recorded group-policy block; unverified for real installs | informational |
| F11 | The disposable branch is now also the **Phase 2 integration test target** — `NEON_TEST_SCRAPER_URL` / `NEON_TEST_DATABASE_URL` (scraper) and `NEON_DATABASE_URL` (webapp local) all point at it. Reused rather than creating a second full copy of production data. Netlify's production env is untouched | Task 3 onward |
| F9 | Disposable Neon branch `phase2-task1-migration-test` (`br-calm-art-as9qjjef`) holds a copy of production data and one additional, **redundant** `webapp_ro → neondb_owner` membership row (production already grants that membership via `cloud_admin`). Delete after Task 1's review — needs owner approval | owner, after Task 1 review |
| F10 | `db/roles.sql` needs no change for the new columns: table-level grants extend to columns added later (verified both by catalog and by acting as the role) | Task 10 runbook |
| F12 | **DDL needs an owner credential.** `db/migrations/20260830_one_active_semester.sql` cannot be applied by `scraper_rw` (`must be owner of table semesters`) or `webapp_ro`. Task 1's migration only worked because the Neon control plane acts as owner. Task 11 needs a third, owner-level credential for both migrations | Task 10 runbook, Task 11 |
| F13 | Task 7 must keep applying `stripGroupLocationSuffix()` to the manifest's group map: 60 of 430 keys still carry location suffixes, and dropping the strip would make those groups unreachable again | Task 7 |
| F14 | Task 7's sync indicator must fall back to the semester label if `scraping_datetime` is null — the manifest serves null rather than 503-ing the site over a cosmetic field | Task 7 |
| F15 | `total_pages: 0` is a legal manifest meaning an empty dataset. Task 7 must show the fallback rather than fetching page 0, which correctly 404s | Task 7 |
| F16 | **The production scrape cannot run on this device.** Group policy refuses to launch executables from user-writable paths (`%APPDATA%`, `C:\Projects`, `%TEMP%` all verified), so Selenium Manager cannot run and `webdriver.Edge()` raises `NoSuchDriverException`. Edge itself is installed and allow-listed; no `msedgedriver` exists anywhere on the machine. Same policy class as F8's `npm` block. Unblocked only by an admin placing `msedgedriver.exe` in an allow-listed directory, or by scraping from an unpoliced machine. Task 9's CDP-attach approach sidesteps this for *verification* but not for scraping | Task 11, owner |
| F17 | `26s_pipeline.py:285` prints an emoji in its WebDriver friendly-error handler. Under redirected stdout the console codepage is cp1257, so the handler crashes with `UnicodeEncodeError` and buries the real cause — every unattended failure reports the wrong problem. Not fixed; outside the scrape's scope | open |

## Deviations from the plan

| # | Deviation | Rationale |
|---|---|---|
| D1 | Task 0's final step named `.superpowers/sdd/phase2-progress.md`; the ledger was created at `docs/superpowers/sdd/` and the plan line corrected | leftover from review pass 1's B2 fix; §1.1 already specified `docs/superpowers/sdd/` |
| D2 | Neon was inspected through the Neon control plane rather than a `webapp_ro` psql session | `NEON_DATABASE_URL` is not yet available; the queries were read-only `information_schema` and `count(*)` reads, and grants were verified directly. A `webapp_ro` connectivity check is carried into Task 4 |
| D3 | Task 0's "Expected evidence" said `No tracked commit`, but §1.1 requires the ledger, brief, and report to be tracked and committed with the task. The bullet was corrected to forbid tracked *application-code, schema, or data* commits, which is what Task 0 actually means | same class of leftover as D1; raised by the Task 0 independent reviewer |
| D6 | Source-directory resolution stops at two tiers (`--source-dir` > `TUNNIPLAAN_DATA_DIR`) instead of spec §7.2.2's three; the webapp scripts have no "configured default" | there is no sane default in this repo — the artifacts live in the scraper's data directory, and Task 0 proved the hardcoded default is wrong on any machine but one. A silent fallback is how a contract test passes against the wrong data. Raised by the Task 6 reviewer and accepted |
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
