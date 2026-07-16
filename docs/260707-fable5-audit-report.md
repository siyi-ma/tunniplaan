# audit-report

**Audit date:** 2026-07-07 · **Model:** Fable 5 · **Repo:** `C:\Projects\tunniplaan` · **Branch at audit:** `dev` (dirty: `M CLAUDE.md`, `D docs/20250813-Gemini-...`)

## executive verdict

This is a small, coherent, deliberately framework-free static webapp with one serverless function. Its structure is sound for its size and its documentation is unusually good — the distilled docs, handoff notes, and AGENTS.md are recent (2026-04-21) and mostly match the code. A rewrite or restructuring is not warranted.

The real problems are narrow and concrete:

1. A **reflected DOM XSS** via URL parameters (`?search=`, `?group=`) rendered unescaped into `innerHTML`.
2. A **Netlify build-ignore rule that is documented as active in three places but was never deployed** — it lives only in `docs/netlify.toml`, which Netlify does not read.
3. An **over-broad Git LFS rule** (`*.json`) that has pulled `package.json` and `package-lock.json` into LFS.
4. **Zero automated verification** — `npm test` is the npm placeholder that exits 1; the only safety gate is `node --check` plus a manual browser checklist.
5. Deploy capability (`.vscode/tasks.json`) is **documented as part of the repo but gitignored**, so a fresh clone silently loses it; the build-hook URLs are also committed in `CLAUDE.md`.

Everything else is cleanup-grade: leftover debug logging, dead example code that works by accident, a Google Analytics ID mismatch, stale semester strings, a junk `test.txt`, and a duplicated 5 MB data fetch on every page load.

## repository map

