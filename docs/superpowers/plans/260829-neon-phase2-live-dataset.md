# Neon Phase 2 — Live Course Dataset Implementation Plan

**Date:** 2026-08-29
**Status:** Draft — pending review
**Branch:** dev

> **For downstream agents:** execute this plan through the repository's SDD controller
> pattern. Work one task at a time, write a task brief and report, require independent
> diff review, and loop on findings before advancing. Do not interpret this draft as
> authorization to mutate production.

**Goal:** Make every routine timetable refresh deployment-free by atomically ingesting
semester, group, course, and session data into Neon and loading a version-consistent
dataset through bounded Netlify APIs.

**Architecture:** The scraper validates two production JSON artifacts and replaces the
active semester's four Neon data sets inside one transaction. The browser first fetches
a small uncached manifest, then bounded immutable course pages keyed by a SHA-256
dataset version. Calendar requests carry the same version. The static course JSON stays
as a temporary rollback path.

**Tech stack:** Python 3, psycopg 3, Postgres/Neon, Node.js CommonJS,
`@neondatabase/serverless`, Node built-in tests, vanilla JavaScript, Netlify Functions.

**Specification:**
`docs/superpowers/specs/260829-neon-phase2-live-dataset.md`. Read it completely before
starting and after every context compaction.

---

## 1. SDD controller protocol

### 1.1 Execution ledger

At execution start, create these untracked controller artifacts under
`.superpowers/sdd/` without overwriting the Phase 1 files:

```text
phase2-progress.md
phase2-task-01-brief.md
phase2-task-01-report.md
phase2-review-<base>..<head>.diff
...
```

`phase2-progress.md` records:

- both repository paths, branches, and starting commit SHAs;
- worktree state before each task;
- task status (`pending`, `implementing`, `review`, `fixing`, `complete`);
- implementation and fix commit ranges;
- commands run and concise results;
- deviations approved by the controller/user;
- cross-task findings and the task that owns them;
- production checkpoints and explicit approval text.

### 1.2 Per-task loop

For every task below, the controller must perform this loop:

1. **Brief:** Copy the task into a standalone brief with exact scope, files, interfaces,
   preconditions, forbidden work, and verification commands. Include relevant local
   `AGENTS.md`/`CLAUDE.md` constraints.
2. **Baseline:** The implementer records targeted tests before editing. If a required
   baseline test already fails, stop and assign ownership; do not normalize it away.
3. **Red:** Add or identify a test/check that fails for the missing behavior.
4. **Green:** Implement the smallest coherent change that satisfies the brief.
5. **Refactor:** Remove duplication only inside task scope; preserve wire contracts.
6. **Verify:** Run every command in the brief and record actual output, not “should
   pass.”
7. **Self-review:** Inspect `git diff --check`, `git diff --stat`, full diff, and status.
   Confirm no secrets, generated data, or unrelated user changes are included.
8. **Commit:** Make one or more focused commits using plain imperative messages.
9. **Independent review:** A reviewer reads the spec, brief, report, and complete
   `base..head` diff, reruns proportionate checks, and returns findings ordered by
   severity with file/line evidence.
10. **Fix loop:** Any Critical or Important finding returns to an implementer as a
    narrow fix brief. Review the expanded commit range again. Repeat until approved.
11. **Ledger:** Mark complete only when evidence and review are clean. Advance one task.

An implementer's self-review is not the independent review. A task with no code diff
still needs controller verification, but does not need a synthetic review diff.

### 1.3 Cross-repository discipline

- Capture and preserve both worktrees independently. Existing changes belong to the
  user.
- Do not make one mixed commit spanning repositories. Each repo has its own commit
  range and test evidence.
- The scraper producer contract lands and passes against a non-production Neon branch
  before the webapp depends on it.
- The webapp read endpoints land before the frontend cutover.
- Never write credentials into a brief, report, command transcript, or tracked file.
- Do not push, merge, deploy, apply production DDL, or ingest production data before
  Task 11's explicit user gate.

### 1.4 Branch topology for a separable rollout

Create implementation branches only after this plan is reviewed:

```text
scraper dev
  `-- phase2-neon-ingest        Tasks 2, 3, scraper half of Task 10

