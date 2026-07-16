# improvement-plan

**Companion to:** `260707-fable5-audit-report.md` · **Repo:** `C:\Projects\tunniplaan` · **Written for:** a downstream agent executing changes on the `dev` branch.

**Global rules for the executing agent:**

- Work on `dev`. Do not touch `main` directly.
- After every `main.js` / `server.js` / `netlify/functions/getTimetable.js` edit, run `node --check <file>`.
- For anything touching calendar or group-builder behavior, verify in a browser via `npm run dev:netlify` (NOT `npm run dev`, NOT a Python server — those lack the function route).
- Never let a new `.json` file get committed before item M3 lands (the current `.gitattributes` will silently put it in LFS).
- Keep each item its own commit. Stop and report instead of widening scope.

---

## must-have changes

### M1. Fix reflected XSS in filter pills

- **Files:** `main.js` (`renderActiveFiltersDisplay`, lines ~1401–1419).
- **Problem:** `activeFilters.searchTerm` (from `?search=`) and `activeFilters.group` (from `?group=`) are interpolated unescaped into `innerHTML`. Crafted shareable links execute script.
- **Why:** Public site whose core feature is sharing URLs; this is the one genuine security bug found.
- **Fix (smallest effective):** Add one helper near the other utilities (~line 190):
  ```js
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  ```
  In `createPill`, escape both `label` and `value` (labels are internal today, but escaping both is free). Do NOT refactor pill rendering to DOM-node construction — bigger change, same outcome.
- **Also check (same loop):** grep `innerHTML` in `main.js` (24 hits) for any other spot where `activeFilters.searchTerm`, `activeFilters.group`, or raw URL params are interpolated. Course-data fields (names, rooms, instructors) come from the trusted scraper pipeline — leave them; escaping all data everywhere is scope creep.
- **Verify:** `node --check main.js`; then in `npm run dev:netlify` open `http://localhost:8000/?search=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E` → the pill must show the literal text and no dialog; normal pill add/remove still works.
- **Stop condition:** if you find user input flowing into `innerHTML` outside the pill/search path, report it — don't chase every sink in one commit.

### M2. Make the Netlify build-ignore rule real (or delete the claim)

- **Files:** `netlify.toml` (root), `docs/netlify.toml`, `docs/distilled-current-state.md` (lines 30, 48).
- **Problem:** The ignore rule exists only in `docs/netlify.toml`; Netlify reads only the root file. Three docs claim it is active. Doc-only pushes likely trigger full builds + LFS downloads.
- **Evidence (resolved 2026-07-07 via Netlify API):** site `taltech-tunniplaan` (`c37a8aa8-480f-475c-bdae-94eb239bd8b5`) has `build_settings.ignore = null` — no UI-level ignore exists. Deploy history confirms doc-only commit `763181e` triggered a full dev build. The rule is not active anywhere; proceed with the root-config fix.
- **Fix:**
  - Replace root `netlify.toml` with the `docs/netlify.toml` content (both `[build] ignore` and `[functions] included_files`). Add `docs/` deliberately *excluded* from the watched paths — that is the point of the rule.
  - Update `docs/README.md:31` — either delete `docs/netlify.toml` (root is now the single source) or keep it and mark it superseded. Prefer deleting; a diverging copy caused this bug.
- **Verify:** push a doc-only commit to `dev` and confirm Netlify skips the build; push this config commit itself and confirm it *does* build (it touches `netlify.toml`… note: the ignore command does not list `netlify.toml` itself — add it to the watched paths list).
- **Stop condition:** none remaining — the UI question is resolved (no ignore configured). Execute the root-config fix.

### M3. Narrow Git LFS to the two data files

