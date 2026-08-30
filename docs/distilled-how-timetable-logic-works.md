---
# Distilled How Timetable Logic Works — TalTech Tunniplaan

## Core concept

The app renders two views — a card grid and a weekly calendar — over the same course dataset. The card view operates client-side over the course dataset, which the browser assembles from
`getDatasetManifest` plus paged `getCourses` responses. The calendar view requires server-side session filtering because `sessions.json` is 42 MB; the Netlify function `getTimetable` accepts a comma-separated list of course IDs and returns only the relevant session events. All filtering, sorting, and UI state are managed through a single global `activeFilters` object in `main.js`.

---

## Algorithm / process

```
Page load
  |
  v
Fetch manifest, then every getCourses page
  |
  v
postProcessUnifiedData()
  Builds: allSchoolNames, schoolToInstitutes,
          facultyToGroupsMap, allUniqueGroups
  |
  v
applyFilters()  <-- called on every filter/search change
  |
  |-- 1. Text search (title, code, keywords, instructors)
  |-- 2. School (faculty) filter
  |-- 3. Institute filter
  |-- 4. Group filter
  |-- 5. EAP filter
  |-- 6. Assessment form filter
  |-- 7. Teaching language filter
  |
  v
filteredCourses[]
  |
  +--[card view]--> renderCardView()
  |                   group by session_status: online > hybrid > offline
  |                   sort by course code within each group
  |                   display instructors filtered to activeFilters.group (or deduplicated all)
  |
  +--[calendar view]--> fetch /.netlify/functions/getTimetable?courses=ID1,ID2,...
                          |
                          v
                        renderWeeklyView()
                          place sessions in time grid (8:00-22:00)
                          toLocalISODate() for timezone-safe date keys
                          online sessions shown above grid (deduplicated by course_id)
                          4000 session limit enforced before fetch
```

---

## Key parameters and signals

### activeFilters object

```javascript
{
  school: '',         // faculty code
  institute: '',      // institute name
  group: '',          // group code (e.g. "TVTB22")
  eap: '',            // credit points string
  assessmentForm: '', // assessment type
  language: '',       // teaching language code
  searchText: '',     // free-text query
  searchField: ''     // "study_group" when group builder is active
}
```

### Session status → card border color

| session_status | Border color | Hex |
|---|---|---|
| `online` or `null` | Pink (tt-magenta) | `#e4067e` |
| `hybrid` | Blue | `#4dbed2` |
| `offline` | Gray | `#9396b0` |

### Group mandatory/elective → calendar session border

Checked via `groupInfo.ainekv` OR `groupInfo.status` (both fields exist across data versions):

| Value | Border color |
|---|---|
| `kohustuslik` (mandatory) | `#e4067e` (pink) |
| `valikuline` (elective) | `#4dbed2` (blue) |

### Semester constants (Spring 2026)

```javascript
SEMESTER_START = '2026-02-02'
SEMESTER_END   = '2026-06-30'
```

### Calendar limits

- Session fetch limit: 4000 sessions (enforced before calling `getTimetable`)
- Calendar time range: 08:00–22:00 daily
- Days shown: Mon–Sun

---

## Output / score interpretation

The app produces no computed scores. The main "outputs" are:

| Output | Meaning |
|---|---|
| Card grid (online first) | Courses sorted by delivery mode then code; pink = online, blue = hybrid, gray = offline |
| Calendar grid | Session blocks placed by day/time; pink border = mandatory, blue = elective |
| Online row (calendar) | Courses with `is_veebiope === true` for the active group, deduplicated by course_id |
| Shareable URL | Encodes active filters and group builder state as query parameters |
| CSV export | Tab-separated rows for all sessions visible in the current calendar week |

---

## What the AI / external service does

Nothing at runtime. The Netlify serverless function (`getTimetable.js`) is a plain file-read and array-filter — no AI or external API calls. The data pipeline (Python scraping scripts) that produces the source artifacts, and the
atomic Neon ingest that loads them, run externally in the scraper repository.

---

## Known limitations

- Faculty filter deduplication is fragile: faculty codes and names can differ between `unified_courses.json` and any supplementary mapping data, causing duplicate entries in the school dropdown.
- `null` session_status is silently treated as `online`; this is a data quality assumption that may be incorrect for some courses.
- The URL state couples the group builder to the old `searchField=study_group` filter model; changing one may inadvertently affect the other.
- CSV export covers only the visible week; there is no full-semester export.
- The 4000-session limit can prevent large group combinations from loading the calendar view.
- `toLocalISODate()` is correct for the Estonian timezone (UTC+2/UTC+3) but was added as a fix to a real bug — any date comparison using `.toISOString()` elsewhere would regress.