webapp dev
  `-- phase2-api                Tasks 1, 4, 5, 6
        `-- phase2-frontend     Tasks 7, 8, 9, webapp half of Task 10
```

`phase2-frontend` is based on the reviewed head of `phase2-api`. This permits Task 11
to merge/deploy only the additive API branch first. After API parity and the first
atomic production ingest pass, the frontend branch can be merged into the now-updated
`dev` branch without cherry-picking or rewriting history.

If repository branch policy requires different names, preserve the same ancestry and
two-stage separation. Record exact branch names and SHAs in the ledger.

## 2. Global implementation constraints

- Preserve the exact old course object field names/types and session wire contract.
- The browser must never render partial pages or mix dataset versions.
- Page size is fixed at 200; serialized page bodies must remain below 4.5 MiB.
- `getDatasetManifest` is `no-store`; large responses are versioned and cacheable.
- `webapp_ro` remains the only credential available to Netlify Functions.
- `scraper_rw` remains outside the webapp runtime and browser.
- Production ingest uses one transaction. The existing non-atomic
  `scripts/seed-sessions-from-json.js` is not the production daily path.
- Test scrape output (`*_test.json`) can never reach production Neon.
- All new user-facing messages have Estonian and English text.
- No framework, bundler, TypeScript, ORM, or broad formatting rewrite.
- Preserve LF in scraper `.py` files and avoid whole-file line-ending churn.
- Keep `unified_courses.json` deployable as fallback until Task 12's observation gate.

## 3. Task dependency map

```text
Task 0 baseline
  |
  +--> Task 1 schema/version columns
  |       |
  |       +--> Task 2 producer validation + deterministic mapping
  |               |
  |               +--> Task 3 atomic ingest + rollback proof
  |
  +--> Task 4 manifest endpoint
          |
          +--> Task 5 paged courses endpoint
                   |
                   +--> Task 6 source-vs-API contract gate
                            |
                            +--> Task 7 frontend loader + sync date
                                     |
                                     +--> Task 8 versioned calendar
                                              |
                                              +--> Task 9 local E2E
                                                       |
                                                       +--> Task 10 docs/runbook
                                                                |
                                                                +--> Task 11 staged rollout
                                                                         |
                                                                         +--> Task 12 gated cleanup
