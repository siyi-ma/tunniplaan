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
- **Backend**: Netlify serverless functions (`netlify/functions/`) — `getDatasetManifest`, `getCourses`, `getTimetable`, `humanVerification`
- **Database**: Neon Postgres (`semesters`, `groups`, `courses`, `sessions` tables)
- **Data Storage**: Neon Postgres. `unified_courses.json` is **no longer committed or deployed**. Do not re-add it or any other full dump of the dataset: it would be served from a public URL and would make the human gate decorative, and no test would fail. Recovery, if ever needed, is `git show e28c72b:unified_courses.json`
- **Hosting**: Netlify (production and the `dev` preview). A second target, ChatGPT Sites at `tunniplaan.taltech.chatgpt.site`, is built with `npm run build:sites` and deployed by hand. See [docs/chatgpt-sites.md](docs/chatgpt-sites.md). Netlify is not replaced by it.

---

## Files That Matter Most

- [index.html](index.html): Search UI, filter controls, multi-group builder, and page shell
- [main.js](main.js): Application state, filtering, card grid & calendar rendering, language toggle
- [main.css](main.css): Custom brand styling and Tailwind overrides
- [course-data.js](course-data.js): API pagination reassembly and dataset envelope loading
- [server/api/](server/api): Shared dataset queries (`getDatasetManifest`, `getCourses`, `getTimetable`). Both adapters call these.
- [netlify/functions/getTimetable.js](netlify/functions/getTimetable.js): Netlify adapter for the timetable query. Opens Neon from `process.env` and applies the human gate.
- [netlify/functions/lib/humanVerification.js](netlify/functions/lib/humanVerification.js): sign/verify for the human gate, plus the withHumanGate wrapper. Netlify only; the Sites bundle must not import it (`node:crypto`).
- [sites/worker/app.ts](sites/worker/app.ts): ChatGPT Sites adapter. Identity header, `/api/*` routing, `ASSETS` for static files.
- [scripts/lib/script-support.js](scripts/lib/script-support.js): loadDotEnv, argValue, resolveSourceDir and the self-signed human pass, shared by every script in scripts/
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
- **Data Refreshes**: A routine data refresh is an ingest into Neon Postgres (`python neon_ingest.py` in `tunniplaanScraping`), **not a deployment**. Deployments are required only for frontend code changes. Both targets read the same Neon database, so an ingest shows up on both without a Site rebuild.

### ChatGPT Sites build

```bash
npm run build:sites
npm run sites:release -- --dest /path/to/the/site/source/folder
```

- `build:sites` writes `dist/client`, `dist/server/index.js` and `dist/.openai/hosting.json`. It does not deploy, and Netlify does not publish `dist/`.
- `sites:release` refuses a dirty worktree, then copies that dist into the folder a version is saved from. Saving a version and deploying it are manual, in the Sites UI.
- Runbook: [docs/chatgpt-sites.md](docs/chatgpt-sites.md).

---

## Architecture & Data Flow

### 1. Data Loading (`course-data.js`)
- Fetches `getDatasetManifest` (`no-store`), then fetches every `getCourses` page (4 at a time).
- Reassembles the `{semester, courses, groupToFacultyMap, scraping_datetime}` envelope.
- Refuses partial data: missing/duplicated pages or count mismatches fail the load rather than displaying incomplete lists.
- The static fallback is off (`STATIC_FALLBACK_ENABLED = false` in main.js). An API outage is now a load error rather than a silently stale dataset, because that fallback file was also an ungated copy of everything the human gate protects.

### 2. Backend Functions (`netlify/functions/`)
- `getDatasetManifest.js`: Returns semester metadata, group map, total pages, and active `dataset_version`. Assembled via single SQL statement.
- `getCourses.js`: Returns paged courses (200 courses per page ordered by ID), cached for 1 year when version-pinned.
- `getTimetable.js`: Queries `sessions` table in Neon Postgres for requested courses (`?courses=ID1,ID2`). Enforces a 4,000 session limit envelope (`{ "error": "limit_exceeded", "count", "limit" }`).
- `humanVerification.js`: POST-only. Mints the human-verification pass. See below.

### 2b. Human Verification Gate

