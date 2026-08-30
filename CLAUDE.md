# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TalTech Tunniplaan is a course timetable viewer for Tallinn University of Technology (TalTech). The application displays course information for ~1030 courses across ~430 student groups, with bilingual support (Estonian/English). Data is periodically synced from the official TalTech timetable system.

**Live Site**: Hosted on Netlify
**Primary Language**: Estonian (et) with English (en) translations

## Technology Stack

- **Frontend**: Vanilla JavaScript (no framework), HTML5, CSS3
- **Styling**: Tailwind CSS (via CDN), custom CSS in [main.css](main.css)
- **Backend**: Netlify serverless functions (Node.js)
- **Data**: Large JSON files managed with Git LFS
- **Deployment**: Netlify with automatic deployments

## Development Commands

### VS Code Tasks (Recommended)

The project includes configured VS Code tasks in [.vscode/tasks.json](.vscode/tasks.json):

**Keyboard Shortcuts**:
- **`Ctrl+Shift+B`** - Start localhost server (default build task)
- **`Ctrl+Shift+P`** → "Run Task" - Access all tasks

**Available Tasks**:
1. **Run Localhost Server** - Starts Python HTTP server on `http://localhost:8000`
2. **Netlify: Deploy Main Branch** - Triggers production deployment via build hook
3. **Netlify: Deploy Dev Branch** - ⚠ broken: its build hook was revoked (404). Push to `dev` instead; see Netlify Deployments below

### Local Development (Manual)

```bash
# Start local development server
python -m http.server 8000
# Then open http://localhost:8000 in your browser
```

### Netlify Deployments

**Netlify auto-deploys from GitHub** — pushing `dev` produces a branch deploy at
`https://dev--taltech-tunniplaan.netlify.app`, and pushing `main` produces the
production deploy. Neither needs a build hook; verified 2026-08-24.

**Via VS Code Tasks**:
- Press `Ctrl+Shift+P` → Type "Run Task" → Select deployment task
- ⚠ As of 2026-08-24 only one build hook exists on the site (branch `main`). The
  "Netlify: Deploy Dev Branch" task references a hook that has been revoked and
  returns HTTP 404 — it fails silently. Push to `dev` instead.

**Via Command Line**:
Trigger deploys with `curl -X POST -d {} <build-hook-url>`. Build-hook URLs are
secrets — get them from the Netlify UI (Site configuration → Build & deploy →
Build hooks); do not commit them to the repo.

### Data Files

Session/event data lives in **Neon Postgres** (`sessions` table, schema in
[db/schema.sql](db/schema.sql)) and is queried by
[netlify/functions/getTimetable.js](netlify/functions/getTimetable.js) via the
`NEON_DATABASE_URL` env var (read-only `webapp_ro` role). It is no longer bundled
as a JSON file.

Course metadata still ships as one large JSON file:
- [unified_courses.json](unified_courses.json) (~6MB) - Course metadata with grouped sessions

`unified_courses.json` is tracked with Git LFS due to its size (moving it to Neon
is a future Phase 2).

### Git LFS

```bash
# Ensure Git LFS is installed
git lfs install

# Pull LFS files
git lfs pull

# Check LFS status
git lfs ls-files
```

## Architecture

### Frontend Architecture

The application is a single-page application (SPA) built with vanilla JavaScript:

1. **Data Loading** ([index.html](index.html):119-126)
   - `unified_courses.json` loaded on page load
   - Contains all course metadata and session groupings

2. **Main Application Logic** ([main.js](main.js))
   - State management via global variables
   - Event-driven UI updates
   - Client-side filtering and search
   - Two view modes: Card view (default) and Calendar view

3. **Key State Variables** ([main.js](main.js):~47-59)
   - `allCourses` - All course data
   - `filteredCourses` - Currently filtered courses
   - `currentLanguage` - UI language ('et' or 'en')
   - `isCalendarViewVisible` - Current view mode
   - `activeFilters` - Applied filter state