- **Files:** `.gitattributes`, then `package.json` + `package-lock.json` re-tracking.
- **Problem:** `*.json` puts `package.json`/`package-lock.json` in LFS (confirmed via `git lfs ls-files`); every future JSON file is silently swallowed; diffs are opaque; non-LFS tooling sees pointer files.
- **Fix:**
  1. Replace `.gitattributes` content with:
     ```
     sessions.json filter=lfs diff=lfs merge=lfs -text
     unified_courses.json filter=lfs diff=lfs merge=lfs -text
     ```
  2. Migrate the two small files out of LFS in the same commit:
     ```
     git rm --cached package.json package-lock.json
     git add .gitattributes package.json package-lock.json
     git commit -m "Restrict LFS to data files; move package manifests to plain git"
     ```
- **Verify:** `git lfs ls-files` lists exactly `sessions.json` and `unified_courses.json`; `git show HEAD:package.json | head -3` shows real JSON, not an LFS pointer; `npm install` still works.
- **Do NOT** run `git lfs migrate export` to rewrite history — history rewrite on a repo with two long-lived branches is far riskier than leaving old pointers in past commits.
- **Stop condition:** if `git rm --cached` + re-add still produces a pointer (check with `git show :package.json`), stop and report rather than experimenting with migrate commands.

### M4. Add a minimal verification gate

- **Files:** `package.json`, new `tests/` directory (2 small files), `AGENTS.md`.
- **Problem:** `npm test` exits 1 by design; there is no automated check at all. This repo's main risk is cross-view regressions in `main.js`, and the cheapest meaningful gate is syntax + one function-level smoke test.
- **Fix (smallest useful layer, no framework):**
  1. `package.json` scripts:
     ```json
     "test": "node --check main.js && node --check server.js && node --check netlify/functions/getTimetable.js && node tests/getTimetable.test.js"
     ```
  2. `tests/fixtures/sessions.sample.json`: hand-copy ~5 session objects out of the real `sessions.json` (2 course IDs, at least one duplicate-session pair sharing course/date/start/end/room with different groups).
  3. `tests/getTimetable.test.js`: plain Node script (use `assert`), which `process.chdir()`s into a temp dir containing the fixture as `sessions.json` (the handler resolves `process.cwd()/sessions.json`), then calls `require('../netlify/functions/getTimetable').handler` with:
     - `{ queryStringParameters: { courses: 'ID1' } }` → 200, only ID1 sessions;
     - `{ queryStringParameters: {} }` → 200, `[]`;
     - `{ queryStringParameters: null }` → currently throws; see M5 — after M5 it must return 200 `[]`.
  4. Update AGENTS.md "Testing Guidance" to say `npm test` is the mandatory pre-commit check.
- **Why this scope and no more:** the frontend has no module system, so unit-testing `main.js` functions requires refactoring to ES modules first — that is deferred (L3). The function is the only cleanly testable unit today.
- **Verify:** `npm test` passes; deliberately break a brace in `main.js`, confirm it fails, revert.
- **Note:** the fixture is a new `.json` file — M3 must land first or it goes into LFS.

### M5. Null-guard the Netlify function

- **File:** `netlify/functions/getTimetable.js:6`.
- **Fix:** `const requestedCoursesQuery = event.queryStringParameters && event.queryStringParameters.courses;`
- **Verify:** covered by the M4 test. One line; do not restructure the handler.

---

## high-ROI improvements

### H1. Remove dead example code and the double data fetch

- **Files:** `main.js:1695–1709`, `index.html:148–156`, `main.js` (`initializeApp`).
- **Problem:** (a) top-level `updateSyncInfoText(syncDate)` works only via the id-to-global accident, transiently renders `[object HTMLSpanElement]`, and registers a duplicate language-toggle listener; (b) the inline script in index.html fetches the 5.2 MB `unified_courses.json` a second time just for `scraping_datetime`, which `initializeApp` already has.
- **Fix:**
  1. Delete main.js lines 1695–1709 (everything after the `updateSyncInfoText` function definition; keep the function).
  2. Delete the inline `<script>` block index.html:148–156.
  3. In `initializeApp`, after `allCourses = responseData.courses || []`, add: `updateSyncInfoText(responseData.scraping_datetime || '');` and store the value in a module-level `let lastSyncDate = ''` so `setLanguage`/the existing language-toggle handler can re-render it — call `updateSyncInfoText(lastSyncDate)` from `updateAllUITexts` (main.js:1448) instead of via a new listener.
