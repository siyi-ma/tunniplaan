# improvement-plan

## must-have changes

### 1. Add a minimal deterministic verification layer

Files involved: `package.json`, new `tests/` folder, optionally small fixtures under `tests/fixtures/`, and narrowly exported or duplicated pure helpers from `main.js`.

Problem: `npm test` is a failing placeholder, and there is no automated coverage for the repo's highest-risk behavior.

Why it matters: Future agents cannot safely change filtering, group timetable state, calendar grouping, or CSV export without browser-only manual verification.

Smallest effective fix:

- Add a Node-based test script using the built-in `node:test` runner. Do not add Jest/Vitest unless there is a concrete blocker.
- Start with pure-function tests for:
  - comma-separated group parsing
  - active group merging from sidebar group and `study_group` search state
  - course matching against multiple active groups
  - relevant `group_sessions` filtering
  - CSV escaping
- Add one backend test that calls `netlify/functions/getTimetable.js` with a known session-bearing course such as `TES0020` and asserts `statusCode === 200` and a non-empty array.
- Keep fixtures tiny. Do not copy `sessions.json` into tests.

Closed loop:

1. Inspect `main.js` helpers around `parseCommaSeparatedValues`, `getActiveGroupFilters`, `courseMatchesActiveGroups`, `getRelevantGroupSessions`, `getRelevantSessionGroups`, and `escapeCsvValue`.
2. Confirm whether extracting helpers to a small CommonJS module would require touching browser behavior. If extraction is risky, duplicate the minimal logic in tests first and file the extraction as a follow-up.
3. Replace the placeholder `npm test` with a deterministic command.
4. Run `npm test`, `node --check main.js`, `node --check server.js`, and `node --check netlify/functions/getTimetable.js`.
5. Stop after covering the core contracts above. Do not build broad browser automation in the same change.

Priority/ROI: must-have, high ROI.

### 2. Narrow the Git LFS JSON rule

Files involved: `.gitattributes`, `package.json`, `package-lock.json`, `sessions.json`, `unified_courses.json`.

Problem: `.gitattributes` sends every `*.json` file through Git LFS. Current LFS files include `package.json` and `package-lock.json`.

Why it matters: Package files should remain normal text for diffs, dependency tooling, and agent review. Only large runtime datasets need LFS.

Smallest effective fix:

- Change `.gitattributes` from `*.json filter=lfs diff=lfs merge=lfs -text` to explicit rules for:
  - `sessions.json filter=lfs diff=lfs merge=lfs -text`
  - `unified_courses.json filter=lfs diff=lfs merge=lfs -text`
- Migrate `package.json` and `package-lock.json` back to normal Git blobs using the standard Git LFS migration/de-tracking workflow.

Closed loop:

1. Inspect `git lfs ls-files` and `git status --short`.
2. Confirm no other JSON files intentionally require LFS.
3. Edit only `.gitattributes` first.
4. De-track and recommit `package.json` and `package-lock.json` as normal text while keeping `sessions.json` and `unified_courses.json` in LFS.
5. Verify with `git lfs ls-files` that only the two data files remain, then run `npm test` or at least `npm install --package-lock-only --ignore-scripts` only if dependency metadata changed.
6. Stop if Git LFS migration would rewrite published history; report that the safer path is a forward-only recommit.

Priority/ROI: must-have, high ROI.

### 3. Make docs match executable behavior

Files involved: `README.md`, `AGENTS.md`, `docs/distilled-how-to-run.md`, `docs/distilled-how-timetable-logic-works.md`, possibly `CLAUDE.md` if the user wants the uncommitted rewrite committed.

Problem: Some docs drift from code on Netlify Dev port, CSV delimiter, session limit timing, and current data counts.

Why it matters: This repo is heavily agent-operated. Agents will follow docs, and incorrect run-mode instructions lead directly to false verification.

Smallest effective fix:

- Update `docs/distilled-how-to-run.md` to state `npm run dev:netlify` uses `http://localhost:8000` based on `package.json`.
- Update `docs/distilled-how-timetable-logic-works.md` to say CSV is comma-separated with UTF-8 BOM and that the 4000-session limit is checked after backend filtering returns.
- Where docs mention exact dataset counts, either update them to the current snapshot or keep them rounded and explicitly dated.
- Preserve the distinction that `npm run dev` and the VS Code Python task are static-only.

Closed loop:

1. Inspect `package.json`, `.vscode/tasks.json`, `main.js`, and the three active docs.
2. Edit only mismatches that are contradicted by executable repo files.
3. Run a text search for `8888`, `tab-separated`, `before fetch`, `42 MB`, `395`, and `1000`.
4. Verify no doc now claims static servers can test calendar view.
5. Stop before rewriting historical archive files unless they are listed as active references in `docs/README.md`.

