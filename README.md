# TalTech Tunniplaan

TalTech Tunniplaan is a vanilla JavaScript timetable viewer for Tallinn University of Technology (TalTech). It shows course metadata and timetable sessions for roughly 1000 courses and 430 student groups, with Estonian and English UI support.

The app is deployed on Netlify. Course metadata and timetable sessions both come from a Neon
Postgres database through Netlify functions, so a data refresh is a database ingest rather
than a code deploy.

## Features

- Search courses by title, course code, keyword, or instructor
- Build a combined timetable by adding multiple study groups in a dedicated group builder
- Use autocomplete and `Tab` / `Enter` to add groups quickly
- Bulk-add groups by prefix with patterns like `TVTB*`
- Copy a reusable link for the selected group timetable
- Export the visible timetable week as CSV
- Filter by faculty, institute, group, EAP, assessment form, and teaching language
- Switch between card view and weekly calendar view
- View bilingual UI text in Estonian and English
- Distinguish online, hybrid, and offline courses visually

## Stack

- Frontend: Vanilla JavaScript, HTML, CSS
- Styling: Tailwind CSS via CDN plus `main.css`
- Backend: Netlify serverless functions in `netlify/functions/`
- Database: Neon Postgres — `semesters`, `groups`, `courses`, `sessions`
- Data: served from Neon through a versioned API, behind a human-verification gate.
  `unified_courses.json` is no longer deployed or committed here at all

## Prerequisites

- Node.js

> **`npm` and `npx` are blocked by group policy on the maintainer's devices.** Invoke Node
> directly instead: `node --test` for the suite, `node --check <file>` for syntax,
> `node scripts/<name>.js` for scripts. To satisfy a missing dependency, copy the
> lockfile-pinned version out of a sibling project's `node_modules` rather than installing --
> check the sibling's version against `package-lock.json` first. The npm commands below are
> the upstream equivalents, for anyone whose environment permits them.

## Setup

1. Clone the repository.
2. Install npm dependencies.

```bash
npm install
```

There is no Git LFS step. This repository tracks no LFS files any more -- `git lfs ls-files`
is empty.

## Local Development

There are three local run modes. Only one of them serves the functions.

### Supported: the local function server

The app now loads **all** its data through functions, so this is the only mode where the page
works at all.

```bash
node scripts/dev-functions-server.js        # http://localhost:8000
```

It serves the repository statically and dispatches `/.netlify/functions/<name>` to that
module's exported `handler`, returning the handler's status, headers and body verbatim. It
reads `NEON_DATABASE_URL` from `.env`.

**It is not Netlify.** It does not reproduce Netlify's routing, redirects, payload-limit
enforcement, or edge caching. It proves handler behaviour, not platform behaviour — real CDN
and cache behaviour is only confirmed on a branch deploy.

### `npm run dev:netlify` — cannot run here

Expands to `npx netlify dev`. `npx` is blocked by group policy on the maintainer's devices
and `netlify-cli` is not in `node_modules`. Listed for anyone whose environment permits it.

### `npm run dev` — static only, and no longer sufficient

Serves files but **no functions**, so the page cannot load its course data at all: it will
show the load error rather than falling back silently. Useful only for editing CSS.

Note: `python -m http.server` sends `Last-Modified` but no `Cache-Control`, so browsers apply
heuristic freshness and may keep serving a stale `main.js` after an edit. Hard-reload with
`Ctrl+Shift+R`.

To confirm what a server is actually sending rather than what the browser is showing:

```bash
curl -s http://localhost:8000/main.js | grep -c "<a string from your edit>"
```

## VS Code Tasks

The repository includes tasks in `.vscode/tasks.json`.

- `Run Localhost Server`: runs `python -m http.server 8000`
- `Netlify: Deploy Main Branch`
- `Netlify: Deploy Dev Branch`

Important: the localhost Python task serves static files only. It does not provide the timetable function, so it is not suitable for calendar-view testing.

## Search and Calendar Behavior

### General search

The main search box supports comma-separated terms and field-specific examples for:

- all fields
- course name
- course code
- keyword
- instructor

Keyword search now checks the active UI language first and falls back to the other language if translations are missing.

### Build timetable by groups

The main timetable-composition flow is now separate from the general search.

To build a combined timetable by study groups:

1. Open the `Build timetable by groups` section.
2. Add one or more study groups using autocomplete.
3. Press `Tab` or `Enter` to accept the current group.
4. Click `Open timetable`.

Supported shortcuts:

- Add multiple specific groups such as `EAUI71, EAUI72`
- Add all matching groups by prefix with a pattern like `TVTB*`
- Use `Copy link` to generate a reusable URL for the selected group set

### Calendar export

In calendar view, the `Export CSV` button downloads the currently visible timetable week as a UTF-8 CSV file that opens correctly in Excel.

The export includes:

- date
- time
- course code
- course name
- type
- room
- instructors
- visible groups
- mandatory and elective groups
- comment
- online-only indicator

## Data: what lives where

Three different things are easy to confuse, so they are named separately:

| | What it is | Where it lives |
|---|---|---|
| **Source artifacts** | `unified_courses.json` + `sessions.json` + `metadata.json`, written by the scraper | the scraper's data directory (`TUNNIPLAAN_DATA_DIR`), **not** this repository |
| **Runtime data** | the four Neon tables the site actually serves from | Neon Postgres; see `db/schema.sql` |
| **Rollback artifact** | *(retired 2026-09-04)* | Git history only |

There used to be a third thing here: a committed copy of `unified_courses.json`, served as a
static fallback when the API was unavailable. It was removed, and `STATIC_FALLBACK_ENABLED`
in `main.js` is `false`.

The reason is the human-verification gate below. A committed dataset is a public URL on the
deployed site that hands the whole thing to anyone who asks — including precisely the callers
the gate refuses. The fallback did not sit behind the gate; it *was* the way around it. An
API outage is now a visible load error rather than a silently stale dataset, which is the
smaller of the two problems.

If a rollback copy is ever genuinely needed it is in Git history:
`git show e28c72b:unified_courses.json`. The scraper's `publish_to_webapp.py`, which used to
republish it on every scrape, has been deleted for the same reason.

`sessions.json` is gitignored and absent from this repository.

## Architecture

### Frontend

- `index.html`: application shell, general course search UI, and dedicated group-timetable builder UI
- `course-data.js`: loads the manifest and course pages, enforces bounded concurrency, and
  refuses partial data — a missing, duplicated or version-mismatched page fails the load
  rather than rendering a short list
- `main.js`: state management, filtering, rendering, language toggle, group builder logic, calendar logic, CSV export
- `main.css`: custom styles

### Backend

- `netlify/functions/getDatasetManifest.js`: the small uncached document every load starts
  from — semester, group map, course count, and the active `dataset_version`
- `netlify/functions/getCourses.js`: one bounded, content-addressed page of courses
  (200 per page, immutable for a year)
- `netlify/functions/getTimetable.js`: sessions for the requested courses, pinned to a
  dataset version, with a server-side session limit
- `netlify/functions/humanVerification.js`: POST-only. Mints the verification pass
- `netlify/functions/lib/dataset.js`: shared cache policies, the version regex, the memoised
  Neon client and the JSON response builder
- `netlify/functions/lib/humanVerification.js`: sign/verify plus the `withHumanGate` wrapper
  the three data endpoints are wrapped in
- Both `lib/` files are in a subdirectory on purpose — Netlify deploys every top-level `.js`
  in the functions directory as its own endpoint
- `db/schema.sql`, `db/migrations/`: Neon schema and migrations
- `scripts/contract-test-getcourses.js`, `scripts/contract-test-gettimetable.js`: verify the
  API reproduces the source artifacts exactly
- `scripts/sample-verify-vs-official.js`: diff sampled groups against TalTech's own public
  REST API. The contract tests above compare the dataset with itself, so they cannot catch a
  scrape that misread the site; this can. `--groups N`, `--seed S`, `--only CODES`, `--out FILE`
- `scripts/dev-functions-server.js`: local function server (see Local Development)
- `scripts/run-sql.js`: run a `.sql` file against Neon
- `scripts/lib/script-support.js`: `loadDotEnv`, `argValue`, `resolveSourceDir` and the
  self-signed gate pass, shared by every script above

### Human verification

A "prove you are human" overlay stands in front of the app. The slider is UX; the security is
an HMAC-SHA256 signed cookie, `tt_human_verified` — HttpOnly, SameSite=Lax, 12 hours. All
three data endpoints are wrapped in `withHumanGate`, so the check is on the data, not on the
page: serving `index.html` to a scraper costs nothing, serving 1026 courses and their sessions
is the thing worth protecting.

Three consequences worth knowing before changing anything here:

- **The signing secret must be derivable, not random.** Each Netlify function is its own
  process, so a per-process random secret would reject cookies minted by a sibling lambda at
  random. It is `HUMAN_VERIFICATION_SECRET`, falling back to a one-way derivation from
  `NEON_DATABASE_URL`.