4. **Filtering System**
   - Multi-criteria filtering: school (faculty), institute, group, EAP credits, assessment form, teaching language
   - Full-text search across course titles, codes, keywords, and instructors
   - Comma-separated search terms supported

5. **Calendar View**
   - Session limit: 4000 events (prevents performance issues)
   - Weekly view with time slots (8:00-22:00)
   - Uses Netlify serverless function for session data retrieval

### Backend Architecture

**Serverless Function**: [netlify/functions/getTimetable.js](netlify/functions/getTimetable.js)
- **Purpose**: Query the `sessions` table in Neon Postgres for the active semester and return the events for the requested courses
- **Input**: Query parameter `?courses=ID1,ID2,ID3`
- **Output**: Bare JSON array of session events for requested courses. Enforces a server-side session limit (default 4000, env `CALENDAR_SESSION_LIMIT`); when a request exceeds it, returns `{ "error": "limit_exceeded", "count", "limit" }` instead of the array (still HTTP 200). DB failure returns HTTP 500 with an error body.
- **Why**: Serving from Neon keeps the function payload tiny (fixes the 502 at large course sets) and lets scrapes update the live site without a redeploy

### Data Structure

**unified_courses.json**:
```json
{
  "courses": [
    {
      "id": "AAV3351",
      "name_et": "...",
      "name_en": "...",
      "eap": 3.0,
      "group_sessions": [
        {
          "group": "EAUI71",
          "session_status": "offline|hybrid|online",
          "instructors": [...],
          "keel": ["est"]
        }
      ]
    }
  ],
  "scraping_datetime": "..."
}
```

**`sessions` table (Neon Postgres)**:
One row per individual session event (timestamps, room, course reference, instructor/groups JSONB). Full schema in [db/schema.sql](db/schema.sql). The wire format returned by `getTimetable.js` uses dotted dates (`DD.MM.YYYY`) and `HH:MM` times with field names `course_id`, `date`, `start`, `end`, `type`, `room`, `weeks`, `comment`, `instructor`, `groups`, `is_veebiope` — this contract is consumed by [main.js](main.js) and must stay stable.

## Bilingual UI System

The application uses a `uiTexts` object ([main.js](main.js):~60-90) containing all UI strings in both languages:
```javascript
const uiTexts = {
  searchButtonText: { et: 'Otsi', en: 'Search' },
  // ...
}
```

Language switching updates:
1. All text content via `currentLanguage` variable
2. Page title dynamically based on URL parameters
3. Filter labels and options

## Important Development Notes

### Data Updates