Priority/ROI: must-have, high ROI.

## high-ROI improvements

### 4. Remove production debug logging and heavy session deep copies

Files involved: `main.js`, `netlify/functions/getTimetable.js`.

Problem: Render paths and session processing log large arrays and status lists. The Netlify function logs path checks on every request.

Why it matters: Console noise hides real errors. Deep-copy logging of session arrays adds avoidable CPU and memory cost when calendar selections are large.

Smallest effective fix:

- Remove or gate the `console.log` calls in `renderHeaderStatsBar` and `getSessionData`.
- Remove routine path-existence logging in `getTimetable.js`, keeping only error logging.
- If debug output is still needed, gate it behind a single `const DEBUG = false`.

Closed loop:

1. Search `main.js` and `netlify/functions/getTimetable.js` for `console.log` and `DEBUG`.
2. Remove only nonessential logs; keep `console.error` in failure paths.
3. Run syntax checks.
4. Manually smoke one calendar fetch via the function handler or `npm start`.
5. Stop without changing rendering logic.

Priority/ROI: high-ROI.

### 5. Extract the smallest stable helper module from `main.js`

Files involved: `main.js`, new `timetable-helpers.js` or similar, `tests/`.

Problem: The safest-to-test logic is trapped inside a browser-global file.

Why it matters: Tests need pure functions for group parsing, filtering, session grouping, and CSV escaping without booting the whole DOM.

Smallest effective fix:

- Extract only pure helpers with no DOM dependency:
  - `parseCommaSeparatedValues`
  - `normalizeGroupKey`
  - group filter set construction
  - course/group matching helpers that accept explicit filters as parameters
  - `escapeCsvValue`
  - date formatting helpers if needed
- Keep function names stable where possible.
- In the browser, attach or import the helpers without changing user-visible behavior.

Closed loop:

1. Add tests first for current behavior.
2. Extract one helper group at a time.
3. Run `npm test` and syntax checks after each extraction.
4. Stop if the extraction forces broad DOM or module-loading changes; keep tests and defer extraction.

Priority/ROI: high-ROI, but only after the initial tests exist.

### 6. Decouple group builder URL state from visible search semantics

Files involved: `main.js`, `README.md`, `AGENTS.md`, `docs/distilled-how-timetable-logic-works.md`, tests added in item 1.

Problem: The dedicated group builder persists through `searchField=study_group`, even though the visible search selector no longer exposes study-group search.

Why it matters: URL reloads, active filter pills, sidebar group filter, and builder state can diverge. This is a likely source of plausible but wrong AI edits.

Smallest effective fix:

- Introduce a dedicated URL parameter such as `groups=EAUI71,EAUI72` for the builder.
- Keep backward compatibility: continue reading old `searchField=study_group&search=...` URLs.
- When writing new URLs, prefer the new `groups` parameter and do not set `searchField=study_group`.
- Keep sidebar `group=` semantics separate.

Closed loop:

1. Inspect current URL read/write points: `updateDynamicTitle`, `buildGroupTimetableUrl`, `updateURLParameters`, and `initializeApp`.
2. Add tests for old URL compatibility and new URL writing before editing behavior.
3. Make the smallest URL-state change.
4. Verify one group, multiple groups, prefix groups, copy link, reload from link, and sidebar group filter.
5. Stop if preserving old links becomes ambiguous; document the ambiguity rather than silently breaking old URLs.

Priority/ROI: high-ROI.

### 7. Add one browser smoke path after helper tests exist

Files involved: `package.json`, new smoke script under `tests/` or `scripts/`, maybe `server.js`.

Problem: Pure tests cannot prove the actual DOM flow works.

Why it matters: The app's main risk is interaction across search controls, URL state, calendar open, and CSV export.

Smallest effective fix:

- Use a minimal browser automation smoke test only after Node tests exist.
- Prefer starting `npm start` because it serves the function-compatible route on port 8888 without Netlify CLI.
- Smoke:
  - page loads
  - add one group in builder
  - add prefix pattern such as `TVTB*`
  - open timetable
  - assert calendar view appears and no function 404 message is shown

Closed loop:

1. Confirm whether a browser automation dependency is acceptable. If not, document a manual checklist instead.
2. Keep the smoke to one path. Do not attempt full visual regression.
3. Run locally and document the command in README/AGENTS.
4. Stop before adding CI or deployment gates unless the user asks.

Priority/ROI: high-ROI, but second phase.

## lower-priority improvements