```

Tasks 2–3 modify the scraper repo. Tasks 1 and 4–12 primarily modify the webapp
repo, with cross-repo docs in Task 10.

---

## Task 0: Freeze baselines and create the Phase 2 ledger

**Repositories:** both
**Mutation:** controller artifacts only; no tracked code

### Interfaces

- Produces the authoritative base SHA and dirty-worktree inventory for each repo.
- Confirms toolchain versions and current test baselines.
- Confirms the actual Neon table/column/row state using read-only queries.

### Steps

- [ ] Record `git branch --show-current`, `git rev-parse HEAD`, `git status --short`,
  and `git lfs ls-files` in both repositories.
- [ ] Record `node --version`, `npm --version`, `python --version`, and
  `python -m pytest --version`.
- [ ] Run the webapp baseline:

  ```powershell
  npm test
  node --check main.js
  ```

- [ ] Run the scraper baseline:

  ```powershell
  python -m pytest tests/ -q
  python -m py_compile 26s_pipeline.py publish_to_webapp.py
  ```

- [ ] Through `webapp_ro`, query only column names, active semester code/version, and
  table counts. Do not print the connection string. Record whether `dataset_version`
  and `ingested_at` already exist.
- [ ] Measure current source bytes using a deterministic script: raw JSON, compact
  envelope, largest 200-course page, and source counts.
- [ ] Create `.superpowers/sdd/phase2-progress.md` and attach all evidence.

### Stop conditions

- Either tracked worktree has changes that overlap planned files and ownership is
  unclear.
- Baseline tests fail for an unrelated reason.
- The live schema differs materially from `db/schema.sql`; document and re-plan Task 1.

### Expected evidence

- Clean or fully inventoried worktrees.
- Webapp and scraper baseline results.
- Current DB counts and schema state without secret output.
- No tracked commit.

---

## Task 1: Add dataset identity columns and an idempotent migration

**Repository:** `C:\Projects\tunniplaan`

### Files

- Modify: `db/schema.sql`
- Create: `db/migrations/20260829_phase2_dataset_version.sql`
- Create or modify: targeted schema verification test/script, only if needed

### Interfaces

- Produces nullable `semesters.dataset_version text` and
  `semesters.ingested_at timestamptz` on an existing database.
- Produces the same columns in clean schema creation.
- Does not mutate production in this task.

### Loop

- [ ] **Red:** Add a static schema assertion or verification command that fails because
  the columns are absent from `db/schema.sql`.
- [ ] Add both columns to the clean schema.
- [ ] Write an idempotent migration using `ADD COLUMN IF NOT EXISTS`.
- [ ] Apply the migration to a disposable Neon branch using its admin/test credential.
- [ ] Apply it a second time; it must succeed without duplicate-column errors.
- [ ] Verify `webapp_ro` can select the new columns and still cannot update them.
- [ ] Run `npm test`, `git diff --check`, and inspect the full diff.
- [ ] Commit, for example: `Add Phase 2 dataset identity columns`.
- [ ] Independent reviewer verifies migration idempotence and role isolation.

### Forbidden

- No production DDL.
- No `NOT NULL` constraint before the first ingest backfills existing rows.
- No new uniqueness constraint on `is_active`.
- No credential changes.

### Completion evidence

- First and second test-branch migration outputs.
- `information_schema.columns` result showing both columns.
- Read-only mutation denial.
- Clean review verdict.

---

## Task 2: Extract producer validation and deterministic row mapping

**Repository:** `C:\Projects\scrape_taltech_tunniplaan`

### Files

- Create: `data_contract.py` (or an equivalently named import-safe module)
- Modify: `publish_to_webapp.py`
- Create: `neon_ingest.py` with pure mapping/version helpers only at this stage
- Create: `tests/test_data_contract.py`
- Create: `tests/test_neon_ingest.py`
- Modify: `.gitignore` to ignore `.env` before any local credential file is considered

### Interfaces

- Existing `publish_to_webapp.py --dry-run` keeps its validation behavior.
- Validation functions accept explicit data/path arguments and have no hardcoded
  side effects.
- `compute_dataset_version(unified_bytes, sessions_bytes)` implements the exact
  SHA-256 + NUL contract.
- Pure row builders convert the source envelope into semester, group, course, and
  session database rows without connecting to Neon.

### Loop

- [ ] Run `python -m pytest tests/ -q` before edits.
- [ ] **Red:** Add tests for missing top-level keys, duplicate course IDs, bad status,
  production/test filename rejection, bare group keys, and deterministic versioning.
- [ ] Move/refactor validation from `publish_to_webapp.py` without changing messages or
  warning/error classification unless the spec strengthens it.
- [ ] Implement pure mapping functions. Assert exact field coverage against fixture
  course/session objects.
- [ ] Ensure `study_programmes_et/en` combine into one JSONB value and can be split
  losslessly.
- [ ] Add tests proving source objects are not mutated by mapping.
- [ ] Verify the real production files in `--dry-run` mode and record counts/version.
- [ ] Run:

  ```powershell
  python -m pytest tests/ -q
  python -m py_compile data_contract.py neon_ingest.py publish_to_webapp.py
  python publish_to_webapp.py --dry-run
  git diff --check
  git diff -w --stat
  ```

- [ ] Commit, for example: `Extract validation and Neon row mapping`.
- [ ] Independent reviewer compares validator behavior before/after and checks no
  import-time filesystem/database action exists.

### Stop conditions

- Refactoring changes the generated JSON contract.
- Real production validation changes from pass to fail for an unplanned reason.
- A test requires a live database; live behavior belongs to Task 3.

### Completion evidence

- Fixture and real-file validation outputs.
- Deterministic version test vector recorded in the report.
- Zero database connections during unit tests and dry mapping tests.

---

## Task 3: Implement and prove the atomic Neon ingest

**Repository:** `C:\Projects\scrape_taltech_tunniplaan`

### Files

- Modify: `neon_ingest.py`
- Create: `requirements-neon.txt`
- Create: `tests/test_neon_ingest_integration.py`
- Modify: `README.md` only for temporary developer setup notes if essential; full docs
  remain Task 10

### Interfaces

- CLI:

  ```text
  python neon_ingest.py [--source-dir PATH] [--dry-run]
  ```

- Production writes require `NEON_SCRAPER_URL`.
- Integration tests require separately named test credentials such as
  `NEON_TEST_SCRAPER_URL` and `NEON_TEST_DATABASE_URL`; tests skip clearly when absent.
- The command validates before connecting, uses one transaction, verifies counts before
  commit, and prints one `INGEST OK` receipt after read-only post-check.

### Loop

- [ ] Add/install psycopg 3 through `requirements-neon.txt`; do not rewrite unrelated
  Python dependency management.
- [ ] **Red unit tests:** missing credentials fail cleanly, `--dry-run` never calls the
  connector, test artifacts are rejected, and secrets are absent from errors.
- [ ] Implement one transaction using bounded bulk insert/COPY operations. Target
  practical completion below five minutes for the current ~67k sessions.
- [ ] Keep the transaction function injectable so integration tests can trigger a
  deliberate exception after destructive statements but before commit.
- [ ] Seed dataset A into a disposable/test Neon branch and record version/counts.
- [ ] Attempt dataset B (or a modified fixture) with the injected failure. Verify after
  rollback that version and all counts remain exactly A.
- [ ] Ingest B successfully; verify version/counts become exactly B.
- [ ] Re-ingest identical B; verify idempotent final counts and same deterministic
  version.
- [ ] Verify exactly one active semester and `ingested_at` is populated.
- [ ] Verify with read-only credentials and prove they cannot mutate.
- [ ] Run full scraper tests, compile checks, dry-run against real artifacts, and
  integration tests against the disposable branch.
- [ ] Inspect logs/reports for accidental URL/password exposure before committing.
- [ ] Commit, for example: `Add atomic Neon dataset ingest`.
- [ ] Independent reviewer reruns the rollback scenario and inspects transaction scope.

### Hard stop conditions

- Only production credentials are available. Create/use a disposable branch; do not
  test rollback against production.
- Any statement runs outside the intended transaction.
- Count checks occur only after commit.
- Integration failure changes the previously visible test dataset.
- Credentials appear in output or tracked files.

### Completion evidence

- Dataset A receipt.
- Injected-failure output and unchanged A version/counts.
- Dataset B receipt and idempotent rerun.
- Transaction duration and peak page/source counts.
- Clean independent review.

---

## Task 4: Add the uncached dataset manifest endpoint

**Repository:** `C:\Projects\tunniplaan`

### Files

- Create: `netlify/functions/getDatasetManifest.js`
- Create: `tests/functions/getDatasetManifest.test.js`
- Optionally create: a narrowly scoped shared DB helper used by Phase 2 functions

### Interfaces

- Exact contract: specification section 9.1.
- Fixed `PAGE_SIZE = 200`.
- Exports `handler` and an injected-client `handleRequest` for deterministic tests.
- Uses only `NEON_DATABASE_URL`.

### Loop

- [ ] **Red:** Add tests for success envelope, ISO dates, group map folding, numeric
  counts/pages, no-store header, missing active dataset/version, query failure, and
  missing environment variable.
- [ ] Implement parameterized read-only queries. Do not reuse the five-minute active
  semester cache from the legacy calendar path; manifest freshness is the invalidation
  mechanism.
- [ ] Assemble semester metadata, group map, course count, and page count in one SQL
  statement/snapshot so an ingest cannot split the manifest across versions.
- [ ] Ensure duplicate group codes cannot silently overwrite conflicting faculty codes;
  return/log an error if the DB invariant is violated.
- [ ] Run `npm test` and `node --check netlify/functions/getDatasetManifest.js`.
- [ ] Inspect error logs for secret-safe content.
- [ ] Commit, for example: `Add live dataset manifest endpoint`.
- [ ] Independent review reruns tests and checks exact cache/error contracts.

### Completion evidence

- Unit-test output.
- Sample fixture response matching the spec.
- No-store and content-type header assertions.

---

## Task 5: Add the versioned paged course endpoint

**Repository:** `C:\Projects\tunniplaan`

### Files

- Create: `netlify/functions/getCourses.js`
- Create: `tests/functions/getCourses.test.js`

### Interfaces

- Exact contract: specification section 9.2.
- Requires lowercase 64-hex `version` and zero-based integer `page`.
- Returns at most 200 courses ordered by ID.
- Casts `eap` to a JSON number and splits `study_programmes` back to source fields.

### Loop

- [ ] **Red:** Add tests for valid page, exact field/type mapping, deterministic order,
  malformed inputs (400), stale version (409), out-of-range page (404), and DB failure
  (500).
- [ ] Add a test containing null/empty scalar and JSONB values from real source shapes.
- [ ] Implement count/version check and page query using one consistent active-version
  predicate in one SQL statement/snapshot. Do not remember a semester code in one
  statement and query its pages in another.
- [ ] Serialize the largest fixture page and assert it is below 4.5 MiB.
- [ ] Run full tests and syntax checks.
- [ ] Commit, for example: `Add versioned paged course endpoint`.
- [ ] Independent reviewer checks SQL parameterization, output field completeness, and
  platform headroom.

### Completion evidence

- Test matrix with HTTP statuses.
- Largest unit-fixture page bytes.
- Full selected course key list compared with current source keys.

---

## Task 6: Build the source-to-Neon-to-API contract gate

**Repository:** `C:\Projects\tunniplaan`

### Files

- Create: `scripts/contract-test-getcourses.js`
- Modify: `scripts/contract-test-gettimetable.js` only if needed for dataset version
  support; final calendar behavior lands in Task 8
- Optionally add npm scripts with explicit names; do not overload the fast unit suite
  with credential-dependent integration tests

### Interfaces

- Reads local `unified_courses.json` only as the expected contract fixture.
- Calls the manifest and every course page through exported handlers using
  `NEON_DATABASE_URL`.
- Reassembles the old four-part envelope and requires canonical deep equality.
- Reports count, page count, and maximum serialized response bytes.

### Loop

- [ ] **Red:** Run against an empty/unseeded test branch and confirm a clear non-zero
  failure rather than a vacuous pass.
- [ ] Ingest the matching source artifacts into the test branch with Task 3.
- [ ] Require non-zero source courses/groups and exact final count.
- [ ] Canonicalize object key order and course order only; do not normalize values or
  coerce types to make differences disappear.
- [ ] Fail on first mismatch with a bounded diagnostic that identifies field/course but
  does not dump megabytes.
- [ ] Assert every page version equals the manifest and every page is below 4.5 MiB.
- [ ] Run the existing session contract test as a regression.
- [ ] Commit, for example: `Add course dataset contract test`.
- [ ] Independent reviewer reruns the test against the same branch and confirms no
  permissive normalization.

### Completion evidence

Expected terminal receipt shape:

```text
COURSE CONTRACT OK version=<sha> courses=1030 groups=430 pages=6 max_page_bytes=<n>
```

Also record session contract output and source/DB row counts.

---

## Task 7: Add the browser course loader and make sync text single-source

**Repository:** `C:\Projects\tunniplaan`

### Files

- Create: `course-data.js`
- Create: `tests/frontend/course-data.test.js`
- Modify: `index.html`
- Modify: `main.js`

### Interfaces

- `course-data.js` exposes a small browser API and CommonJS test exports without a
  framework or bundler.
- It fetches manifest/pages, enforces bounded concurrency, validates completeness, and
  retries one version race.
- It returns the existing envelope plus `dataset_version` and source/fallback status.
- `main.js` stores `activeDatasetVersion` and `lastSyncDate`.

### Loop

- [ ] **Red unit tests:** out-of-order pages assemble correctly; duplicate/missing page
  fails; mismatched version triggers one full retry; second race fails; count mismatch
  fails; concurrency never exceeds four; API failure invokes static fallback only when
  enabled.
- [ ] Implement `course-data.js` with injectable `fetch` for Node tests.
- [ ] Load it before `main.js` in `index.html`.
- [ ] Replace `DATA_URL_UNIFIED_COURSES` initialization with the loader result.
- [ ] Remove the inline second `unified_courses.json` fetch from `index.html`.
- [ ] Remove the accidental top-level `updateSyncInfoText(syncDate)` DOM-global
  dependency and duplicate language-toggle listener.
- [ ] Make `updateSyncInfoText(lastSyncDate)` render from stored state during initial
  load and language change.
- [ ] Add a bilingual backup-data notice when static fallback is active.
- [ ] Disable calendar view while static fallback is active and explain why in both
  languages; do not query current unversioned sessions against old course metadata.
- [ ] Add visibility-based manifest freshness check, throttled to at most once per five
  minutes, and a bilingual reload notice.
- [ ] Preserve URL query parameters on reload by using normal page reload behavior.
- [ ] Run:

  ```powershell
  npm test
  node --check course-data.js
  node --check main.js
  git diff --check
  ```

- [ ] Commit, for example: `Load versioned course data from Neon`.
- [ ] Independent reviewer checks partial-data rejection, fallback honesty, language
  behavior, and removal of the duplicate 5+ MB fetch.

### Stop conditions

- Main UI can initialize before all pages validate.
- Fallback displays the manifest's newer sync date over old static cards.
- Retry can loop indefinitely.

### Completion evidence

- Unit-test output including race/fallback cases.
- Network trace showing one manifest plus expected page count and no static fetch on
  success.
- ET/EN sync text screenshots or DOM evidence using the manifest date.

---

## Task 8: Version calendar requests and handle stale tabs

**Repository:** `C:\Projects\tunniplaan`

### Files

- Modify: `netlify/functions/getTimetable.js`
- Modify: `tests/functions/getTimetable.test.js`
- Modify: `main.js`
- Modify: `scripts/contract-test-gettimetable.js`

### Interfaces

- Versioned request behavior is specification section 9.3.
- Unversioned requests preserve backward compatibility during rollout.
- A 409 never merges sessions into course objects.

### Loop

- [ ] **Red:** Add tests for matching version, stale version 409 before count/row query,
  malformed version 400, versioned cache header, and unchanged unversioned behavior.
- [ ] Refactor active-semester lookup so a versioned request cannot be served using a
  stale warm-lambda semester cache.
- [ ] Preserve count-first limiting only with version checks in both snapshots. Make
  the row statement return one envelope row containing `version_match` plus the array,
  even for zero sessions, so a between-query ingest becomes 409 rather than a false
  empty success.
- [ ] Add `version=${activeDatasetVersion}` to new-frontend calendar requests.
- [ ] On 409, discard response and present/reuse the reload-new-data path. Limit any
  automatic reload to one attempt.
- [ ] Extend the session contract script to send the source dataset version and reject a
  vacuous zero-course test.
- [ ] Run all unit and both credentialed contract tests.
- [ ] Commit, for example: `Keep calendar requests on one dataset version`.
- [ ] Independent reviewer checks legacy compatibility, query short-circuiting, and
  cache semantics.

### Completion evidence

- Unit-test status matrix.
- Stale-version request showing 409 and zero session-row queries.
- Versioned session deep-equality receipt.

---

## Task 9: Local full-stack and browser regression gate

**Repository:** `C:\Projects\tunniplaan`
**Mutation:** verification artifacts only; no feature code unless a finding creates a
reviewed fix loop

### Preconditions

- Test Neon branch contains a source-matching atomic ingest.
- Local Netlify Dev reads the test branch through a read-only URL.
- Any temporary `.env` switch is backed up and restored byte-for-byte without printing
  secrets.

### Checks

- [ ] Start `npm run dev:netlify` and verify:
  - manifest 200 + `no-store`;
  - every course page 200 + versioned cache policy;
  - no page near 4.5 MiB;
  - stale version 409;
  - versioned timetable array and limit envelope;
  - malformed inputs return specified statuses.
- [ ] Browser regression matrix:
  - initial card load and results count;
  - ET/EN switch and accurate sync date;
  - faculty/institute/group/EAP/language filters;
  - one group calendar;
  - multiple comma-separated groups;
  - card/calendar course-set agreement;
  - URL reload state;
  - CSV export;
  - stale-version/new-data notice;
  - simulated API failure uses complete fallback, honest old date, and disabled
    calendar retrieval.
- [ ] Confirm successful API load makes no request to `unified_courses.json`.
- [ ] Record browser console errors; unrelated warnings must be identified, not hidden.
- [ ] Stop the server and restore temporary environment files exactly.
- [ ] Run final `npm test`, syntax checks, and both contract scripts.

### Review loop

No implementation commit is expected. Any finding becomes a fix task against the
owning prior task, followed by that task's independent re-review and a complete Task 9
rerun.

### Completion evidence

- HTTP/header matrix.
- Browser matrix with pass/fail and concrete observations.
- Zero unexpected console errors.
- Restored worktree/environment confirmation.

---

## Task 10: Replace the operational contract and write the no-deploy runbook

**Repositories:** both

### Webapp files

- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Create: `docs/DATA_REFRESH.md` if the operator runbook belongs here; otherwise link
  to the scraper's canonical runbook

### Scraper files

- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/data-contract.md`
- Modify: `publish_to_webapp.py` messaging to mark file-copy publication as rollback
  only
