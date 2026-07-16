# Current Task Objectives

- Move current timetable UX work onto `dev` instead of continuing on `main`
- Replace study-group search mode as the primary multi-group path with a dedicated `Build timetable by groups` workflow
- Improve search UX with contextual examples
- Fix English keyword search mismatch
- Add CSV export for visible timetable data
- Update project documentation to reflect the new workflow

# Current Progress

- Switched the working branch from `main` to `dev`
- Committed and pushed the main feature set to `origin/dev`
- Added a dedicated group-timetable builder UI in `index.html`
- Added chip-based group selection, autocomplete, keyboard acceptance, and reusable-link generation in `main.js`
- Added CSV export from calendar view in `main.js`
- Fixed keyword search so English UI searches English keyword fields first with fallback to Estonian
- Updated `README.md`
- Added `AGENTS.md`

# Key Context

- Repo path: `C:\Projects\tunniplaan`
- Active branch during handoff creation: `dev`
- Last pushed feature commit: `3bbd62b Add dedicated group timetable builder`
- Local worktree at handoff time still contains unstaged changes after that commit:
  - `main.js`
  - `package-lock.json`
  - untracked `deno.lock`

Files most relevant to the current work:

- `index.html`
- `main.js`
- `README.md`
- `AGENTS.md`
- `package.json`

Commands run in this session:

- `git switch dev`
- `git add README.md AGENTS.md index.html main.js package.json`
- `git commit -m "Add dedicated group timetable builder"`
- `git push origin dev`
- repeated `node` syntax checks for `main.js`
- targeted PowerShell and Python inspection commands against `unified_courses.json`

# Key Findings

- The old UX overloaded the general search selector with a special-purpose `study_group` mode. A dedicated builder is clearer.
- Keyword search originally looked only at Estonian keyword-related fields, which made English searches such as `economics` return only one result.
- Static local servers such as `python -m http.server` and `npm run dev` do not support the Netlify timetable endpoint. `npm run dev:netlify` or `npm start` is required for calendar testing.
- The data contains 8 groups starting with `TVTB`:
  - `TVTB21`
  - `TVTB22`
  - `TVTB41`
  - `TVTB42`
  - `TVTB61`
  - `TVTB62`
  - `TVTB63`
  - `TVTB64`
- Prefix bulk-add logic was implemented for patterns like `TVTB*`, but the first implementation only worked when the input was explicitly committed. This was then fixed so clicking `Open timetable` or `Copy link` also commits pending input first.

# Incomplete Items

- The latest prefix bulk-add fix in `main.js` has been syntax-checked, but not committed or pushed yet.
- `README.md` has been updated locally in this handoff pass, but also has not been committed yet.
- `package-lock.json` and `deno.lock` were already present as unrelated local worktree items and were intentionally not included in the earlier feature commit.
- No browser-based verification was run after the last `TVTB*` pending-input fix.
- No follow-up visual polish has been done on the dedicated builder UI beyond functional implementation.

# Suggested Handoff Path

1. Review the current local diff in `main.js` and `README.md`.
2. Run browser verification on `dev` using `npm run dev:netlify`.
3. Specifically test:
   - adding one group with autocomplete
   - adding multiple groups with `Tab` / `Enter`
   - prefix bulk-add with `TVTB*`
   - `Copy link`
   - reload from the copied URL
   - calendar open
   - CSV export
4. If behavior is correct, stage only the intended files and commit the remaining doc and bugfix changes on `dev`.
5. Leave `package-lock.json` and `deno.lock` alone unless there is a deliberate dependency change to explain them.

# Risks and Notes

- The group-builder workflow now uses `searchField=study_group` in the URL as internal state, even though the dedicated builder is the primary UI. That is fine operationally, but it means URL/state logic is still partially coupled to the old filter model.
- `main.js` is large and contains repeated logic paths between card view and calendar view. Small changes can affect multiple user flows.
- `updateAllUITexts()` updates any element whose id matches a `uiTexts` key; new UI labels should continue following that pattern.
- There is a risk of confusion if the old sidebar group filter and the new builder are both used in the same session. The code supports this, but it is still a conceptual overlap to watch.
- The current CSV export covers the visible week and online-only rows. If users expect a full-range export, that needs separate design and implementation.

# Suggested First Step for the Next Agent

Run `npm run dev:netlify` on `dev`, verify that typing `TVTB*` and clicking `Open timetable` adds and opens all matching groups without needing `Enter`, then commit the current `main.js` and `README.md` changes if the behavior is correct.