### 8. Clean small UI and repo noise

Files involved: `index.html`, `main.css`, `test.txt`, `netlify/functions/getTimetable.js`.

Problem: There are overwritten placeholders, invalid CSS values, a tracked `test.txt`, and routine function logs.

Why it matters: Low-level noise makes agent diffs and code searches less reliable.

Smallest effective fix:

- Remove static `${online}` header stat placeholders from `index.html` or replace them with neutral loading markup.
- Fix invalid CSS values in `main.css`.
- Delete `test.txt` if it has no operational use.
- Remove routine function path logs as covered above.

Closed loop:

1. Inspect each artifact and confirm it is not referenced.
2. Make one cleanup commit with no behavior changes.
3. Run syntax checks and manually load the page.
4. Stop before restyling the UI.

Priority/ROI: lower-priority.

### 9. Add an explicit data contract note inside this repo

Files involved: new `docs/data-contract.md` or an updated active docs file.

Problem: The app depends on fields in two generated JSON files, but the generator is outside this repo.

Why it matters: Agents changing frontend or data ingestion need to know which fields are required and which assumptions are intentional.

Smallest effective fix:

- Document only fields consumed by this repo:
  - `unified_courses.json.courses[].id`
  - names, descriptions, EAP, school/institute fields
  - `groups`
  - `group_sessions[].group`, `session_status`, `instructors`, `keel`, `ainekv`
  - `sessions[].course_id`, `date`, `start`, `end`, `type`, `instructor`, `room`, `comment`, `groups`, `is_veebiope`
- State that `unified_courses.json` is authoritative for course-group-instructor relationships.

Closed loop:

1. Inspect `main.js`, `server.js`, and `getTimetable.js` for consumed fields.
2. Write the contract from code, not from memory.
3. Link it from README and AGENTS.
4. Stop before documenting the external scraper internals unless they are copied into this repo.

Priority/ROI: lower-priority but useful for agent safety.

### 10. Measure backend filtering latency before optimizing it

Files involved: `netlify/functions/getTimetable.js`, optional local script under `scripts/`.

Problem: The function parses all sessions on each request, but the repo has no latency baseline.

Why it matters: Optimization without measurement may add complexity without improving user experience.

Smallest effective fix:

- Add a local timing script that calls the handler for one small selection and one large selection.
- Record parse/filter timings without changing function behavior.
- Only consider caching or pre-indexing if timing is actually bad.

Closed loop:

1. Measure current local handler time with representative course selections.
2. If acceptable, document the result and stop.
3. If unacceptable, consider module-level cache inside the function as the first experiment.
4. Verify memory impact and Netlify behavior before committing.

Priority/ROI: lower-priority unless users report slow calendar loads.

## changes to reject or defer

- Reject a full rewrite or migration to a frontend framework unless there is a concrete product requirement that vanilla JS cannot meet.
- Reject client-side loading of full `sessions.json`.
- Reject broad lint/format churn before tests exist.
- Defer CI setup until `npm test` is meaningful.
- Defer database/API redesign. Static JSON plus server-filtered sessions is appropriate for the current scale.
- Defer visual redesign of the group builder until functional verification exists.
- Do not edit archived historical docs just to make old session notes match current code.

## autonomous execution loop

For every future change, use this loop:

1. Inspect the minimum evidence: target files, active docs, and current `git status --short`.
2. Confirm the scope boundary: frontend-only, calendar/function, docs-only, or data-contract.
3. Make the smallest effective change.
4. Validate with repo-native checks:
   - Always: `node --check main.js` if `main.js` changed.
   - Backend: `node --check server.js` and `node --check netlify/functions/getTimetable.js` if backend files changed.
   - Tests: `npm test` once implemented.
   - Calendar behavior: use `npm run dev:netlify` or `npm start`, not `npm run dev`.
5. Report what changed and what remains uncertain.

Stop conditions:

- Stop if a change requires guessing the external scraper schema.
- Stop if URL backward compatibility is ambiguous.
- Stop if Git LFS migration would require history rewriting.
- Stop if a browser smoke test requires new dependencies and the user has not approved that direction.
- Stop if unrelated dirty files would need to be overwritten.

## execution order

1. Add minimal Node tests and replace the placeholder `npm test`.
2. Narrow `.gitattributes` and restore package JSON files to normal Git tracking without rewriting history.
3. Update active docs to match executable behavior.
4. Remove debug logging and cheap noise.
5. Extract pure helpers from `main.js` only after tests exist.
6. Decouple group builder URL state while preserving old links.
7. Add one browser smoke path.
8. Document the local data contract.
9. Measure backend function latency before considering optimization.