- Create: `docs/neon-refresh-runbook.md`

### Required runbook flow

```text
1. Run offline tests.
2. Run test scrape.
3. Run full non-headless scrape.
4. Validate/dry-run ingest.
5. Atomically ingest Neon.
6. Run course and session contract verification.
7. Open production and confirm displayed sync date/version behavior.
```

The routine section must contain no `git add`, `git commit`, `git push`, Netlify build
hook, or Netlify deploy step.

### Loop

- [ ] Update architecture diagrams and all statements that still say course metadata is
  loaded from static JSON as the normal path.
- [ ] Clearly distinguish local generated JSON (source/backup) from deployed runtime
  data (Neon).
- [ ] Document credentials by environment-variable name only.
- [ ] Document transaction rollback, post-check receipt, stale-tab behavior, cache
  versioning, and recovery through the static fallback.
- [ ] Preserve `npm run dev` vs `npm run dev:netlify` distinctions.
- [ ] Grep both repos for stale workflow terms and triage every hit:

  ```powershell
  rg -n -S "publish_to_webapp|unified_courses.json|seed-sessions-from-json|git add|Netlify|scraping_datetime" README.md CLAUDE.md AGENTS.md docs
  ```

- [ ] Run both repos' test suites after documentation/script messaging changes.
- [ ] Commit separately in each repo with focused messages.
- [ ] Independent reviewer reads the runbook as a cold downstream operator and reports
  any missing command, ambiguous environment, or deploy-coupled step.

