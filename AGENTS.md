# AGENTS.md

This file provides repository-specific guidance for coding agents working in `C:\Projects\tunniplaan`.

## Project Overview

TalTech Tunniplaan is a timetable viewer for Tallinn University of Technology. It is a single-page application with a vanilla JavaScript frontend and a Netlify function backend for timetable-session filtering.

Primary characteristics:

- around 1000 courses
- around 395 student groups
- Estonian-first UI with English translations
- course metadata loaded from `unified_courses.json`
- calendar sessions queried from Neon Postgres (`sessions` table) through the backend endpoint

## Tech Stack

- Frontend: Vanilla JavaScript, HTML, CSS
- Styling: Tailwind CSS via CDN plus `main.css`
- Backend: Netlify function in `netlify/functions/getTimetable.js`
- Database: Neon Postgres (`sessions` table) for timetable sessions
- Data storage: Git LFS for `unified_courses.json` (course metadata)
- Hosting: Netlify

## Files That Matter Most

- `index.html`: search UI, filters, and page shell
- `main.js`: application state, filtering, rendering, calendar logic, language toggle
- `main.css`: custom styling
- `netlify/functions/getTimetable.js`: production timetable endpoint (queries Neon)
- `db/schema.sql`: Neon Postgres schema for the timetable backend
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

Note: `npm run dev:netlify` auto-loads `.env`, so the function reads `NEON_DATABASE_URL` (read-only Neon connection string) to query the `sessions` table. Calendar view needs that variable set.

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

- The session limit (default 4000) is enforced **server-side** in `getTimetable.js`; when exceeded it returns `{ error: 'limit_exceeded', count, limit }` (HTTP 200) instead of the array. The client reads `count`/`limit` from that envelope to build its message.
- Use the backend endpoint for session retrieval; it queries Neon.
- Do not make the client load all sessions directly.

## Documentation Drift To Avoid

When updating docs or scripts, keep these distinctions accurate:

- `npm run dev` is static-only
- `npm run dev:netlify` is the recommended (and only) local mode for calendar testing; it needs `NEON_DATABASE_URL` in `.env`
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

- Keep `unified_courses.json` in Git LFS. Session data lives in Neon, not a bundled file.
- Be mindful of Netlify function bundle size.
- Prefer targeted filtering over broader client-side session loading.
- Preserve existing bilingual behavior.
- Avoid introducing framework dependencies unless explicitly requested.

## Testing Guidance

Minimum expectations for changes:

- syntax-check `main.js` if modified
- test search and filter interactions for regressions
- if calendar code changes, verify in `npm run dev:netlify`

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

2026-07-27
