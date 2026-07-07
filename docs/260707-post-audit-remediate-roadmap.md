# 260707-post-audit-remediate-roadmap

Source materials reviewed:

- `260707-codex5-audit-report.md`
- `260707-codex5-audit-improvement-plan.md`
- `260707-fable5-audit-report.md`
- `260707-fable5-audit-improvement-plan.md`

Date: 2026-07-07  
Target repo: `tunniplaan`  
Target branch: `dev`  
Audience: downstream coding agent, with human owner approval for external services and credential rotation.

---

## 1. Plain-language summary for a non-technical owner

The two audits broadly agree. The app is not badly designed. It is a small, understandable, framework-free web app: the browser loads course data, and one Netlify function filters calendar sessions so the browser does not download the full `sessions.json` file.

The problem is not that the architecture is wrong. The problem is that the repo is fragile for repeated AI-assisted edits. Most app behavior lives in one large `main.js` file, there is almost no automated testing, and several repo rules are written in documentation but are not actually enforced by code or configuration.

The most important issues are:

1. **A real security bug exists.** Search and group values from the URL can be rendered into the page without escaping. A malicious shared link could run JavaScript in another user's browser. The app has no login or sensitive account data, so the impact is limited, but it is still a genuine public-site security issue and should be fixed early.

2. **The app has almost no automated safety net.** `npm test` is currently a placeholder that fails. This means a future agent can change the search, group builder, calendar view, or CSV export and only a human clicking around would catch regressions.

3. **Git LFS is configured too broadly.** Every `.json` file is treated as a large-file asset. That includes `package.json` and `package-lock.json`, which should be normal text files. This makes dependency review and future test fixture files more fragile.

4. **The Netlify build-ignore rule is not actually active.** Documentation says doc-only commits should skip builds, but the effective root `netlify.toml` does not contain the ignore rule. This wastes builds and LFS bandwidth.

5. **Large calendar selections can fail before the app's own limit protects the user.** The client checks the 4000-session limit after downloading the server response. For broad selections, the Netlify function can return too much data and hit a 502 before the client can show a clean message. The function should enforce the limit server-side.

6. **Deployment hooks were exposed.** Build-hook URLs are documented/committed and should be treated as burned. They should be removed from the repo and rotated in Netlify by the owner.

7. **There is ordinary cleanup debt.** Debug logs, duplicated data fetches, stale semester text, Google Analytics ID mismatch, junk `test.txt`, and docs drift do not all break the app, but they create noise and confuse future agents.

The recommended strategy is not a rewrite. Do not add React, Vue, TypeScript, a database, or a new backend just to make the code look modern. The right fix is a staged hardening plan: first fix the repo-state traps, the security bug, the test gate, and server-side limit; then clean up docs and low-risk UI/developer noise; only then consider small helper extraction from `main.js`.

---

## 2. Reconciled priority judgement

The two agents differ mainly in ordering and testing style.

Codex emphasizes a general test layer first, pure helper extraction, docs alignment, and later URL-state cleanup.

Fable is more concrete about the immediate production risks: reflected XSS, over-broad LFS, missing Netlify ignore, null guard, exposed deploy hooks, and server-side 4000-session enforcement. Fable also resolves several open questions: the correct GA ID is `G-S3SQ4PZ2JF`; no Netlify UI ignore rule exists; the main build hook is live and exposed; the dev hook is already dead.

The combined roadmap below follows this reconciliation:

- Use Fable's concrete must-have fixes where evidence is specific.
- Keep Codex's broader engineering goals, but sequence them after the hardening baseline exists.
- Add verification loops to every phase.
- Avoid broad refactors before `npm test` is meaningful.
- Require human approval for anything involving Netlify dashboard, GA dashboard, credentials, build hook rotation, branch merge, or production deploy.

---

## 3. Global execution rules for the downstream agent

Follow these rules for every task.

1. Work only on `dev`. Do not touch `main`.
2. Start with `git status --short` and record dirty files.
3. Use one logical commit per item unless the roadmap explicitly says to fold items together.
4. Do not widen scope. If the evidence differs from the plan, stop and report.
5. After every edit to `main.js`, run:

   ```bash
   node --check main.js
   ```