### Completion evidence

- Cold-run review verdict.
- Grep triage table.
- Canonical routine refresh commands with expected receipts.

---

## Task 11: Staged dev and production rollout

**Repositories/systems:** both repos, test Neon, production Neon, Netlify dev and main
**External mutation:** yes

### Hard user checkpoint

Before any production DDL, production ingest, merge to `main`, push, or production
deploy, present:

- all completed task/review statuses;
- both contract receipts;
- atomic rollback proof;
- local browser matrix;
- exact commits proposed for deployment;
- rollback command/commit path;
- confirmation that the old production frontend remains static until additive APIs are
  verified.

Proceed only after explicit approval.

### Stage A: additive APIs

- [ ] Merge only the reviewed `phase2-api` branch into `dev`; push and verify the branch
  deploy. Do not include `phase2-frontend` commits in this stage.
- [ ] Apply migration to production Neon only after approval; verify columns and
  read-only access.
- [ ] Promote the additive API commit range to production while the production frontend
  still uses static JSON.
- [ ] Verify old cards/calendar remain unchanged.

### Stage B: first production atomic ingest

- [ ] Run scraper `--dry-run` and record source counts/version/date.
- [ ] Run the atomic production ingest once.
- [ ] Verify database receipt with read-only credentials.
- [ ] Call production manifest/course pages directly and run both contract tests against
  production Neon.
