# TalTech Tunniplaan

TalTech Tunniplaan is a vanilla JavaScript timetable viewer for Tallinn University of Technology (TalTech). It shows course metadata and timetable sessions for roughly 1000 courses and 395 student groups, with Estonian and English UI support.

The app is deployed on Netlify and uses a Netlify function to filter timetable sessions from a large `sessions.json` file.

## Features

- Search courses by title, course code, keyword, instructor, or study group
- Combine multiple study groups in one calendar view by searching groups separated with commas
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

Use this when testing the calendar view or anything that depends on `/.netlify/functions/getTimetable`.

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

The main search box supports comma-separated terms.

### Multi-group calendar view

To view multiple study groups in one calendar:

1. Choose `Ruhm` / `Study group` in the search field selector.
2. Enter groups separated by commas, for example `EAUI71, EAUI72`.
3. Open calendar view.

The app will combine sessions for the selected groups into one weekly timetable.

## Data Files

- `unified_courses.json`: course metadata and grouped session metadata
- `sessions.json`: timetable session records used by the calendar view

Both files are tracked with Git LFS.

## Architecture

### Frontend

- `index.html`: application shell and filter/search UI
- `main.js`: state management, filtering, rendering, language toggle, calendar logic
- `main.css`: custom styles

### Backend

- `netlify/functions/getTimetable.js`: reads `sessions.json` and returns only sessions for requested courses
- `server.js`: local Node server that serves the app and exposes the same function path for development on port 8888
- `netlify.toml`: includes `sessions.json` in the Netlify function bundle

### Data flow

1. The frontend loads `unified_courses.json`.
2. The user filters or searches courses on the client.
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
- Be careful with calendar performance. The app enforces a 4000-session limit before rendering the weekly view.

## Documentation

- `AGENTS.md`: repo-specific instructions for coding agents
- `CLAUDE.md`: additional AI collaboration notes
- `docs/`: development logs and handoff material

## Last Updated

2026-04-21