6. After every edit to `server.js`, run:

   ```bash
   node --check server.js
   ```

7. After every edit to `netlify/functions/getTimetable.js`, run:

   ```bash
   node --check netlify/functions/getTimetable.js
   ```

8. Once `npm test` exists, run it before every commit that touches JS, JSON fixtures, or behavior docs:

   ```bash
   npm test
   ```

9. For calendar, group-builder, URL reload, or visible UI behavior, browser-test using a function-compatible server:

   ```bash
   npm run dev:netlify
   ```

   Do not use `npm run dev` or a Python static server for calendar testing because those do not provide the Netlify function route.

10. Do not load full `sessions.json` in the browser.
11. Do not rewrite Git history.
12. Do not introduce a framework, bundler, TypeScript, database, or broad lint/format churn in this remediation pass.
13. Do not rotate credentials yourself. Ask the owner to do it in the relevant dashboard.
14. Stop if a change requires guessing the external scraper schema.
15. Stop if URL backward compatibility becomes ambiguous.
16. Stop before overwriting unrelated dirty files.

---

## 4. Execution roadmap

### Phase 0 — Preflight snapshot

Goal: capture the actual repo state before touching anything.

Tasks:

1. Run:

   ```bash
   git status --short
   git branch --show-current
   git log --oneline -5
   git lfs ls-files
   ```

2. Confirm the branch is `dev`.
3. Confirm whether these known dirty items exist:
   - `CLAUDE.md` modified
   - old `docs/20250813-Gemini-...` deleted
   - possible `test.txt`
   - possible `.vscode/tasks.json` local-only
4. Do not fix anything in this phase.

Validation:

- Report current branch, dirty files, and LFS-tracked files.
- If branch is not `dev`, stop.

Commit: none.

---

### Phase 1 — Fix Git LFS before adding any JSON test fixtures

Goal: prevent future small JSON files, especially test fixtures, from being silently committed to LFS.

Source basis: both audits identify `*.json` LFS as a high-risk repo-state problem.

Files:

- `.gitattributes`
- `package.json`
- `package-lock.json`

Tasks:

1. Replace `.gitattributes` content with explicit rules only:

   ```text
   sessions.json filter=lfs diff=lfs merge=lfs -text
   unified_courses.json filter=lfs diff=lfs merge=lfs -text
   ```

2. Move `package.json` and `package-lock.json` back to normal Git blobs without rewriting history:

   ```bash
   git rm --cached package.json package-lock.json
   git add .gitattributes package.json package-lock.json
   ```

3. Verify staged package files are real JSON, not LFS pointers:

   ```bash
   git show :package.json | head -5
   git show :package-lock.json | head -5
   git lfs ls-files
   ```

Validation:

- `git lfs ls-files` lists exactly:
  - `sessions.json`
  - `unified_courses.json`
- `git show :package.json | head -5` shows JSON content.
- `npm install --package-lock-only --ignore-scripts` is optional only if package metadata appears changed. Do not run dependency upgrades.

Stop condition:

- If package files still stage as LFS pointers, stop and report. Do not run `git lfs migrate`.

Commit message:

```text
audit M3: restrict LFS to runtime data files
```

---

### Phase 2 — Fix the reflected XSS in active filter pills

Goal: fix the one concrete security bug.

Source basis: Fable identifies URL-derived `search` and `group` values rendered through `innerHTML`; Codex also flags HTML injection risk.

Files:

- `main.js`

Tasks:

1. Add a small HTML escaping helper near existing utility helpers:

   ```js
   const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
     '&': '&amp;',
     '<': '&lt;',
     '>': '&gt;',
     '"': '&quot;',
     "'": '&#39;'
   }[c]));
   ```

2. In active filter pill rendering, escape both the label and value before interpolation.
3. Grep `main.js` for `innerHTML`.
4. Check only user-controlled URL/search/group inputs in this phase. Do not blanket-escape all course data fields in the same commit.

Validation:

```bash
node --check main.js
```

Browser validation via `npm run dev:netlify`:

- Open:

  ```text
  http://localhost:8000/?search=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E
  ```

- The filter pill must show literal text.
- No alert dialog.
- Normal add/remove pill behavior still works.
- Test `?group=<same-payload>` if the group pill path is present.

Stop condition:

- If another direct URL-derived value enters `innerHTML`, report it. Do not chase every data-rendering sink in this commit.

Commit message:

```text
audit M1: escape URL-derived filter pill values
```

---

### Phase 3 — Null-guard the Netlify function

Goal: make the function safe for direct tests and malformed events.

Source basis: both plans identify `event.queryStringParameters.courses` as brittle.

Files:

- `netlify/functions/getTimetable.js`

Task:

Change the course query read to a null-safe form, for example:

```js
const requestedCoursesQuery = event.queryStringParameters && event.queryStringParameters.courses;
```

Validation:

```bash
node --check netlify/functions/getTimetable.js
```

Commit message:

```text
audit M5: guard missing timetable query parameters
```

---

### Phase 4 — Add the first deterministic test gate

Goal: replace the failing placeholder `npm test` with a minimal, useful safety gate.

Source basis: both audits say verification is weak or absent. Fable recommends function smoke tests first; Codex recommends helper tests as the next layer.

Files:

- `package.json`
- `tests/getTimetable.test.js`
- `tests/fixtures/sessions.sample.json`
- `AGENTS.md`

Ordering note: this phase must happen after Phase 1, otherwise `sessions.sample.json` may be committed to LFS.

Smallest safe implementation:

1. Add this `package.json` test script:

   ```json
   "test": "node --check main.js && node --check server.js && node --check netlify/functions/getTimetable.js && node tests/getTimetable.test.js"
   ```

2. Create `tests/fixtures/sessions.sample.json` with around 5 hand-copied session objects:
   - at least 2 course IDs
   - at least one duplicate-session pair sharing course/date/start/end/room with different groups
   - no large fixture copy

3. Create `tests/getTimetable.test.js` as a plain Node script using `assert`.

4. Test cases:
   - `courses=ID1` returns `200` and only `ID1` sessions.
   - missing query returns `200` and `[]`.
   - `queryStringParameters: null` returns `200` and `[]`.
   - after Phase 6, extend this test to cover `tooManySessions`.

5. Use a temp working directory because the handler resolves `process.cwd()/sessions.json`.
   - Copy the fixture to temp dir as `sessions.json`.
   - `process.chdir(tempDir)` for the test call.
   - Restore cwd after test.

6. Update `AGENTS.md` testing guidance:
   - `npm test` is mandatory before commits touching JS behavior.
   - Calendar behavior still requires browser verification with `npm run dev:netlify`.

Validation:

```bash
npm test
```

Negative validation:

- Temporarily break a brace in `main.js`.
- Confirm `npm test` fails.
- Revert immediately.

Stop condition:

- Do not refactor `main.js` into modules in this phase.
- Do not add Jest/Vitest.
- Do not add browser automation yet.

Commit message:

```text
audit M4: add minimal timetable function test gate
```

---

### Phase 5 — Make the Netlify build-ignore rule real

Goal: move the documented build-ignore rule into the only file Netlify actually reads.

Source basis: Fable resolved that no Netlify UI ignore exists and root `netlify.toml` lacks the rule.

Files:

- root `netlify.toml`
- `docs/netlify.toml`
- `docs/README.md`
- `docs/distilled-current-state.md`

Tasks:

1. Copy the effective `[build] ignore` command from `docs/netlify.toml` into root `netlify.toml`.
2. Preserve `[functions] included_files` for `sessions.json`.
3. Ensure watched paths include root app files and config files that should trigger builds, including:
   - `index.html`
   - `main.js`
   - `main.css`
   - `netlify.toml`
   - `netlify/functions/**`
   - `package.json`
   - `package-lock.json`
   - `unified_courses.json`
   - `sessions.json`
4. Deliberately exclude docs-only paths from watched paths.
5. Delete `docs/netlify.toml` or mark it superseded. Prefer deletion because the duplicate copy caused drift.
6. Update active docs so they no longer claim a docs-local config is effective.

Validation:

```bash
npm test
```

Manual deployment validation requires owner workflow:

- Push this config commit to `dev`; it should build because root `netlify.toml` changed.
- Push a later docs-only commit; it should be ignored by Netlify.

Stop condition:

- If Netlify config syntax is unclear, stop and report before pushing.

Commit message:

```text
audit M2: move Netlify build ignore into root config
```

---

### Phase 6 — Enforce the 4000-session limit server-side

Goal: prevent broad selections from producing Netlify 502 responses or multi-megabyte wasted downloads.

Source basis: Fable measured live 502 failures for large selections and found the client-side guard runs too late.

Files:

- `netlify/functions/getTimetable.js`
- `main.js`
- `tests/getTimetable.test.js`

Tasks:

1. Add a constant in the Netlify function:

   ```js
   const CALENDAR_SESSION_LIMIT = 4000; // Keep in sync with main.js
   ```

2. After filtering sessions, before returning the array, return a compact object if the result is too large:

   ```js
   if (filtered.length > CALENDAR_SESSION_LIMIT) {
     return {
       statusCode: 200,
       headers,
       body: JSON.stringify({
         tooManySessions: true,
         count: filtered.length,
         limit: CALENDAR_SESSION_LIMIT
       })
     };
   }
   ```

3. In `main.js`, update the calendar fetch handling:
   - parse response JSON
   - if `tooManySessions === true`, show the existing too-large-selection message using returned `count` and `limit`
   - do not treat the object as a session array
   - preserve existing behavior for normal arrays

4. Extend `tests/getTimetable.test.js` with an oversized fixture case.
   - Keep fixture small by setting the limit injectable only in test if the existing structure allows it without production complexity; otherwise generate many in-memory fixture rows in the test temp `sessions.json`.
   - Do not add production-only test hooks unless necessary.

Validation:

```bash
node --check main.js
node --check netlify/functions/getTimetable.js
npm test
```

Browser validation via `npm run dev:netlify`:

- Select broad filters or all courses.
- Open calendar.
- Confirm user sees a friendly too-many-sessions message.
- Confirm the network tab does not show 502 for the function call.

Stop condition:

- Do not add caching, database, or client-side full-session loading.

Commit message:

```text
audit H7: enforce calendar session limit in function
```

---

### Phase 7 — Fix deploy hook exposure and tracked tooling drift

Goal: make deploy tooling reproducible without committing secrets.

Source basis: Fable found `.vscode/tasks.json` is documented as tracked but gitignored, and build hook URLs are committed in `CLAUDE.md`.

Files:

- `.gitignore`
- `.vscode/tasks.json`
- `package.json`
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`

Tasks:

1. Decide owner preference:
   - Option A: track sanitized `.vscode/tasks.json`.
   - Option B: keep `.vscode/tasks.json` local-only and fix docs.
2. Default to Option A unless owner rejects it.

Option A tasks:

1. Change `.gitignore`:

   ```text
   .vscode/*
   !.vscode/tasks.json
   ```

2. Edit `.vscode/tasks.json` so it contains no raw Netlify build-hook URLs.
3. Add package scripts that read hooks from environment variables, for example:
   - `deploy:main`
   - `deploy:dev`
4. Document required env vars in README:
   - `NETLIFY_HOOK_MAIN`
   - optional `NETLIFY_HOOK_DEV`
5. Remove literal `build_hooks/` URLs from `CLAUDE.md`, README, and AGENTS if present.
6. Explain that the owner must rotate the live main Netlify build hook in Netlify UI. Do not attempt rotation.

Validation:

```bash
grep -R "build_hooks/" -n . --exclude-dir=.git
npm test
```

Expected grep result:

- no literal hook URLs
- only safe explanatory text, if any

Stop condition:

- If `.vscode/tasks.json` contains local machine-specific assumptions that cannot be sanitized cleanly, use Option B and document it as local-only.

Commit message:

```text
audit H5: sanitize deploy tooling and remove hook URLs
```

Owner-only action after commit:

- Rotate the exposed Netlify main build hook.
- Create a new dev hook only if still wanted.
- Update local environment variables outside the repo.

---

### Phase 8 — Commit intentional working-tree cleanup

Goal: resolve known dirty files so future agents start from a clean baseline.

Source basis: both audits saw `CLAUDE.md` modified and old long-form doc deleted; Fable says the rewrite is likely better and the deletion is intentional.

Files:

- `CLAUDE.md`
- deleted `docs/20250813-Gemini-...`
- `test.txt`

Tasks:

1. Review the pending `CLAUDE.md` rewrite.
2. Fold in Phase 7 hook cleanup if not already done.
3. Correct stale file-size claims:
   - `sessions.json` is around 27 MB, not 42 MB.
4. Confirm the deleted old doc exists in archive before staging deletion.
5. Remove `test.txt` if it is only the UTF-16 test deploy file.

Validation:

```bash
git status --short
grep -R "42 MB\|build_hooks/" -n CLAUDE.md README.md AGENTS.md docs/ --exclude-dir=.git
npm test
```

Commit message:

```text
audit H6: commit agent doc cleanup and remove deploy test file
```

---

### Phase 9 — Remove double fetch, dead sync-date demo code, and debug logs

Goal: reduce browser waste and console noise without changing behavior.

Source basis: both audits flag dead example code, duplicated 5.2 MB fetch, and heavy debug logging.

Files:

- `main.js`
- `index.html`
- `netlify/functions/getTimetable.js`

Tasks:

1. Remove dead top-level `updateSyncInfoText(syncDate)` demo/example code after the function definition.
2. Remove the duplicate inline `unified_courses.json` fetch from `index.html`.
3. In `initializeApp`, after loading `responseData`, call:

   ```js
   updateSyncInfoText(responseData.scraping_datetime || '');
   ```

4. Store the value in module-level `lastSyncDate`.
5. Ensure language switching re-renders sync text from `lastSyncDate`.
6. Remove nonessential `console.log` calls from:
   - `renderHeaderStatsBar`
   - `getSessionData`
   - routine path logging in `getTimetable.js`
7. Keep `console.error` in error paths.

Validation:

```bash
node --check main.js
node --check netlify/functions/getTimetable.js
npm test
```

Browser validation via `npm run dev:netlify`:

- Page loads without `[object HTMLSpanElement]` flash.
- Sync date appears.
- Language toggle updates sync text.
- Calendar still opens for a normal group.
- Console is free of debug dumps.

Commit message:

```text
audit H1 H3: remove duplicate data fetch and debug logs
```

---

### Phase 10 — Fix stale UI text and GA mismatch

Goal: remove misleading user-facing text and analytics confusion.

Source basis: Fable resolved `G-S3SQ4PZ2JF` as the correct GA property and both audits flag stale study-group/semester wording.

Files:

- `index.html`
- `main.js`

Tasks:

1. Ensure both GA script load and `gtag('config', ...)` use:

   ```text
   G-S3SQ4PZ2JF
   ```

2. Update `searchHelpText_study_group` and hardcoded default help text so users are pointed to the group builder, not a removed dropdown option.
3. Update or remove stale `startsInDays` / `semesterComplete` strings that mention autumn 2025.
4. If those strings are unreachable, delete them instead of preserving stale text.

Validation:

```bash
node --check main.js
npm test
```

Browser validation:

- Help text under search box is correct in both Estonian and English.
- Page title and semester wording are consistent.
- GA IDs match in `index.html`.

Commit message:

```text
audit H2 H4: fix analytics id and stale UI text
```

---

### Phase 11 — Align active docs with executable behavior

Goal: make agent-facing documentation match the current repo.

Source basis: Codex emphasizes docs drift; Fable gives specific drift examples.

Files:

- `README.md`
- `AGENTS.md`
- `docs/distilled-how-to-run.md`
- `docs/distilled-how-timetable-logic-works.md`
- `docs/distilled-current-state.md`
- optionally `docs/data-contract.md`

Tasks:

1. Search active docs for stale or contradicted claims:

   ```bash
   grep -R "8888\|tab-separated\|before fetch\|42 MB\|395\|1000\|Python server\|npm run dev" README.md AGENTS.md docs/ -n
   ```

2. Correct:
   - `npm run dev:netlify` port based on `package.json`.
   - calendar testing requires function-compatible server.
   - CSV is comma-separated with UTF-8 BOM if that is what `main.js` emits.
   - 4000-session limit is now server-side after Phase 6; document the new behavior.
   - current dataset counts should be dated or rounded, not treated as permanent.
3. Add or update a data-contract note listing only fields consumed by this repo:
   - `unified_courses.json.courses[].id`
   - course names/descriptions/EAP/school/institute
   - `groups`
   - `group_sessions[].group`
   - `group_sessions[].session_status`
   - `group_sessions[].instructors`
   - `group_sessions[].keel`
   - `group_sessions[].ainekv`
   - `sessions[].course_id`
   - `sessions[].date`
   - `sessions[].start`
   - `sessions[].end`
   - `sessions[].type`
   - `sessions[].instructor`
   - `sessions[].room`
   - `sessions[].comment`
   - `sessions[].groups`
   - `sessions[].is_veebiope`
4. Link the data-contract note from README and AGENTS if created.
5. Do not edit archived historical docs unless they are linked as active guidance.

Validation:

```bash
npm test
grep -R "tab-separated\|42 MB\|before fetch" README.md AGENTS.md docs/ -n
```

Commit message:

```text
audit docs: align active guidance with executable behavior
```

---

### Phase 12 — Add small pure-helper tests only after the first gate is stable

Goal: improve verification for the actual high-risk frontend logic without a large refactor.

Source basis: Codex recommends pure-function tests for group parsing, group merging, course matching, relevant sessions, and CSV escaping.

Files:

- `main.js`
- optional new `timetable-helpers.js`
- `tests/*.test.js`
- `package.json`

Tasks:

1. Inspect helpers around:
   - `parseCommaSeparatedValues`
   - active group filter construction
   - course matching against groups
   - relevant `group_sessions` filtering
   - relevant session group filtering
   - CSV escaping
2. Add tests for current behavior before extraction.
3. If tests can access helpers without changing browser behavior, do that.
4. If helper extraction is needed:
   - extract only pure helpers with no DOM dependency
   - use CommonJS only if compatible with current no-build browser setup
   - avoid converting all of `main.js` into modules
5. Add test coverage for:
   - one group
   - multiple comma-separated groups
   - prefix-generated group lists
   - group plus text search interactions
   - CSV values containing commas, quotes, and line breaks

Validation:

```bash
npm test
node --check main.js
```

Browser validation:

- group builder one group
- multiple groups
- prefix pattern such as `TVTB*`
- copied URL reload
- CSV export

Stop condition:

- If extraction forces broad DOM/module changes, keep duplicated characterization tests and defer extraction.

Commit message:

```text
audit tests: cover group and csv helper contracts
```

---

### Phase 13 — Decouple group-builder URL state, preserving old links

Goal: reduce future confusion between the visible search dropdown and hidden legacy `searchField=study_group` behavior.

Source basis: both audits warn that current group-builder URLs are coupled to old search semantics.

Files:

- `main.js`
- `README.md`
- `AGENTS.md`
- `docs/distilled-how-timetable-logic-works.md`
- tests from Phase 12

Tasks:

1. Introduce a new URL parameter for builder groups, for example:

   ```text
   groups=EAUI71,EAUI72
   ```

2. Preserve backward compatibility:
   - still read old `searchField=study_group&search=...` links
   - still read `group=` for sidebar group filtering
3. When writing new group-builder URLs:
   - prefer `groups=...`
   - do not write `searchField=study_group`
4. Keep visible search selector semantics separate.
5. Update active docs to explain:
   - `groups=` means group-builder state
   - `group=` means sidebar group filter
   - old `searchField=study_group` URLs are read for compatibility only

Validation:

```bash
npm test
node --check main.js
```

Browser validation via `npm run dev:netlify`:

- one group builder URL
- multiple group builder URL
- prefix-generated groups
- reload from copied new link
- reload from old legacy link
- sidebar group filter still works

Stop condition:

- If old/new URL behavior conflicts, document the conflict and stop before breaking old links.

Commit message:

```text
audit URL: add dedicated groups parameter with legacy compatibility
```

---

### Phase 14 — Optional browser smoke test

Goal: cover one real DOM flow after Node tests exist.

Source basis: Codex recommends one browser smoke path only after the first deterministic tests exist.

Files:

- `package.json`
- `tests/` or `scripts/`
- possibly browser automation dependency if approved

Default recommendation:

- Defer unless the owner approves adding a browser automation dependency.
- If approved, prefer the smallest tool that can:
  - start `npm start` or `npm run dev:netlify`
  - load the page
  - add one group
  - add prefix pattern
  - open calendar
  - assert calendar appears and no function 404/502 error is shown

Validation:

```bash
npm test
npm run smoke
```

Stop condition:

- Do not add Playwright/Puppeteer/Selenium without explicit owner approval.
- Do not build full visual regression.

Commit message:

```text
audit smoke: add one browser calendar flow
```

---

## 5. Human approval gates

The downstream agent must stop and ask the owner before:

1. Rotating Netlify build hooks.
2. Creating new Netlify build hooks.
3. Changing Netlify dashboard settings.
4. Changing Google Analytics dashboard settings.
5. Making repo private/public.
6. Merging `dev` into `main`.
7. Triggering production deployment intentionally.
8. Adding new browser automation dependencies.
9. Rewriting Git history.
10. Changing the external scraper schema.

---

## 6. Final verification checklist

At the end of all completed phases, run:

```bash
git status --short
git lfs ls-files
npm test
node --check main.js
node --check server.js
node --check netlify/functions/getTimetable.js
grep -R "build_hooks/" -n . --exclude-dir=.git
grep -R "42 MB\|tab-separated\|before fetch" README.md AGENTS.md docs/ -n
```

Expected final state:

- Working tree clean except deliberate owner-local files.
- `git lfs ls-files` lists only `sessions.json` and `unified_courses.json`.
- `npm test` passes.
- No raw Netlify build-hook URLs remain in tracked files.
- Active docs do not contradict executable behavior.
- Calendar normal selection works.
- Broad calendar selection shows friendly too-many-sessions message, not a 502.
- Existing old group links still reload correctly.
- New group-builder links use dedicated `groups=` parameter if Phase 13 was completed.

---

## 7. Recommended commit order

Use this order unless a phase is explicitly skipped:

1. `audit M3: restrict LFS to runtime data files`
2. `audit M1: escape URL-derived filter pill values`
3. `audit M5: guard missing timetable query parameters`
4. `audit M4: add minimal timetable function test gate`
5. `audit M2: move Netlify build ignore into root config`
6. `audit H7: enforce calendar session limit in function`
7. `audit H5: sanitize deploy tooling and remove hook URLs`
8. `audit H6: commit agent doc cleanup and remove deploy test file`
9. `audit H1 H3: remove duplicate data fetch and debug logs`
10. `audit H2 H4: fix analytics id and stale UI text`
11. `audit docs: align active guidance with executable behavior`
12. `audit tests: cover group and csv helper contracts`
13. `audit URL: add dedicated groups parameter with legacy compatibility`
14. optional: `audit smoke: add one browser calendar flow`

---

## 8. Explicit deferrals and rejections

Reject in this remediation pass:

- React/Vue rewrite
- TypeScript migration
- Vite/build pipeline
- database migration
- loading full `sessions.json` in the browser
- broad lint/format-only churn
- full visual redesign
- Git history rewrite
- large test framework before plain `npm test` works
- caching or pre-indexing the function before server-side limit is fixed

Defer:

- CI setup until `npm test` is meaningful and stable.
- Browser smoke automation until owner approves dependency addition.
- Deeper `main.js` modularization until helper tests exist.
- Product features such as full-range CSV export or group-builder visual polish.

---

## 9. Handoff prompt for execution agent

Use this prompt when handing the remediation to another coding agent:

```text
You are working in the `tunniplaan` repo on branch `dev`.

Execute the remediation roadmap in `260707-post-audit-remediate-roadmap.md`.

Rules:
- Work only on `dev`; do not touch `main`.
- One logical commit per roadmap item.
- Start every phase by inspecting current files and `git status --short`.
- Do not widen scope.
- Do not rewrite Git history.
- Do not introduce React, Vue, TypeScript, Vite, a database, broad lint churn, or client-side loading of full `sessions.json`.
- For JS edits, run the exact checks listed in the roadmap.
- Once `npm test` exists, run it before every behavior commit.
- For calendar/group-builder behavior, verify in a browser using `npm run dev:netlify`, not a static-only server.
- Preserve backward compatibility for old group-builder URLs.
- Stop and report before any Netlify dashboard action, GA dashboard action, credential rotation, production merge, production deploy, new browser automation dependency, or scraper schema change.

Begin with Phase 0 and proceed in order.
```