- [ ] If parity fails, do not cut over the frontend. Static production remains intact.

### Stage C: frontend cutover

- [ ] Rebase-free merge the reviewed `phase2-frontend` descendant into the updated
  `dev`; deploy and complete the full Task 9 browser matrix on the branch URL.
- [ ] Merge/push to `main` only after dev passes and approval scope includes it.
- [ ] Verify production network requests, sync date, cards, filters, one-group and
  multi-group calendars, URL reload, and CSV.
- [ ] Record function logs and response sizes without secrets.

### Stage D: prove deployment-free refresh

On the next real scrape (or an approved production-safe data refresh):

- [ ] Record Netlify's current production deploy ID/time.
- [ ] Confirm both Git worktrees are clean.
- [ ] Run scrape -> dry-run -> atomic ingest -> contract checks only.
- [ ] Confirm the Netlify deploy ID/time did not change.
- [ ] Fresh-load production and verify the new sync date/version and changed data.
- [ ] Confirm both Git worktrees still have no tracked data changes.

### Rollback

- Before frontend cutover: no app rollback is needed; leave static production active.
- After cutover: redeploy the last static-loader commit. Do not delete Neon data while
  diagnosing.
- If an ingest fails before commit: verify the previous version remains active; rerun
  only after correcting the source/tooling.