- **Verify:** in `npm run dev:netlify`: sync line shows the real date on load (watch for any flash of `[object ...]` — must be gone), toggling EN/ET re-renders it in the right language, no console errors.

### H2. Resolve the Google Analytics ID mismatch — DONE 2026-07-07

- **File:** `index.html:5` (loaded `G-4Z7G03F5WN`) vs `index.html:10` (configures `G-S3SQ4PZ2JF`).
- **Resolution:** owner confirmed `G-S3SQ4PZ2JF` in the GA dashboard. index.html:5 updated in the working tree so both lines use `G-S3SQ4PZ2JF`. Commit together with other index.html work.
- **Note for future edits:** do not add SRI `integrity` hashes to the gtag.js or cdn.tailwindcss.com script tags — both are dynamically generated and unversioned; a pinned hash breaks them on the provider's next update. Font Awesome (versioned CDN asset) already has SRI.

### H3. Strip debug logging

- **File:** `main.js` — 7 `console.log` calls; the costly ones are lines 1024/1030 (`JSON.parse(JSON.stringify(allSessions))` deep-copies of the full session array) and 644–655 (per-render status dumps incl. the `debugCourseStatus` array construction).
- **Fix:** delete the log statements and the variables that exist only to feed them (`debugCourseStatus`, `onlineCodes`, `hybridCodes`, `offlineCodes`). Keep `console.error` calls — they are legitimate.
- **Verify:** `node --check main.js`; open calendar view for a large group set; behavior unchanged, console quiet.

### H4. Fix stale/misleading UI text

- **Files:** `index.html:57`, `main.js:100`, `main.js:151–152`.
- **Fix:**
  - `searchHelpText_study_group` (and the hardcoded default in index.html:57): rewrite to point at the group builder, e.g. et: "Rühmade ühise tunniplaani jaoks kasuta nuppu 'Koosta tunniplaan rühmade järgi'." / en: "For a combined group timetable, use 'Build timetable by groups'." Check `updateSearchInputContext` (main.js:473) to see which key the default help text uses and keep them consistent.
  - `startsInDays` / `semesterComplete` (main.js:151–152): change "Sügissemestri 2025 / autumn semester 2025" to spring 2026 wording. Grep where these are rendered to confirm they're still reachable; if unreachable, delete instead.
- **Verify:** browser check of the help text under the search box in both languages.

### H5. Make deploy tooling survive a fresh clone; contain the build hooks

- **Files:** `.gitignore`, `.vscode/tasks.json`, `CLAUDE.md`, `README.md`.
- **Problem:** all three docs describe `.vscode/tasks.json` as part of the repo, but `.vscode/` is gitignored — deploy tasks exist only on this machine. Build-hook URLs are also committed in CLAUDE.md. The repo is currently public (owner plans to make it private, confirmed 2026-07-07), so the URLs have been exposed and remain in git history; going private later does not un-expose them.
- **Fix:**
  1. In `.gitignore`, replace `.vscode/` with:
     ```
     .vscode/*
     !.vscode/tasks.json
     ```
  2. Before committing `tasks.json`, read it and strip the raw hook URLs if present — have tasks call `npm run deploy:main` / `deploy:dev` instead, and add those scripts to `package.json` reading the hook URL from an env var (e.g. `NETLIFY_HOOK_MAIN`), documented in README.
  3. Remove the literal hook URLs from CLAUDE.md (the working-tree rewrite is pending anyway — fold this in).
  4. **Recommend to the user** (do not do it yourself — external, destructive-ish): rotate the build hook in the Netlify UI. Per the Netlify API (2026-07-07), only **one** hook exists: `6980b6f3e6f1a66c892e33ab` ("VS code extension", branch `main`) — this is the production hook committed in CLAUDE.md, live and publicly exposed, so it must be recreated. The dev hook URL in CLAUDE.md (`6980b7cb...`) **no longer exists** — remove it from docs and, if a dev deploy hook is still wanted, create a new one for branch `dev`. Rotation is required even after the repo goes private; the URLs are permanently in git history.
