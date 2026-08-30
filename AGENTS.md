# AGENTS.md

This file provides repository-specific guidance for coding agents working in `C:\Projects\tunniplaan`.

## Project Overview

TalTech Tunniplaan is a timetable viewer for Tallinn University of Technology. It is a single-page application with a vanilla JavaScript frontend. Course metadata and
timetable sessions both come from Neon Postgres through Netlify functions, so a data refresh
is a database ingest rather than a code deploy.

Primary characteristics:

- around 1000 courses
- around 395 student groups
- Estonian-first UI with English translations
- course metadata loaded from a versioned API (manifest + paged courses), not a static file
- calendar sessions queried from Neon Postgres (`sessions` table) through the backend endpoint

## Tech Stack

- Frontend: Vanilla JavaScript, HTML, CSS
- Styling: Tailwind CSS via CDN plus `main.css`
- Backend: Netlify functions in `netlify/functions/` — `getDatasetManifest`, `getCourses`, `getTimetable`
- Database: Neon Postgres (`sessions` table) for timetable sessions
- Data storage: Neon Postgres. `unified_courses.json` stays in Git LFS as a **rollback artifact only**
- Hosting: Netlify

## Files That Matter Most

- `index.html`: search UI, filters, and page shell
- `main.js`: application state, filtering, rendering, calendar logic, language toggle
- `main.css`: custom styling
- `netlify/functions/getTimetable.js`: production timetable endpoint (queries Neon)
- `db/schema.sql`: Neon Postgres schema for the timetable backend
- `.vscode/tasks.json`: local server and deploy tasks

## Local Development Commands

### Supported: the local function server

The page loads all of its data through functions now, so this is the only mode where it works
at all:

```bash
node scripts/dev-functions-server.js
```

Runs on `http://localhost:8000`. Reads `NEON_DATABASE_URL` from `.env`.

**Not Netlify**: no routing, redirects, payload-limit enforcement, or edge caching. It proves
handler behaviour, not platform behaviour.

### `npm run dev:netlify` — cannot run here

Expands to `npx netlify dev`; `npx` is blocked by group policy and `netlify-cli` is not
installed. Listed for environments that permit it.

### `npm run dev` — static only

```bash
npm run dev
```

Serves files but no functions, so the page cannot load its course data and shows the load
error. Useful only for editing CSS.

Note: `scripts/dev-functions-server.js` loads `.env` itself, so the functions read
`NEON_DATABASE_URL` (the read-only Neon connection string). Nothing loads without it.

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

1. `course-data.js` fetches the manifest, then every course page, and assembles the envelope.
2. Filtering happens client-side.
3. Opening calendar view triggers a request to `/.netlify/functions/getTimetable?courses=...`.
4. Returned sessions are merged and rendered in the weekly view.

### Calendar constraints

- The session limit (default 4000) is enforced **server-side** in `getTimetable.js`; when exceeded it returns `{ error: 'limit_exceeded', count, limit }` (HTTP 200) instead of the array. The client reads `count`/`limit` from that envelope to build its message.
- Use the backend endpoint for session retrieval; it queries Neon.
- Do not make the client load all sessions directly.

## Documentation Drift To Avoid

When updating docs or scripts, keep these distinctions accurate:

- `npm run dev` is static-only, and the page can no longer load its data at all in that mode
- `node scripts/dev-functions-server.js` is the supported local mode; it needs `NEON_DATABASE_URL` in `.env`. It is not Netlify and does not verify platform behaviour. `npm run dev:netlify` cannot run here (`npx` is policy-blocked)
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

- Keep `unified_courses.json` in Git LFS. All runtime data lives in Neon; that file is only the rollback artifact.
- Be mindful of Netlify function bundle size.
- Prefer targeted filtering over broader client-side session loading.
- Preserve existing bilingual behavior.
- Avoid introducing framework dependencies unless explicitly requested.

## Testing Guidance

Minimum expectations for changes:

- syntax-check `main.js` if modified
- test search and filter interactions for regressions
- if calendar or data-loading code changes, verify with `node scripts/dev-functions-server.js`, then run both contract scripts in `scripts/`

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