```text
tunniplaan/
|-- index.html                      # SPA shell, search + group-builder UI, inline sync-date fetch
|-- main.js                         # 1709 lines: all state, filtering, rendering, calendar, i18n, CSV export
|-- main.css                        # 101 lines custom styles (Tailwind via CDN does the rest)
|-- server.js                       # local Node server (port 8888) mocking the Netlify function route
|-- netlify/functions/getTimetable.js  # production endpoint: filters sessions.json by course IDs
|-- netlify.toml                    # EFFECTIVE Netlify config: only [functions] included_files
|-- docs/netlify.toml               # reference copy — contains a build-ignore rule the root lacks
|-- unified_courses.json            # 5.2 MB course metadata (Git LFS), loaded at startup
|-- sessions.json                   # 27 MB session events (Git LFS), read by the function
|-- package.json                    # scripts: dev / dev:netlify / start / test(placeholder, exits 1)
|-- test.txt                        # 28-byte "Test deploy" junk, tracked
|-- CLAUDE.md, AGENTS.md, README.md # agent/contributor docs (CLAUDE.md rewrite uncommitted)
|-- docs/                           # distilled docs + handoff + archive (18 session notes)
`-- .vscode/                        # tasks.json + settings.json — GITIGNORED, exists only locally
```

- **Package manager:** npm; only devDependency is `http-server`. No build step — deploy is "publish the repo".
- **Entry points:** `index.html` → `main.js` (deferred). Backend entry: `netlify/functions/getTimetable.js`; local parity via `server.js`.
- **Data source:** produced externally by the scraper repo (`siyi-ma/tunniplaanScraping`) and copied in by its `publish_to_webapp.py`; schema contract lives in that repo's `docs/data-contract.md` (per the pending CLAUDE.md rewrite).
- **Deployment:** Netlify, `main` = production, `dev` = dev deploy, manual build hooks. No CI.

## architecture review

### core subsystems

1. **Data load & post-processing** — `initializeApp` (main.js:1607) fetches `unified_courses.json`, populates `allCourses`, `window.groupToFacultyMap`, and derived maps (`postProcessUnifiedData`, main.js:503). URL parameters seed `activeFilters` on load.
2. **Filtering & card view** — `applyAllFiltersAndRender` (main.js:556) is the single filtering pipeline (faculty/institute/EAP/assessment/language/group + field-scoped text search), then `renderCardView`.
3. **Calendar view** — `toggleCalendarView` (main.js:905) fetches `/.netlify/functions/getTimetable?courses=...`, enforces the 4000-session limit, merges via `mergeTimetableData` (main.js:540), renders via `getSessionData` → `renderWeeklyView` (main.js:1020/1071).
4. **Group timetable builder** — chips + autocomplete + `TVTB*` prefix bulk-add (main.js:344–472); reuses the legacy `searchField=study_group` URL/state model internally (acknowledged coupling, see handoff doc).
5. **Bilingual UI** — `uiTexts` object (main.js:84–156); `updateAllUITexts` maps keys to element ids.
6. **Backend** — one stateless function that reads and filters the 27 MB `sessions.json` per invocation; `server.js` replicates the route locally.

### dependency flow

Clean and one-directional: scraper repo → JSON files → frontend/function. No circular dependencies. The only cross-boundary contract is the JSON schema plus the field names consumed in `main.js` and `getTimetable.js` (`course_id`, `date`, `start`, `end`, `room`, `groups`, `group_sessions`, `keel`, etc.).

### tests and verification health

**Classification: weak** (borderline none).

- No `tests/` directory, no test framework, no CI. `package.json` `test` script is the npm placeholder: `echo "Error: no test specified" && exit 1`.
- The only automated check that exists in practice is `node --check` on the three JS files (all pass as of this audit).
- AGENTS.md (lines 183–196) documents a *manual* browser checklist — this is real and thoughtful, but nothing enforces it.
- There are no fixtures, no schema validation of the incoming JSON on this side of the contract (validation happens in the scraper repo's publish script, per CLAUDE.md), and no smoke test of the Netlify function.
- Consequence: any regression in the 1709-line `main.js` — which AGENTS.md itself warns has "repeated assumptions between card view and calendar view" — is caught only by a human clicking through the app.

### important contracts and repo states

- **Data contract**: the two JSON files are the load-bearing contract. The schema is owned by the *other* repo; this repo consumes it. Field renames upstream silently break this app. The pending CLAUDE.md rewrite documents this correctly.
- **LFS contract**: `.gitattributes` is one line: `*.json filter=lfs diff=lfs merge=lfs -text`. `git lfs ls-files` shows **`package.json` and `package-lock.json` are in LFS** alongside the two data files. Any future `.json` file (configs, manifests) will be silently LFS'd too.
- **Netlify contract**: root `netlify.toml` bundles `sessions.json` with the function (required; file must stay under Netlify's function size limits). The build-ignore rule exists only in `docs/netlify.toml`.
- **Deploy contract**: production/dev deploys go through build-hook URLs stored in `.vscode/tasks.json` (untracked) and in `CLAUDE.md` (committed, therefore public if the repo is public — repo URL is `github.com/siyi-ma/tunniplaan`).
- **Working-tree state**: `CLAUDE.md` has a full uncommitted rewrite (the improved version referencing the scraper repo and data contract); one legacy doc is deleted but uncommitted. Both look like intentional, committable cleanup.
- **Semester state**: the app is hardcoded to spring 2026 (`SEMESTER_START`/`SEMESTER_END`/`STUDY_WEEK_CUTOFF`, main.js:73–74; titles in index.html:14/29 and main.js:19/85). This is a recurring manual update with no single place to make it.

### strengths

- **Documentation discipline** is far above typical for a solo project: distilled docs answer "what/how-to-run/how-it-works", handoff notes are specific, AGENTS.md explicitly lists documentation-drift traps and a manual test checklist, and the docs/README indexes everything.
- **The 42 MB problem is solved correctly**: sessions stay server-side behind a filtering function; the client never loads `sessions.json`; a 4000-session limit guards the calendar renderer.
- **`server.js` provides real local parity** for the function route without requiring Netlify CLI.
- **Bilingual text is centralized** in one `uiTexts` object rather than scattered.
- **No dependency surface** to rot: zero runtime npm dependencies.

### structural risks

- **`main.js` is a 1709-line monolith with global mutable state** (~15 module-level variables). Function boundaries are clear and named well, so it is navigable — but card view and calendar view duplicate derivation logic (status, instructors, groups), and the repo's own docs (AGENTS.md:165, handoff:90) warn that single-path edits cause cross-view drift. With no tests, this is the primary regression engine.
- **The `study_group` legacy coupling**: the search-field dropdown has 5 options (index.html:44–50; `updateAllUITexts` touches exactly `options[0..4]`, main.js:1456–1461), but `searchField=study_group` still flows through URL state, `applyAllFiltersAndRender`, `updateDynamicTitle`, and the group builder. An agent "simplifying" either side without knowing the other will break shareable group links.
- **Accidental-global dependence**: main.js:1697 calls `updateSyncInfoText(syncDate)` at top level; `syncDate` resolves only because `<span id="syncDate">` creates `window.syncDate`. The call passes an HTMLElement, briefly rendering `[object HTMLSpanElement]` until the inline fetch in index.html:148–156 overwrites it. Lines 1695–1709 are labeled "Example usage" — it is dead demo code that shipped.

### ambiguities or brittle conventions

- Whether the Netlify **UI** has a build-ignore configured (which would make the `docs/netlify.toml` copy harmless) cannot be determined from the repo. The archive note (docs/archive/setup-and-devops-2026/20260206-netlify-ignore-builds.md) claims the rule was "created in the project root", which the git history contradicts (commit `bed8df2` only added `docs/netlify.toml`).
- Which Google Analytics property is correct: index.html loads gtag for `G-4Z7G03F5WN` but configures `G-S3SQ4PZ2JF` (index.html:5 vs :10). One of them is wrong; the repo cannot tell you which.
- `getStudyWeek` caps at week 16 and `STUDY_WEEK_CUTOFF` is 2026-05-20 while `SEMESTER_END` is 2026-06-30 — presumably "contact study" vs "semester", but nothing says so.

### low-ROI concerns worth ignoring

- The mixed git author identities (`siyi.ma@taltech.ee` / `siyi.ma.ee@gmail.com`) — cosmetic.
- Tailwind-via-CDN in production triggers a console warning and is unminified, but for a low-traffic internal tool the migration cost outweighs the benefit. Not worth doing now.
- `server.js` and `getTimetable.js` duplicate ~20 lines of filter logic — two files, trivially small, intentionally decoupled. Leave it.
- The function re-reads and re-parses 27 MB per cold invocation. Netlify keeps warm instances and traffic is low; do not add caching infrastructure for this.

## evidence-backed findings

Ordered by severity. **R** = real risk, **C** = cosmetic/cleanup.

1. **[R] Reflected DOM XSS via URL parameters.** `renderActiveFiltersDisplay` (main.js:1403–1415) builds filter pills with template literals into `innerHTML`. `activeFilters.searchTerm` comes directly from `?search=` (main.js:1626) and `activeFilters.group` from `?group=` (main.js:1625) with no escaping or validation against known values. A crafted shareable link like `?search=<img src=x onerror=...>` executes script in the victim's browser. Impact is bounded (no auth, no sensitive cookies) but this is a public site with link-sharing as a core feature. Confirmed by code path tracing; not executed in a browser during this audit.

2. **[R] Build-ignore config never deployed; docs claim it works.** Root `netlify.toml` contains only `[functions] included_files`. The `[build] ignore` rule exists only in `docs/netlify.toml` (added by commit `bed8df2`, which touched no root config). Yet `docs/distilled-current-state.md:30,48` and the archive note state the ignore logic is active. Every doc-only commit likely triggers a full build — which also re-downloads LFS data, consuming LFS bandwidth quota.

3. **[R] `.gitattributes` LFS pattern too broad.** `*.json` puts `package.json` and `package-lock.json` in LFS (verified via `git lfs ls-files`). Consequences: GitHub renders pointers not content, diffs/PR review of dependency changes are opaque, any environment without LFS (some CI images, `git archive`, shallow tooling) sees a 3-line pointer file where npm expects JSON, and every future small `.json` file is silently swallowed.

4. **[R] No automated verification layer.** `npm test` exits 1 by design (package.json:13). No unit tests, no fixture-based function test, no schema check on data updates, no CI. Combined with finding 6 (cross-view duplication), this is the main thing making the repo unsafe for AI-assisted edits.

5. **[R] Deploy capability untracked but documented as tracked.** `.gitignore:1` excludes `.vscode/`, yet README.md:91–99, AGENTS.md:34, and CLAUDE.md all describe `.vscode/tasks.json` as part of the repo. It exists only on this machine. Additionally, both Netlify build-hook URLs are committed in CLAUDE.md — anyone with those URLs can trigger builds and burn build minutes. They are in git history permanently regardless of future edits.

6. **[R] Card/calendar logic duplication with no gate.** Acknowledged in AGENTS.md:165 and handoff:90; e.g. status/instructor/group derivation appears in both `createCourseCardHTML` (main.js:709) and the calendar path (`getSessionData`/`renderWeeklyView`). Not urgent to refactor, but it defines where regressions will come from.

7. **[C] Dead example code executing at load.** main.js:1695–1709 ("Example usage") calls `updateSyncInfoText(syncDate)` at top level, passing the DOM element via the id-to-global coincidence, transiently rendering `[object HTMLSpanElement]`; it also registers a second language-toggle listener with a `setTimeout(…,10)` hack, duplicating the one at main.js:26–33.

8. **[C] Double fetch of 5.2 MB on every page load.** `initializeApp` fetches `./unified_courses.json` (main.js:1609) and the inline script in index.html:148–156 fetches it again just to read `scraping_datetime`. The data is already in `responseData` inside `initializeApp`.

9. **[C] Google Analytics ID mismatch.** index.html loads `G-4Z7G03F5WN` but configures `G-S3SQ4PZ2JF`. Analytics for one property is likely empty or misattributed.

10. **[C] Debug logging in production.** 7 `console.log` calls including `[DEBUG 3]/[DEBUG 4]` deep-copies of the entire session array via `JSON.parse(JSON.stringify(...))` (main.js:1024,1030) — a real CPU/memory cost with thousands of sessions — and per-render dumps of all filtered course statuses (main.js:652–655).

11. **[C] Stale UI text.** `searchHelpText_study_group` (main.js:100, hardcoded as the default help text in index.html:57) instructs users to "choose Study group as the search field" — an option removed from the dropdown when the group builder replaced it. `startsInDays`/`semesterComplete` strings (main.js:151–152) still say "autumn semester 2025" in a spring-2026 app.

12. **[C] Junk and drift.** `test.txt` (UTF-16 "Test deploy") is tracked. index.html:118–130 contains a static copy of the header stats bar with raw `${online}`-style placeholders that only looks right because `renderHeaderStatsBar` overwrites it — markup duplicated against main.js:660–674. CLAUDE.md's committed version cites stale file sizes (42 MB vs actual 27 MB) and a Python-server-first workflow that AGENTS.md supersedes; the uncommitted rewrite fixes most of this and should land.

13. **[C] `getTimetable.js` null-safety.** `event.queryStringParameters.courses` (line 6) throws if `queryStringParameters` is ever null (Netlify usually provides `{}`, but direct invocations/tests won't). One-line guard.

14. **[R] Large course selections 502 in production; measured 2026-07-07.** Live probes against `taltech-tunniplaan.netlify.app`: ≤250 courses → HTTP 200; ≥280 courses → **HTTP 502**. Raw response size correlates exactly (250 courses = 4.38 MB body OK; 280 = 5.46 MB fails) — the function's JSON body exceeds AWS Lambda's ~6 MB response cap (effective ~5 MB with envelope overhead). A user who opens calendar view with no/broad filters (all 860 courses = 16 MB body, 44k sessions) gets a 502; the client's generic catch (main.js:944) shows "selection too large", so it degrades politely but wastefully — selections between the 4000-session client limit and the 502 threshold download megabytes only to be told to narrow. The 4000-session guard runs client-side *after* download, so it never protects the function or the wire.

    **Latency baseline (established 2026-07-07, spring-2026 dataset: 860 courses, 26.2 MB sessions.json):**
    - Local handler compute: 110–184 ms for 5→860 courses (per-call file read+parse dominates).
    - Live warm: 1.5–2.1 s total for 5–250 courses (1.8–92 KB compressed on the wire; Netlify CDN compresses ~50:1).
    - Live cold start: ~3.3 s.
    - Failure threshold: between 250 and 280 courses (~4.4–5.5 MB raw body, ~12.5–15k sessions).

## summary of likely AI failure modes

- **Editing only one view.** Changing status/instructor/group derivation in the card path but not the calendar path (or vice versa). AGENTS.md warns about this; without tests nothing enforces it.
- **"Cleaning up" the `study_group` remnants.** Removing the `searchField=study_group` handling because the dropdown lacks the option would break group-builder shareable URLs and `?group=` deep links.
- **Deleting the "unused" `syncDate` code or renaming the span id** — the top-level call at main.js:1697 depends on the id-to-global accident and will throw a load-time `ReferenceError` if the id changes.
- **Adding any `.json` file** (config, fixture, manifest) — it silently becomes an LFS object under the current `.gitattributes`.
- **Trusting the docs about the build-ignore rule** and concluding deploy behavior that isn't real; or editing `docs/netlify.toml` expecting effect.
- **Following the committed CLAUDE.md's Python-server workflow** to test calendar view, which cannot work (no function route); AGENTS.md has the correct guidance.
- **Updating semester dates in some but not all of** main.js:19, main.js:73–74, main.js:85, main.js:151–153, index.html:14, index.html:29.

## open questions or unknowns

1. ~~Is a build-ignore command configured in the Netlify UI?~~ **Answered 2026-07-07 via Netlify API** (site `taltech-tunniplaan`, id `c37a8aa8-480f-475c-bdae-94eb239bd8b5`): `build_settings.ignore` is **null** — no ignore command exists in the UI or in effective config. Deploy history proves the impact: doc-only commit `763181e` ("Fix gitignore and add handoff note") triggered a full dev build on 2026-04-21. Plan item M2 should proceed with moving the rule into root `netlify.toml`.
2. ~~Which GA property ID is correct?~~ **Answered 2026-07-07:** the owner confirmed `G-S3SQ4PZ2JF` in the GA dashboard (both IDs probe as valid GA4 tags, but `G-S3SQ4PZ2JF` is the property that has been receiving data, since the `gtag('config', ...)` line determined the destination). Fixed in the working tree: index.html:5 now loads gtag with `G-S3SQ4PZ2JF`, matching line 10.
3. ~~Is the GitHub repo public?~~ **Answered 2026-07-07:** the repo is currently public and the owner plans to make it private. The committed build-hook URLs should be treated as burned either way — going private does not retroactively protect URLs that were already publicly visible and remain in git history — so rotate them in the Netlify UI regardless.
4. Does Netlify's LFS integration currently deliver real file content for `package.json` during builds? Builds evidently succeed today (all recent deploys `ready`, Netlify Large Media not enabled — checked via API 2026-07-07), so yes — but this makes the build pipeline dependent on LFS working for a file that has no reason to be in LFS.

**Additional facts established via Netlify API (2026-07-07):**

- The site has exactly **one** build hook: `6980b6f3e6f1a66c892e33ab` ("VS code extension", branch `main`, created 2026-02-02). The **dev hook URL committed in CLAUDE.md (`6980b7cb...`) no longer exists** — that documented deploy path is dead. The main hook is live and publicly exposed → rotate it (plan H5).
- Production branch is `main`; `dev` gets branch deploys. No build command, publish dir is repo root — consistent with the no-build deploy model.
- Local `dev` is one commit ahead of `origin/dev` (`516f24e`, the docs distill) — unpushed as of the audit date.