- **Verify:** `git status` shows `tasks.json` staged; grep the repo for `build_hooks/` → only env-var references remain.
- **Stop condition:** if the user prefers keeping hooks out of git entirely, just fix the three docs to say tasks.json is local-only.

### H6. Commit the pending working-tree cleanup

- **Files:** `CLAUDE.md` (uncommitted rewrite), deleted `docs/20250813-Gemini-...` (uncommitted deletion), `test.txt`.
- **Fix:** review the CLAUDE.md rewrite (it is the version with scraper-repo/data-contract references — strictly better than HEAD; also fold in H5's hook-URL removal and correct the stale "42MB" size claim to ~27 MB), commit it together with the doc deletion; `git rm test.txt` (it's a leftover deploy test: UTF-16 "Test deploy").
- **Verify:** `git status` clean afterward except intended work.

### H7. Enforce the session limit server-side (fixes production 502 on large selections)

- **Files:** `netlify/functions/getTimetable.js`; `main.js` (`toggleCalendarView` ~905, error text ~944, `CALENDAR_SESSION_LIMIT`).
- **Evidence (measured live 2026-07-07):** ≤250 courses → HTTP 200; ≥280 courses → **HTTP 502**. Raw JSON body at the boundary: 4.38 MB passes, 5.46 MB fails — the Lambda ~6 MB response cap (effective ~5 MB). All-courses worst case is 16 MB / 44k sessions. The existing 4000-session guard runs client-side *after* download, so it never protects the function; mid-size selections download megabytes just to be told "narrow your filters", and large ones hit the generic error at main.js:944.
- **Smallest fix:** in the function, after filtering, if `filtered.length > 4000` return `200` with a small body `{"tooManySessions": true, "count": <n>, "limit": 4000}` instead of the array. In `toggleCalendarView`, check for that shape before treating the body as an array and show the existing "too many sessions" message with the real count. Share the limit by duplicating the constant with a cross-reference comment (no build step exists to share code between the function and main.js).
- **Latency guidance (answers the open question):** warm ~1.5–2 s / cold ~3.3 s total for any renderable selection is acceptable for a spinner-backed action; local compute is only 110–184 ms, so per-invocation parse of the 26 MB file dominates. No caching work is justified (see rejects) — the actionable defect is the 502/wasted-download zone, which this item removes entirely because every selection then returns ≤ a few KB or ≤1.5 MB (4000 sessions).
- **Verify:** M4's smoke test asserts the `tooManySessions` shape for an oversized fixture selection; browser pass: select broad filters, open calendar, see the friendly limit message (no 502 in the network tab).

---

## lower-priority improvements

### L1. Single source of truth for semester configuration

- **Files:** `main.js:19, 73–74, 85, 151–153`; `index.html:14, 29`.
- **Problem:** each semester rollover requires edits in ≥6 places; the stale autumn-2025 strings prove spots get missed.
- **Smallest fix:** consolidate into one `SEMESTER` config block at the top of `main.js` (dates + et/en display names), derive `uiTexts.pageTitle` and `updateDynamicTitle`'s suffix from it, and set `document.title`/`#pageTitle` from JS on init so index.html's hardcoded copies become fallbacks only. Add a short comment listing every consuming location.
- **Why lower priority:** annoying but predictable; breaks nothing today.

### L2. De-duplicate the static header stats bar

- **Files:** `index.html:118–130` vs `main.js:660–674`.
- **Problem:** the static HTML contains raw `${online}` placeholder text and a near-copy of the JS template; the two drift.
- **Smallest fix:** empty the static `#headerStatsBar` container in index.html (keep the div) and let `renderHeaderStatsBar` own the markup entirely. Note the JS template wraps an extra inner div — remove the duplication when consolidating.

### L3. Reduce card/calendar logic duplication in `main.js`