- If post-commit verification fails: keep the frontend on/fall back to the static
  artifact and investigate; do not perform ad-hoc destructive SQL.

### Completion evidence

- Additive API and frontend deploy IDs/commit SHAs.
- Production contract receipts.
- Before/after sync dates and dataset versions.
- Proof that Stage D changed data without a deploy.

---

## Task 12: Observation-period cleanup (separately gated)

**Repositories:** both
**Gate:** at least two successful production atomic ingests and 48 hours stable; prefer
retaining fallback through the planned two-week high-change period unless the user
chooses earlier cleanup.

### Candidate cleanup

- Remove the normal static fallback from `course-data.js` after confirming desired
  outage behavior.
- Remove `unified_courses.json` from the webapp worktree/Git LFS.
- Retire `publish_to_webapp.py` file-copy behavior or convert it to validation/ingest
  guidance only.
- Remove the obsolete webapp `scripts/seed-sessions-from-json.js` after the scraper
  ingest has proven operational and its unique recovery value is documented.
- Update docs and contract tests so local source files are read from the scraper output
  path or explicit fixture path rather than a tracked webapp asset.

### LFS caution

The current `.gitattributes` uses a broad `*.json` LFS rule, and `git lfs ls-files`
currently includes `package.json`, `package-lock.json`, and `unified_courses.json`.
Do not simply delete the rule or rewrite LFS history. Write a dedicated cleanup brief
that preserves package-file integrity, verifies staged blobs are real JSON rather than
LFS pointers, and avoids unrelated history migration.