A "prove you are human" overlay stands in front of the app, ported from
`survey_maj_dekanaadi_kysitlus`. The slider is UX; the security is an
HMAC-SHA256 signed cookie (`tt_human_verified`, HttpOnly, SameSite=Lax, 12 h).

- [netlify/functions/lib/humanVerification.js](netlify/functions/lib/humanVerification.js) holds sign/verify plus the `withHumanGate` wrapper. It lives in `lib/` because Netlify publishes every top-level `.js` in the functions directory as an endpoint.
- All three data endpoints wrap `exports.handler` in `withHumanGate`. Unit tests call `handleRequest` and so bypass the gate by design; the contract-test scripts call `handler` and therefore sign themselves a pass.
- Gated responses are downgraded from `public` to `private` caching. The Netlify CDN keys on URL, not on cookie, so one verified visitor would otherwise warm a shared cache that then answers everyone. The year-long *browser* cache is kept.
- The gate **fails open** when no signing secret is available: a missing env var must not take the public timetable offline for the whole university.
- Env: `HUMAN_VERIFICATION_SECRET` (falls back to a one-way derivation from `NEON_DATABASE_URL`), `HUMAN_VERIFICATION_ENABLED=false` to disable.
- A 403 mid-session is **not** treated as API unavailability. Treating it that way would route the tab to the static fallback, which was itself an ungated copy of the dataset. The frontend clears its marker and reloads once into the gate.

### 2c. ChatGPT Sites

A second host, `tunniplaan.taltech.chatgpt.site`. The dataset queries are the ones in `server/api/`; the Site does not carry a second copy of the SQL.

- The Worker entry is [sites/worker/index.ts](sites/worker/index.ts). It calls `handleFetch` in [sites/worker/app.ts](sites/worker/app.ts). Static files go out through `env.ASSETS`. `/api/getDatasetManifest`, `/api/getCourses` and `/api/getTimetable` call the shared handlers.
- Settings arrive on the request `env` (`NEON_DATABASE_URL`, `ALLOWED_EMAIL_DOMAINS`, `CALENDAR_SESSION_LIMIT`). Do not read them from `process.env` on this path, and do not compile them into the bundle.
- Admission is the platform header `oai-authenticated-user-email`. Missing or unusable → 401 `{ "error": "unauthenticated" }`. Domain not in `ALLOWED_EMAIL_DOMAINS` (default `taltech.ee`; `*` allows any signed-in address) → 403 `{ "error": "forbidden_domain" }`. The slider is not shown: the Sites build injects `<meta name="tunniplaan-target" content="sites">`, and a `*.chatgpt.site` hostname does the same. The Netlify gate is untouched.
- Gated data responses have `public` cache policies rewritten to `private`, same rule as `scopeCacheToClient`, without importing the signer.
- The Worker bundle must not contain `node:crypto`, `node:buffer`, or the human-verification signer. `npm run build:sites` fails if they appear, and it fails if a dataset dump is in `dist/`.
- `.openai/hosting.json` is the project link only. Never a secret.

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
1. Syntax-check `main.js` if modified. `npm test` runs the unit tests, including the Sites worker adapter (401 without the identity header, domain rejection, routing, `limit_exceeded`).
2. Verify local execution with `node scripts/dev-functions-server.js`. `npm run build:sites` must succeed after a Worker or static-shell change.
3. Run backend API contract test scripts:
   ```bash
   node scripts/contract-test-getcourses.js
   node scripts/contract-test-gettimetable.js
   ```
4. After a data refresh, verify the dataset against the upstream source of truth:
   ```bash
   node scripts/sample-verify-vs-official.js --groups 20
   ```
   The contract tests prove the API serves exactly what the scrape wrote; both
   sides of that comparison come from the same Selenium run, so a scrape that
   misread the site passes them at 100%. This script diffs against TalTech's own
   public REST API instead, and is the only check that catches that class of bug.
5. Verify multi-group search: single group, comma-separated groups, wildcard prefix expansion, and URL state reloading.

---

## Documentation

- [README.md](README.md): User-facing overview and setup guide.
- [CLAUDE.md](CLAUDE.md): Master developer & AI agent reference manual (this file).
- [AGENTS.md](AGENTS.md): Pointer to CLAUDE.md for AI coding agents.
- [docs/](docs/): Distilled reference documents (`distilled-*.md`), recent handoffs, and archives.

---

## Last Updated

2026-10-20
