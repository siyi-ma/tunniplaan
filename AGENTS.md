# AGENTS.md

This file provides repository-specific guidance for coding agents working in `C:\Projects\tunniplaan`.

## Project Overview

TalTech Tunniplaan is a timetable viewer for Tallinn University of Technology. It is a single-page application with a vanilla JavaScript frontend and a Netlify function backend for timetable-session filtering.

Primary characteristics:

- around 1000 courses
- around 395 student groups
- Estonian-first UI with English translations
- course metadata loaded from `unified_courses.json`
- calendar sessions loaded from `sessions.json` through a backend endpoint

## Tech Stack

- Frontend: Vanilla JavaScript, HTML, CSS
- Styling: Tailwind CSS via CDN plus `main.css`
- Backend: Netlify function in `netlify/functions/getTimetable.js`
- Local backend alternative: `server.js`
- Data storage: Git LFS for `unified_courses.json` and `sessions.json`
- Hosting: Netlify

## Files That Matter Most

- `index.html`: search UI, filters, and page shell
- `main.js`: application state, filtering, rendering, calendar logic, language toggle
- `main.css`: custom styling
- `netlify/functions/getTimetable.js`: production timetable endpoint
- `server.js`: local HTTP server with a compatible `/.netlify/functions/getTimetable` route
- `netlify.toml`: ensures `sessions.json` is included with the function
- `.vscode/tasks.json`: local server and deploy tasks

## Local Development Commands

### Full local testing with Netlify function support

Use this for anything involving calendar view:

```bash
npm run dev:netlify
```

Runs on `http://localhost:8000`.

### Static frontend only

Use this only when the backend function is not needed:

```bash
npm run dev
```

Runs on `http://localhost:8000`.

This does not serve `/.netlify/functions/getTimetable`, so calendar view will fail in this mode.

### Local Node server with function-compatible route

```bash
npm start
```

Runs on `http://localhost:8888`.

This serves both the app and a local timetable endpoint.

### Git LFS

```bash
git lfs install
git lfs pull
git lfs ls-files
```

## Current Search and Calendar Behavior

The app supports both classic search and multi-group timetable search.

### Search box

The top search box supports comma-separated terms.

Supported search fields:

- all fields
- course name
- course code
- keyword
- instructor
- study group

### Multi-group timetable view

The main recent behavior change is support for combining multiple study groups in one calendar view through the main search box.

User flow:

1. Select `Study group` in the search field selector.
2. Enter groups separated by commas.
3. Open calendar view.

Implementation notes:

- group parsing is centralized in helper logic in `main.js`
- both the sidebar group filter and study-group search contribute to the active group set
- course cards and calendar rendering now use the relevant matching groups instead of assuming exactly one group

## Architecture Notes

### Frontend state

The main state lives in `main.js` through module-level variables such as:

- `allCourses`
- `filteredCourses`
- `currentLanguage`
- `isCalendarViewVisible`
- `totalFilteredSessions`
- `activeFilters`

### Data loading

1. `unified_courses.json` is loaded at startup.
2. Filtering happens client-side.
3. Opening calendar view triggers a request to `/.netlify/functions/getTimetable?courses=...`.
4. Returned sessions are merged and rendered in the weekly view.

### Calendar constraints

- The weekly calendar enforces a `CALENDAR_SESSION_LIMIT` of 4000.
- Use backend-assisted filtering for session retrieval.
- Do not make the client load the full `sessions.json`.

## Documentation Drift To Avoid

When updating docs or scripts, keep these distinctions accurate:

- `npm run dev` is static-only
- `npm run dev:netlify` is the recommended local mode for calendar testing
- `npm start` uses `server.js` on port 8888
- the VS Code Python task is static-only and not enough for calendar testing

## Common Change Patterns

### Adding or changing filters

1. Update `activeFilters` in `main.js`.
2. Update filtering logic in `applyAllFiltersAndRender`.
3. Update any dependent rendering logic for cards and calendar.
4. Update `uiTexts` for Estonian and English labels.
5. Update URL sync if the filter should persist in the query string.

### Changing calendar behavior

Check all of these areas in `main.js`:

- `toggleCalendarView`
- `getSessionData`
- `renderWeeklyView`
- course-card status or instructor derivation helpers

Avoid changing only one branch of the rendering path. The codebase has repeated assumptions between card view and calendar view.

### Changing local development workflow

If you add or change scripts in `package.json`, also update:

- `README.md`
- `AGENTS.md`
- any related error messages in `main.js`

## Performance and Safety Notes

- Keep `sessions.json` in Git LFS.
- Be mindful of Netlify function bundle size.
- Prefer targeted filtering over broader client-side session loading.
- Preserve existing bilingual behavior.
- Avoid introducing framework dependencies unless explicitly requested.

## Testing Guidance

Minimum expectations for changes:

- syntax-check `main.js` if modified
- test search and filter interactions for regressions
- if calendar code changes, verify in `npm run dev:netlify` or `npm start`

For multi-group calendar work specifically, verify:

- one group still works
- multiple comma-separated groups work
- card view and calendar view agree on the filtered course set
- URL state reloads correctly when relevant

## Docs

- `README.md`: user-facing and contributor-facing project guide
- `CLAUDE.md`: additional AI workflow notes
- `docs/`: logs, summaries, and AI collaboration material

## Last Updated

2026-04-21
