# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and AI coding agents when working in this repository (`c:\Projects\tunniplaan`).

## Project Overview

TalTech Tunniplaan is a course timetable viewer for Tallinn University of Technology (TalTech). The application displays course information for ~1000 courses across ~395 student groups, with bilingual support (Estonian/English). Data is periodically synced from the official TalTech timetable system into Neon Postgres.

- **Live Site**: Hosted on Netlify
- **Primary Language**: Estonian (et) with English (en) translations
- **Data Architecture**: Course metadata and timetable sessions both load from Neon Postgres through Netlify functions. A data refresh is a database ingest, not a code deployment.

---

## Technology Stack

- **Frontend**: Vanilla JavaScript (no framework), HTML5, CSS3
- **Styling**: Tailwind CSS (via CDN), custom CSS in [main.css](main.css)
- **Backend**: Netlify serverless functions (`netlify/functions/`) — `getDatasetManifest`, `getCourses`, `getTimetable`
- **Database**: Neon Postgres (`semesters`, `groups`, `courses`, `sessions` tables)
- **Data Storage**: Neon Postgres. `unified_courses.json` stays in Git LFS as a **rollback artifact only**
- **Hosting**: Netlify

---

## Files That Matter Most

- [index.html](index.html): Search UI, filter controls, multi-group builder, and page shell
- [main.js](main.js): Application state, filtering, card grid & calendar rendering, language toggle
- [main.css](main.css): Custom brand styling and Tailwind overrides
- [course-data.js](course-data.js): API pagination reassembly and dataset envelope loading
- [netlify/functions/getTimetable.js](netlify/functions/getTimetable.js): Production timetable endpoint querying Neon Postgres
- [db/schema.sql](db/schema.sql): Neon Postgres relational database schema
- [.vscode/tasks.json](.vscode/tasks.json): Configured local server and deployment tasks

---

## Development Commands

### Supported Local Development Mode

The application loads all course metadata and timetable sessions through serverless functions. This is the **only supported local development mode**:

```bash
# Start the local function server (requires NEON_DATABASE_URL in .env)
node scripts/dev-functions-server.js
```
- Runs on `http://localhost:8000`.
- Reads `NEON_DATABASE_URL` (the read-only connection string) from `.env`.
- Handles `/.netlify/functions/getDatasetManifest`, `/.netlify/functions/getCourses`, and `/.netlify/functions/getTimetable`.

### Unsupported Commands

- `npm run dev`: Static HTTP file server only. Functions do not run in this mode, causing the application to show a load error. Useful only for editing static CSS.
- `npm run dev:netlify`: Expands to `npx netlify dev`. Blocked on environments where `npx` is restricted by group policy.

### Netlify Deployments

- **Automatic Deployments**: Pushing to `dev` produces a Netlify preview deploy (`https://dev--taltech-tunniplaan.netlify.app`), and pushing to `main` produces the production deploy.
- **Data Refreshes**: A routine data refresh is an ingest into Neon Postgres (`python neon_ingest.py` in `tunniplaanScraping`), **not a deployment**. Deployments are required only for frontend code changes.

---

## Architecture & Data Flow

### 1. Data Loading (`course-data.js`)
- Fetches `getDatasetManifest` (`no-store`), then fetches every `getCourses` page (4 at a time).
- Reassembles the `{semester, courses, groupToFacultyMap, scraping_datetime}` envelope.
- Refuses partial data: missing/duplicated pages or count mismatches fail the load rather than displaying incomplete lists.
- Falls back to committed `unified_courses.json` only when API serverless functions are unavailable.

### 2. Backend Functions (`netlify/functions/`)
- `getDatasetManifest.js`: Returns semester metadata, group map, total pages, and active `dataset_version`. Assembled via single SQL statement.
- `getCourses.js`: Returns paged courses (200 courses per page ordered by ID), cached for 1 year when version-pinned.
- `getTimetable.js`: Queries `sessions` table in Neon Postgres for requested courses (`?courses=ID1,ID2`). Enforces a 4,000 session limit envelope (`{ "error": "limit_exceeded", "count", "limit" }`).

### 3. Search & Multi-Group Timetable Builder
- Top search box supports comma-separated search terms across course names, codes, keywords, instructors, and study groups.
- Multi-group builder supports chip-based group selection, wildcard matching (`TVTB*`), URL parameter serialization, and weekly CSV exporting.
- Course cards and calendar view update dynamically based on the active group set.

---

## Common Change Patterns & Guidance

### Adding or Changing Filters
1. Update `activeFilters` in `main.js`.
2. Update filtering logic in `applyAllFiltersAndRender()`.
3. Update dependent card grid and calendar rendering logic.
4. Update `uiTexts` for Estonian and English labels.
5. Update URL state sync if filter should persist in query parameters.

### Changing Calendar Behavior
- Modify all dependent rendering paths in `main.js`: `toggleCalendarView`, `getSessionData`, `renderWeeklyView`, and status helper functions.
- Preserve timezone safety (`toLocalISODate`) and online-only banner rendering above grid.

### Testing Guidance
1. Syntax-check `main.js` if modified.
2. Verify local execution with `node scripts/dev-functions-server.js`.
3. Run backend API contract test scripts:
   ```bash
   node scripts/contract-test-getcourses.js
   node scripts/contract-test-gettimetable.js
   ```
4. Verify multi-group search: single group, comma-separated groups, wildcard prefix expansion, and URL state reloading.

---

## Documentation

- [README.md](README.md): User-facing overview and setup guide.
- [CLAUDE.md](CLAUDE.md): Master developer & AI agent reference manual (this file).
- [AGENTS.md](AGENTS.md): Pointer to CLAUDE.md for AI coding agents.
- [docs/](docs/): Distilled reference documents (`distilled-*.md`), recent handoffs, and archives.

---

## Last Updated

2026-09-04
