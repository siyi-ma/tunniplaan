# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TalTech Tunniplaan is a course timetable viewer for Tallinn University of Technology (TalTech). The application displays course information for ~1000 courses across ~395 student groups, with bilingual support (Estonian/English). Data is periodically synced from the official TalTech timetable system.

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
3. **Netlify: Deploy Dev Branch** - Triggers dev deployment via build hook

### Local Development (Manual)

```bash
# Start local development server
python -m http.server 8000
# Then open http://localhost:8000 in your browser
```

### Netlify Deployments

**Via VS Code Tasks** (Recommended):
- Press `Ctrl+Shift+P` → Type "Run Task" → Select deployment task

**Via Command Line**:
```bash
# Deploy to production (main branch)
curl -X POST -d {} https://api.netlify.com/build_hooks/6980b6f3e6f1a66c892e33ab

# Deploy to development (dev branch)
curl -X POST -d {} https://api.netlify.com/build_hooks/6980b7cb2f57c96b40fd08ab
```

### Data Files

The project uses two large JSON files:
- [sessions.json](sessions.json) (~42MB) - Individual session/event data
- [unified_courses.json](unified_courses.json) (~6MB) - Course metadata with grouped sessions

Both files are tracked with Git LFS due to their size.

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
- **Purpose**: Filter and return session data from the large `sessions.json` file
- **Input**: Query parameter `?courses=ID1,ID2,ID3`
- **Output**: Filtered array of session events for requested courses
- **Why**: Avoids loading the entire 42MB sessions.json file client-side

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

**sessions.json**:
Array of individual session events with timestamps, locations, and course references.

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

- Course data is updated weekly via external scraping process
- Commit messages follow pattern: "Update YYYYMMDD session and unified courses: X groups and Y courses"
- Always verify data file integrity after updates

### Git LFS Considerations

- `sessions.json` must remain under Netlify's 50MB function size limit
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
