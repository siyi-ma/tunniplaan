---
# Distilled Current State — TalTech Tunniplaan

## What this app does

TalTech Tunniplaan is a course timetable viewer for Tallinn University of Technology. It loads ~1000 courses across ~395 student groups from pre-processed JSON files and lets students and staff browse, filter, and view scheduled sessions. The app produces two main views: a card grid showing courses grouped by delivery mode, and a weekly calendar showing scheduled sessions. A dedicated group timetable builder lets users compose a multi-group schedule and share it via URL or export it as CSV. The UI is fully bilingual (Estonian / English).

---

## Architecture

```
Browser (SPA, vanilla JS)
  |
  |-- index.html + main.js + main.css
  |     |
  |     |-- unified_courses.json (6 MB, Git LFS)
  |           loaded at startup; drives all filtering and card view
  |
  |-- Calendar view fetch
        |
        v
  Netlify serverless function  /.netlify/functions/getTimetable
        |
        v
  sessions.json (42 MB, Git LFS, bundled with function)
        returns filtered session array for selected course IDs
```

Users access the live site on Netlify. Deployment is triggered by pushing to `main` (production) or `dev` (preview) branch; builds are skipped unless `index.html`, `main.js`, `main.css`, `netlify/`, `sessions.json`, `unified_courses.json`, or `package.json` change.

---

## What works right now

Feature status as of 2026-04-21 (last handoff):

- Card view: courses grouped online > hybrid > offline, sorted by course code within each group
- Calendar view: weekly grid (8:00-22:00), timezone-safe date handling (`toLocalISODate`), online-only courses shown in a dedicated row above the grid
- Filtering: school (faculty), institute, group, EAP credits, assessment form, teaching language
- Full-text search: matches course title, code, keywords, instructors; comma-separated terms; English UI searches English keyword fields first
- Bilingual UI: Estonian / English toggle, all labels driven by `uiTexts` object in `main.js`
- Group timetable builder: chip-based group selection, autocomplete, keyboard (`Tab`/`Enter`) acceptance, prefix wildcard (`TVTB*` adds all matching groups), shareable URL, CSV export of visible calendar week
- URL state: active filters and group builder state reflected in URL parameters
- Group-based instructor display: course cards show only instructors assigned to the active group when a group filter is set
- Tooltip logic: bilingual labels for mandatory / elective groups; conditional time/room display (hidden for online-only sessions)
- Session status border colors: online = pink, hybrid = blue, offline = gray; null status treated as online
- `netlify.toml`: build ignore logic prevents unnecessary deploys on doc-only commits

---

## Known issues to fix

| File | Issue | Impact |
|---|---|---|
| `main.js` | Prefix bulk-add fix (`TVTB*` pending-input commit) syntax-checked but not yet committed or browser-verified | Group builder may fail to add all prefix-matched groups without explicit Enter |
| `README.md` | Updated locally in last session but not yet committed | Out-of-date README on remote |
| `main.js` | URL/state is partially coupled to the old `searchField=study_group` filter model even when the dedicated builder is active | Conceptual overlap; could confuse URL parsing logic |
| `main.js` | Card view and calendar view contain repeated logic paths; small changes can affect both unexpectedly | Maintenance risk |
| Faculty filter | Deduplication was partially unresolved as of Aug 2025 (data inconsistencies in faculty codes/names) | Faculty dropdown may show duplicates if data is regenerated without normalization |

---

## What to build next

1. Commit pending `main.js` (prefix bulk-add fix) and `README.md` changes on `dev` after browser verification
2. Run full browser verification on `dev` using `npm run dev:netlify`: autocomplete, Tab/Enter add, `TVTB*` wildcard, Copy link, reload from URL, calendar open, CSV export
3. Merge `dev` into `main` and trigger production deployment
4. Visual polish pass on the group timetable builder UI
5. Resolve faculty filter deduplication definitively (root cause: inconsistent faculty codes between `unified_courses.json` and mapping data)
6. Consider full-range CSV export (current export covers the visible week only)
7. Reduce logic duplication between card view and calendar view render paths in `main.js`