- **Gated responses are downgraded from `public` to `private` caching.** The Netlify CDN keys
  on URL, not on cookie; one verified visitor would otherwise warm a shared cache that then
  answers everyone. The year-long *browser* cache is kept.
- **The gate fails open when no secret is available.** A missing environment variable must not
  take the public timetable offline for the whole university. Set
  `HUMAN_VERIFICATION_ENABLED=false` to disable it deliberately.

Unit tests call `handleRequest`, which sits below the gate by design; the six tests in
`tests/functions/humanVerification.test.js` that call `handler` are what actually pin the
wiring. The contract-test scripts call `handler` too, and sign themselves a pass through
`scripts/lib/script-support.js`.

### Data flow

0. The browser posts to `/.netlify/functions/humanVerification` and receives the signed
   cookie. Without it, every step below answers `403 human_verification_required`.
1. The browser fetches `/.netlify/functions/getDatasetManifest` with `cache: no-store`. It
   returns the semester block, the group map, the course count, and a `dataset_version` —
   a SHA-256 of the two source artifacts.
2. The browser fetches every course page,
   `/.netlify/functions/getCourses?version=<sha256>&page=<n>`, four at a time. Those URLs are
   content-addressed, so they are cached for a year.
3. It reassembles the same envelope the app used to download as one file, refusing to render
   anything if a page is missing, duplicated, or carries a different version.
4. Opening calendar view requests
   `/.netlify/functions/getTimetable?version=<sha256>&courses=...`, so sessions can never be
   merged into course objects from a different dataset.
5. If an ingest lands while a tab is open, the endpoints answer `409 version_changed` and the
   page offers a reload. **It never reloads by itself.**

One page load therefore sees exactly one dataset version, end to end.

## Project Structure

```text
tunniplaan/
|-- index.html
|-- course-data.js            loads the dataset from the API
|-- main.js
|-- main.css
|-- netlify/
|   `-- functions/
|       |-- getDatasetManifest.js
|       |-- getCourses.js
|       |-- getTimetable.js
|       |-- humanVerification.js       POST-only; mints the pass
|       `-- lib/                       shared; never endpoints
|           |-- dataset.js
|           `-- humanVerification.js   sign/verify + withHumanGate
|-- db/
|   |-- schema.sql
|   |-- roles.sql
|   `-- migrations/
|-- scripts/
|   |-- dev-functions-server.js
|   |-- contract-test-getcourses.js
|   |-- contract-test-gettimetable.js
|   |-- sample-verify-vs-official.js
|   |-- run-sql.js
|   `-- lib/script-support.js      shared; not a script
|-- tests/
|   |-- functions/
|   |-- frontend/
|   `-- db/
|-- .vscode/
|   `-- tasks.json
`-- docs/
    `-- DATA_REFRESH.md       how to refresh the data
```

## Deployment

The site is hosted on Netlify.

- `main` branch: production
- `dev` branch: development deployment

**Refreshing the data is not a deployment.** A routine timetable refresh is a scrape followed
by an atomic Neon ingest; no commit, no push, and no build hook is involved. See
[docs/DATA_REFRESH.md](docs/DATA_REFRESH.md).

A deploy is only needed when application code changes. There is no longer any data artifact
in this repository to keep current, so a scrape never touches it.

## Notes for Contributors

- **Do not re-commit `unified_courses.json`, or any other full dump of the dataset.** It
  would be served from a public URL and would make the human-verification gate decorative.
  Nothing in the test suite would fail, which is exactly why it is written down here.
- Never glob `*.json` in `.gitattributes` — an unqualified rule once swallowed `package.json`,
  so a clone without `git lfs pull` got a pointer stub. The rule is gone; the trap is not.
- Run the app against `node scripts/dev-functions-server.js`. A static-only server cannot
  serve the course data at all now, so the page will not load.
- Run `node --test` plus both contract scripts before proposing a data-layer change. The
  contract scripts need `NEON_DATABASE_URL` and a matching ingested dataset. Note that
  `node --test tests/` fails on Windows with MODULE_NOT_FOUND; bare `node --test` is correct.
- Preserve bilingual UI strings in the `uiTexts` object in `main.js`.
- Keep search UX and group-timetable UX conceptually separate.
- Be careful with calendar performance. The app enforces a 4000-session limit before rendering the weekly view.

## Documentation

- `docs/DATA_REFRESH.md`: how to refresh the timetable data (no deploy)
- `AGENTS.md`: repo-specific instructions for coding agents
- `CLAUDE.md`: additional AI collaboration notes
- `docs/`: development logs and handoff material

## Last Updated

2026-09-04