- Course data is produced by the scraper repo (`C:\Projects\tunniplaanScraping`, [siyi-ma/tunniplaanScraping](https://github.com/siyi-ma/tunniplaanScraping)) and published here via its `publish_to_webapp.py` script, which validates the data and copies both JSON files into this repo root
- The schema of both files is defined in the scraper repo's `docs/data-contract.md` — fields consumed by [main.js](main.js) and [netlify/functions/getTimetable.js](netlify/functions/getTimetable.js) must not change without a coordinated update on both sides
- After publishing, ingest the fresh sessions into Neon: `node scripts/seed-sessions-from-json.js` (needs `NEON_SCRAPER_URL`). This replaces the active semester's rows. `sessions.json` is gitignored and **not** committed — only `unified_courses.json` is committed to this repo
- Commit messages follow pattern: "Update YYYYMMDD unified courses: X groups and Y courses" (the publish script still prints the older "session and unified courses" wording and a `git add sessions.json` — ignore the sessions part, it lives in Neon)
- Always verify data after updates (e.g. `node scripts/contract-test-gettimetable.js`)

**School codes are duplicated across the two repos.** The scraper's `FACULTY_INFO`
(`26s_pipeline.py`) assigns each course a one-letter `school_code`; [main.js](main.js):180-187
has its own hardcoded `FACULTY_INFO` keyed by those same letters. Adding a *new* code on the
scraper side without adding it here makes the faculty label fall back to the raw code, so
prefer reusing an existing letter.

When TalTech promoted Kuressaare and Virumaa to top-level faculties (2026-08-24), the
scraper kept filing their courses under `school_code` `E` (and `I` for 12 Virumaa IT
courses). The webapp therefore derives the *display* faculty itself:
`effectiveSchoolCode(course)` in [main.js](main.js) returns `EC`/`EV` when
`institute_code` starts with those prefixes, else falls back to `school_code`. Every
faculty comparison must go through this helper — the filter predicate, the dropdown
build, the institute list, the card label, and the deep-link preselect all do.
A raw `course.school_code === activeFilters.school` comparison returns zero courses
for a college, because no course ever carries `school_code` `EC` or `EV`.

`groupToFacultyMap` is still keyed on the parent letter, so `groupMapCodeFor()` maps
`EC`/`EV` back to `E` for group lookups only. Tartu Kolledž (`ET`, 61 courses) was
*not* promoted and stays under Inseneriteaduskond.

**Group names are stored in two incompatible forms (handled).** `groupToFacultyMap` is
keyed on location-suffixed names from the scraper's structure tree (`EAKB10_K (Saaremaa
vald)`), while `course.groups` and `group_sessions[].group` use bare codes (`EAKB10_K`).
The group dropdown intersects the two, so unstripped suffixed keys never matched and 60
of 430 groups were unreachable. Fixed 2026-08-24: `stripGroupLocationSuffix()` in
[main.js](main.js) normalises every key to the bare code when `facultyToGroupsMap` is
built, so all 430 map entries now resolve. Stripping is collision-free — 430 suffixed
keys reduce to 430 distinct bare keys, none mapping to two different faculties.
The scraper now strips at source too (`strip_group_location_suffix()`, scraper
`7584856`), so this is deliberately redundant: `stripGroupLocationSuffix()` stays
because the committed `unified_courses.json` still carries suffixed keys until the
next scrape-and-publish, and it costs nothing once they are bare.

`DOKTOR` and `VABA` appear in `course.groups` (432 unique) but not in
`groupToFacultyMap`; they are pseudo-groups, not student groups, and are correctly
absent from the faculty-filtered dropdown.

### Git LFS Considerations

- `unified_courses.json` is the only remaining LFS-tracked data file (session data now lives in Neon, not a bundled file)
- Use `.gitattributes` to track large JSON files with LFS
- Never commit large files without LFS

### Performance

- Calendar view enforces 4000 session limit to prevent browser slowdown
- Filter operations are client-side and should remain performant
- Consider pagination if course count grows significantly beyond 1000

### Session Status Types

Three types indicating delivery method:
- `online` - Fully online courses (pink border)
- `hybrid` - Mixed online/offline (blue border)
- `offline` - Traditional in-person (gray border)

### Documentation

Development logs and session summaries are stored in [docs/](docs/) directory following the format:
- Filename: `YYYYMMDD-description.md`
- See [docs/AI_agent_comm_guidelines.md](docs/AI_agent_comm_guidelines.md) for AI collaboration guidelines

## Common Tasks

### Adding New Filters

1. Add filter state to `activeFilters` object
2. Create filter UI in [index.html](index.html)
3. Add filter logic to filtering function in [main.js](main.js)
4. Update `uiTexts` for bilingual labels

### Modifying Course Card Display

Course cards are dynamically generated. Search for the card rendering function in [main.js](main.js) that creates the HTML structure with Tailwind classes.

### Updating Styles

1. Global styles: [main.css](main.css)
2. TalTech brand colors are defined with `tt-*` CSS classes
3. Tailwind utility classes used extensively in [index.html](index.html) and dynamically in [main.js](main.js)

### Testing Changes Locally

1. Use Live Server or any static file server
2. Ensure `unified_courses.json` is present (use Git LFS to pull)
3. For calendar view testing, you may need to run Netlify Dev: `netlify dev`
