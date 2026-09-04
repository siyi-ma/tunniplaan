# audit-report

## executive verdict

TalTech Tunniplaan is a small, understandable vanilla web app with a clear runtime boundary: static SPA files load `unified_courses.json`, and calendar sessions come from `/.netlify/functions/getTimetable`, which filters `sessions.json` server-side. The repository is operationally coherent, but it is not yet safe for repeated AI-assisted edits without human verification because the main behavior lives in one large `main.js` file, there is no meaningful automated test suite, and several repo-state contracts are implicit rather than enforced.

Verification health is **weak**. There are syntax checks that pass, and the Netlify function can be smoke-called locally, but `npm test` is a failing placeholder, there is no `tests/` directory, and no deterministic smoke test protects the high-risk search/group/calendar flows.

The highest-risk maintenance issues are not framework choices. They are narrower: `*.json` sends every JSON file through Git LFS, including `package.json` and `package-lock.json`; the large frontend file mixes state, URL parsing, filtering, rendering, CSV export, and debug logging; and the group timetable builder is still coupled to the older `searchField=study_group` URL/search model.

Starting repo state:

```text
branch: dev
status:
 M CLAUDE.md
 D "docs/20250813-Gemini-Refactoring a Course Timetable Web App for Data Integrity and UX Enhancement"
recent commits:
516f24e Distill docs/: 3 thematic files + archive 18 source docs
763181e Fix gitignore and add handoff note
859c4c8 Fix group builder prefix input handling
3bbd62b Add dedicated group timetable builder
1903d99 update with Feb 9 data
```

The dirty files are relevant only as repo-state context. The modified `CLAUDE.md` appears to be a documentation rewrite, and the deleted long-form doc appears to have been archived or superseded by the distilled docs. This audit did not modify either file.

## repository map

- Root app shell: `index.html`
- Main frontend logic: `main.js`
- Custom CSS and TalTech utility classes: `main.css`
- Production serverless endpoint: `netlify/functions/getTimetable.js`
- Local backend-compatible server: `server.js`
- Deployment config: `netlify.toml`
- Development scripts and dependency lock: `package.json`, `package-lock.json`
- Large runtime datasets: `unified_courses.json`, `sessions.json`
- Agent and contributor docs: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/`
- VS Code tasks: `.vscode/tasks.json`
- No `tests/`, CI config, schema validators, or browser smoke tests found.

Current data snapshot from local JSON parsing:

```text
unified_courses.json:
  courses: 860
  unique groups: 332
  schools: 5
  institutes: 23
  group_sessions: 2231
  scraping_datetime: 09.02.2026 19:07

sessions.json:
  rows: 44332
  unique course_id values: 862
