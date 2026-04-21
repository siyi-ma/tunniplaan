# TalTech Tunniplaan

TalTech Tunniplaan is a vanilla JavaScript timetable viewer for Tallinn University of Technology (TalTech). It shows course metadata and timetable sessions for roughly 1000 courses and 395 student groups, with Estonian and English UI support.

The app is deployed on Netlify and uses a Netlify function to filter timetable sessions from a large `sessions.json` file.

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
- Backend: Netlify serverless function in `netlify/functions/getTimetable.js`
- Local backend alternative: `server.js`
- Data: `unified_courses.json` and `sessions.json` via Git LFS

## Prerequisites

- Node.js
- npm
- Git LFS
- Optional: Netlify CLI for full local parity, though `npx netlify` works through the npm script

## Setup

1. Clone the repository.
2. Install Git LFS and pull large files.
3. Install npm dependencies.

```bash
git lfs install
git lfs pull
npm install
```

## Local Development

There are three local run modes in this repo.

### Recommended: Netlify dev

Use this when testing calendar view or anything that depends on `/.netlify/functions/getTimetable`.

```bash
npm run dev:netlify
```

Open `http://localhost:8000`.

This is the most accurate local environment for:

- calendar view
- session loading
- Netlify function behavior

### Static frontend only

Use this when working only on frontend layout or client-side filtering that does not need the timetable function.

```bash
npm run dev
```

Open `http://localhost:8000`.

Note: this mode does not provide the Netlify function. Calendar view will not work here.

### Node local server with mocked function route

This repo also includes a local Node server that serves static files and handles `/.netlify/functions/getTimetable` directly.

```bash
npm start
```

Open `http://localhost:8888`.

This is useful if you want a local backend without Netlify CLI.

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

## Data Files

- `unified_courses.json`: course metadata and grouped session metadata
- `sessions.json`: timetable session records used by the calendar view

Both files are tracked with Git LFS.

## Architecture

### Frontend

- `index.html`: application shell, general course search UI, and dedicated group-timetable builder UI
- `main.js`: state management, filtering, rendering, language toggle, group builder logic, calendar logic, CSV export
- `main.css`: custom styles

### Backend

- `netlify/functions/getTimetable.js`: reads `sessions.json` and returns only sessions for requested courses
- `server.js`: local Node server that serves the app and exposes the same function path for development on port 8888
- `netlify.toml`: includes `sessions.json` in the Netlify function bundle

### Data flow

1. The frontend loads `unified_courses.json`.
2. The user either searches courses or builds a timetable from selected groups.
3. When calendar view is opened, the frontend requests `/.netlify/functions/getTimetable?courses=...`.
4. The backend returns only matching sessions from `sessions.json`.
5. The frontend merges and renders sessions in the weekly view.

## Project Structure

```text
tunniplaan/
|-- index.html
|-- main.js
|-- main.css
|-- server.js
|-- netlify.toml
|-- unified_courses.json
|-- sessions.json
|-- netlify/
|   `-- functions/
|       `-- getTimetable.js
|-- .vscode/
|   `-- tasks.json
`-- docs/
```

## Deployment

The site is hosted on Netlify.

- `main` branch: production
- `dev` branch: development deployment

Manual build hooks are also configured in `.vscode/tasks.json`.

## Notes for Contributors

- Keep `sessions.json` and `unified_courses.json` in Git LFS.
- Test calendar behavior with `npm run dev:netlify` or `npm start`, not with a static-only server.
- Preserve bilingual UI strings in the `uiTexts` object in `main.js`.
- Keep search UX and group-timetable UX conceptually separate.
- Be careful with calendar performance. The app enforces a 4000-session limit before rendering the weekly view.

## Documentation

- `AGENTS.md`: repo-specific instructions for coding agents
- `CLAUDE.md`: additional AI collaboration notes
- `docs/`: development logs and handoff material

## Last Updated

2026-04-21