### Verification

- [ ] Full unit, contract, and browser suites pass without the static file.
- [ ] Fresh clone/LFS behavior is verified.
- [ ] Routine refresh runbook remains deploy-free.
- [ ] Production deploy without the static file passes before deleting any recovery
  documentation.
- [ ] Independent whole-branch review approves cleanup.

---

## 4. Final whole-change review

After Task 11 (and again after Task 12 if executed), dispatch an independent reviewer
over the full commit ranges in both repositories. The reviewer must inspect:

- spec compliance and omitted acceptance criteria;
- transaction boundaries and rollback proof;
- producer/database/API field mapping;
- stale-version and cache behavior;
- Netlify payload headroom;
- secrets and role separation;
- frontend partial-load/fallback paths;
- bilingual text and existing calendar behavior;
- docs/runbook accuracy;
- unrelated changes and line-ending churn.

Critical or Important findings reopen the owning task and repeat its fix/review loop.
The controller then reruns Task 9 and the relevant Task 11 production-safe checks.

## 5. Definition of done

Phase 2 is complete when:

- all non-cleanup tasks are marked complete in the Phase 2 ledger;
- both full-repo reviewers return ready;
- production cards, filters, sync date, and calendar are Neon-backed and
  version-consistent;
- one subsequent real refresh is proven live without Git or Netlify activity;
- the daily runbook has been cold-reviewed and used successfully;
- rollback remains documented and available;
- no required work is hidden in an unowned “follow-up” note.

---

## Review notes

<!-- Add comments, questions, or change requests here before implementation begins -->