```

`git lfs ls-files` reports `package.json`, `package-lock.json`, `sessions.json`, and `unified_courses.json` as LFS files. This is caused by `.gitattributes` containing `*.json filter=lfs diff=lfs merge=lfs -text`.

## architecture review

### core subsystems

- `index.html` defines the SPA shell, search controls, group timetable builder, filter drawer, result containers, loading overlay, and analytics script.
- `main.js` owns all runtime state and behavior: `allCourses`, `filteredCourses`, `currentLanguage`, `isCalendarViewVisible`, `totalFilteredSessions`, `activeFilters`, group builder state, search parsing, filtering, URL sync, card rendering, weekly calendar rendering, CSV export, language switching, and initialization.
- `netlify/functions/getTimetable.js` reads `sessions.json` from the process working directory, filters by `course_id`, and returns JSON.
- `server.js` is a local static server with a compatible `/.netlify/functions/getTimetable` route.
- `unified_courses.json` is the authoritative course metadata and course-group-instructor contract. `sessions.json` is the calendar event contract.

### dependency flow

The app uses no frontend build step. Runtime dependencies are browser APIs, Tailwind and Font Awesome CDNs in `index.html`, static JSON files, and Node.js for local/prod backend filtering. `package.json` has one dev dependency, `http-server`, and scripts:

```text
npm run dev          -> npx http-server . -p 8000 -c-1
npm run dev:netlify  -> npx netlify dev -p 8000
npm start            -> node server.js
npm test             -> failing placeholder
```

The dependency flow is intentionally simple and should be preserved. The risk is not lack of framework; it is lack of tests and too much behavior concentrated in one file.

### tests and verification health

Classification: **weak**.

Evidence:

- No `tests/` folder or equivalent fixture test layer exists.
- `package.json` has `"test": "echo \"Error: no test specified\" && exit 1"`.
- `npm test` currently fails with that placeholder.
- `node --check main.js`, `node --check server.js`, and `node --check netlify/functions/getTimetable.js` all pass.
- A direct local call to `netlify/functions/getTimetable.js` with `courses=TES0020` returns `200` and 577 session rows.
- There is no deterministic browser smoke test for one group, multiple groups, prefix wildcard groups, URL reload, calendar open, or CSV export.

This is enough for manual work, not enough for safe repeated agent edits.

### important contracts and repo states

- Calendar data must stay server-filtered. `AGENTS.md`, `README.md`, and `main.js` all reinforce that the client should not load full `sessions.json`.
- Calendar view depends on `/.netlify/functions/getTimetable`; static-only servers cannot test it.
- `CALENDAR_SESSION_LIMIT` is 4000 in `main.js`.
- `unified_courses.json` and `sessions.json` are committed runtime data, not test fixtures.
- `groupToFacultyMap` exists in `unified_courses.json` and is loaded into `window.groupToFacultyMap`, then processed by `postProcessUnifiedData`.
- Group builder URLs still encode state through `searchField=study_group` and `search=...`.
- `.gitattributes` currently treats every JSON file as LFS content, not only the large datasets.
- `.vscode/tasks.json` contains public Netlify build hook URLs and a default Python static server task. README and AGENTS correctly warn this static task is not enough for calendar testing.

### strengths

- The runtime boundary is easy to understand: static frontend plus one filtering endpoint.
- Docs are unusually explicit for an agent-maintained small repo. `AGENTS.md`, `README.md`, and the distilled docs describe local modes, calendar limitations, and common change patterns.
- `server.js` gives a practical local fallback when Netlify CLI is unavailable.
- Large calendar sessions are kept out of the browser startup path.
- Bilingual strings are mostly centralized in `uiTexts`.
- Recent group timetable behavior has centralized helpers for active group parsing and relevant group/session selection.

### structural risks

- `main.js` is about 1700 lines and mixes unrelated responsibilities. Small edits can accidentally affect search, URL state, cards, calendar, export, and language rendering.
- The group builder and old search-field model overlap. `openGroupTimetableFromBuilder` sets `activeFilters.searchFieldType = 'study_group'` while the visible selector is reset to `all`; initialization reconstructs builder state from `searchField=study_group`.
- `getSessionData` and `renderHeaderStatsBar` include production `console.log` debug output, including deep-copying all sessions with `JSON.parse(JSON.stringify(...))`. That is a real cost on large selections.
- HTML is generated with template strings from data fields without escaping. The JSON is local/curated, but it is still a contract: future data ingestion must not allow arbitrary HTML in course names, instructors, comments, descriptions, or group labels.
- `getTimetable.js` reads and parses the full 27 MB `sessions.json` on every function invocation. That keeps client payloads small, but serverless cold and repeated invocations pay full parse cost.
- `server.js` path normalization is intended to prevent traversal, but `path.join(process.cwd(), safePath)` with normalized absolute-looking inputs is a security-sensitive pattern. This matters less for local development, but it should not be copied into production code.

### ambiguities or brittle conventions

- Docs and data counts differ. Current data has 860 courses and 332 groups; top-level docs still say roughly 1000 courses and 395 groups. This is not a functional bug, but agents may treat the older numbers as current truth.
- `docs/distilled-how-to-run.md` says Netlify Dev is available at `localhost:8888`, while `package.json` and README use `npm run dev:netlify` with `-p 8000`.
- `docs/distilled-how-timetable-logic-works.md` says CSV export is tab-separated, but `main.js` emits comma-separated CSV with BOM.
- `docs/distilled-how-timetable-logic-works.md` says the 4000-session limit is enforced before calling `getTimetable`, but `toggleCalendarView` enforces it after fetching and counting returned rows.
- `index.html` loads Google Tag Manager with `G-4Z7G03F5WN` but configures `G-S3SQ4PZ2JF`; the repo does not identify which property is correct.
- `index.html` contains a static header stats block with raw `${online}` placeholders that is overwritten by `renderHeaderStatsBar`.
- `main.css` has invalid/dead-looking CSS, including `border-color: tt-magenta !important;` and `text-align:remem 0.5rem;`.

### low-ROI concerns worth ignoring

- Do not introduce React, Vue, TypeScript, Vite, or a component framework just to split `main.js`. The current app is small enough that targeted extraction and tests are higher ROI.
- Do not build a full backend or database. The static JSON plus filtered function model matches the current scale.
- Do not add broad linting/formatting churn before tests exist. It would create noise and increase merge risk.

## evidence-backed findings

1. **[High] No automated behavioral safety net.** `npm test` fails by design, no `tests/` folder exists, and only syntax checks are available. This is the biggest blocker to safe AI edits because the highest-risk behavior is interactive: search filters, group builder, URL reload, calendar rendering, and CSV export.

2. **[High] JSON LFS rule is too broad.** `.gitattributes` uses `*.json filter=lfs diff=lfs merge=lfs -text`, and `git lfs ls-files` confirms `package.json` and `package-lock.json` are in LFS. This can confuse dependency tooling, code review, diffs, and agents. LFS should be reserved for `sessions.json` and `unified_courses.json` unless there is a deliberate reason for every JSON file.

3. **[High] `main.js` is a large mixed-responsibility module.** It contains data loading, filter state, URL sync, rendering, group builder logic, calendar layout, export, and language updates. Examples: group parsing helpers around lines 193-223, filtering around 556-636, URL sync around 677-692, calendar fetch around 905-960, weekly rendering around 1071-1326, initialization around 1607-1683. This makes narrowly-scoped changes harder to verify.

4. **[Medium] Group builder state is still coupled to old search semantics.** `buildGroupTimetableUrl` writes `searchField=study_group`; `openGroupTimetableFromBuilder` sets `activeFilters.searchFieldType = 'study_group'` while setting the visible selector to `all`; initialization restores builder state from this URL shape. The docs already flag this as conceptual overlap. It is functional, but brittle.

5. **[Medium] Calendar docs drift from code.** `docs/distilled-how-timetable-logic-works.md` says the session limit is enforced before fetch; `main.js` fetches sessions first, sets `totalFilteredSessions`, then checks `CALENDAR_SESSION_LIMIT`. The same doc says CSV is tab-separated; `main.js` emits comma-separated CSV. `docs/distilled-how-to-run.md` gives Netlify Dev as `localhost:8888`, while `package.json` specifies port 8000.

6. **[Medium] Production debug logging can be expensive.** `renderHeaderStatsBar` logs filtered course statuses and course-code arrays on each render. `getSessionData` deep-copies and logs all sessions before and after group filtering. With thousands of sessions, this is unnecessary CPU/memory work and console noise.

7. **[Medium] HTML injection risk depends entirely on data trust.** `createCourseCardHTML`, `renderWeeklyView`, group chips, tooltips, and CSV export interpolate course/session fields directly into HTML strings. If the scraping pipeline ever allows HTML-bearing names, comments, instructors, descriptions, or groups, this becomes an XSS path. Current evidence shows local curated JSON, not live user input.

8. **[Medium] Backend parses the full sessions file on every calendar request.** `getTimetable.js` reads and parses `sessions.json` for each invocation, then filters by requested course IDs. The measured local cost is acceptable for the current UX envelope, so this is not an immediate optimization target, but it remains a predictable serverless cost if the dataset or selection size grows materially.

9. **[Low/Medium] Static server route should not be treated as hardened.** `server.js` is local-only, but its static file resolution is security-sensitive and should stay local. Future agents should not promote this pattern to production without a stricter root containment check.

10. **[Low] Dead or invalid UI artifacts are accumulating.** `test.txt` is tracked, `index.html` contains overwritten placeholder stats markup, `main.css` includes invalid values, and `netlify/functions/getTimetable.js` logs path existence on every call. These are not primary bugs, but they increase noise for future agents.

11. **[Low] Analytics configuration is inconsistent in the repo.** `index.html` loads one Google tag ID and configures another. The correct property is `G-S3SQ4PZ2JF`; the other ID should be removed to avoid future confusion.

## summary of likely AI failure modes

- Edit only card rendering or only calendar rendering and break the agreement between course cards, visible groups, online rows, and exported CSV.
- Treat `npm run dev` or the VS Code Python task as sufficient for calendar changes, missing the function dependency.
- Change URL parameters without preserving `group`, `search`, and `searchField=study_group` reload behavior.
- Load full `sessions.json` in the browser to simplify a feature.
- Add a framework or broad refactor instead of extracting small pure helpers and tests.
- Commit regenerated JSON or dependency files without noticing the broad LFS rule.
- Trust stale docs over code for ports, CSV format, or session limit timing.
- Remove or alter bilingual strings in only one language path.

## open questions or unknowns

None remain from this audit pass. The five previously open items are resolved as follows:

- Analytics: `G-S3SQ4PZ2JF` is the correct Google Analytics property. Remove `G-4Z7G03F5WN` from `index.html` to eliminate the confusion.
- `CLAUDE.md`: commit the uncommitted rewrite. The change is a small content fix, not a structural rewrite.
- Deleted doc: the removal of `docs/20250813-Gemini-Refactoring a Course Timetable Web App for Data Integrity and UX Enhancement` is intentional because the content is already present in the archived `docs/archive/early-sessions-2025/20250813-Gemini-Refactoring-Course-Timetable-Data-Integrity-UX.md`.
- Scraper contract: the external scraper repo is authoritative by design for the JSON data contract consumed here. `main.js` and `netlify/functions/getTimetable.js` must continue matching that contract.
- Function latency: the measured local latency is acceptable for current use, so no caching or database redesign is justified on that basis alone.