- **Scope:** extract shared derivation helpers (course status, per-group instructors, relevant groups) so both `createCourseCardHTML` and the calendar path call the same functions — several already exist (`getPreferredCourseStatus`, `getRelevantGroupSessions`); finish the job rather than restructuring files.
- **Ordering constraint:** only after M4 exists and ideally after a few characterization checks; this is the highest-regression-risk area in the repo (AGENTS.md:165 says so explicitly).
- **Do not** split `main.js` into ES modules in the same pass; one change axis at a time.

---

## changes to reject or defer

- **Framework migration (React/Vue/etc.), bundlers, TypeScript** — reject. The no-build deploy model is a deliberate strength; nothing found here needs a framework to fix.
- **Adding CI (GitHub Actions)** — defer. Worth revisiting once M4 exists (`npm test` would be the job), but the audit found no evidence of collaboration pressure that CI would relieve; a documented mandatory `npm test` is proportionate.
- **Test framework (Jest/Vitest) + broad unit coverage of `main.js`** — defer. Requires modularizing `main.js` first (L3's follow-on); the plain-Node smoke test in M4 is the right first rung.
- **`git lfs migrate` history rewrite** — reject (see M3). Old pointers in history are harmless.
- **Caching / memoizing `sessions.json` inside the Netlify function, or moving data to a database** — reject at current traffic. Complexity without a demonstrated problem.
- **Full-range CSV export, visual polish of the group builder** — product features from the old backlog, out of audit scope; leave to the user's roadmap.
- **Escaping every course-data field rendered via `innerHTML`** — reject for now. Data comes from the controlled scraper pipeline; blanket-escaping 24 `innerHTML` sites risks breaking intentional markup (tooltips) for no realistic threat. M1 covers the user-controlled inputs.

---

## autonomous execution loop

For every item above, follow this loop:

1. **Inspect:** read the exact lines cited (they were verified 2026-07-07 against `dev` @ `516f24e` + working tree; re-verify line numbers before editing — the tree was dirty and numbers may shift).
2. **Confirm scope:** the item's "Fix" section is the whole scope. If reality diverges from the stated evidence (e.g., the code was already fixed, or the Netlify UI answer changes the plan), stop and report instead of adapting silently.
3. **Change:** smallest edit that satisfies the item. One item per commit, message referencing this plan (e.g. "audit M1: escape filter-pill values").
4. **Validate:** `node --check` on touched JS always; `npm test` once M4 lands; browser verification via `npm run dev:netlify` for anything user-visible (calendar/group flows per the AGENTS.md checklist).
5. **Report:** what changed, what was verified and how, and any open question. All three original user-input dependencies are resolved as of 2026-07-07: M2 (no Netlify UI ignore exists — proceed with root config), H2 (GA ID is `G-S3SQ4PZ2JF`, already fixed in working tree), H5 (rotate the one live build hook `6980b6f3...`; the dev hook is already gone — user action in Netlify UI still pending).

**Escalation rules:** anything requiring the Netlify dashboard, the GA dashboard, or rotating credentials is user-only — ask, don't attempt. Never push to `main`; merging `dev`→`main` and production deploys are user decisions.

## execution order

1. **M3** (LFS narrowing) — unblocks adding any new file safely, including M4's fixture.
2. **M1** (XSS) — the security fix; independent, ship early.
3. **M5** then **M4** (function guard, then test gate) — M4's test asserts M5's behavior.
4. **M2** (build-ignore) — unblocked: Netlify API confirmed no UI-level ignore exists; execute the root `netlify.toml` fix.
5. **H6** (commit pending CLAUDE.md/doc-deletion/test.txt) folded with **H5** (tasks.json + hook handling) — both touch CLAUDE.md, do them together.
6. **H7** (server-side session limit) — right after M4/M5 land, since its verification rides on the M4 smoke test and it touches the same function.
7. **H1, H3, H4** (dead code + double fetch, debug logs, stale text) — low-risk `main.js` cleanups, each verified with the now-existing `npm test` + a browser pass.
8. **H2** (GA ID) — done in working tree 2026-07-07; just needs committing.
9. **L1, L2** as time permits; **L3** only after the verification layer has been exercised for a while.
