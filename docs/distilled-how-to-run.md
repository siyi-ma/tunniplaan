---
# Distilled How to Run — TalTech Tunniplaan

## Start the app locally

### Option 1: Custom Node.js server (recommended on Windows with Group Policy restrictions)

```bash
node server.js
# App available at http://localhost:8888
# Serves static files AND mocks the /.netlify/functions/getTimetable endpoint
# Use this when netlify-cli is blocked by group policy
```

### Option 2: Netlify Dev (required for production-identical calendar testing)

```bash
npm run dev:netlify
# or
netlify dev
# App available at http://localhost:8888
# Runs the actual Netlify serverless function locally
```

### Option 3: Static-only (card view only — calendar view will fail)

```bash
python -m http.server 8000
# App available at http://localhost:8000
# Calendar view will show "Valitud ainete hulk on liiga suur..." (fetch 404)
# Use only for HTML/CSS/filter work that does not touch the calendar
```

> The calendar view requires `/.netlify/functions/getTimetable`. Any server that cannot execute Node.js functions (Python, Live Server) will return a 404, which the app surfaces as a misleading "too many courses" error message.

---

## Environment variables

| Variable | Purpose | Where to get it |
|---|---|---|
| `CLAUDE_CODE_GIT_BASH_PATH` | Tells Claude Code where `bash.exe` is on Windows | Set to `C:\Program Files\Git\bin\bash.exe` via user env vars (no admin required); see `docs/git_bash_setup.md` |

No runtime environment variables are required by the app itself. Netlify build hooks are in `.vscode/tasks.json` and `CLAUDE.md` (not secrets; they are deploy triggers only).

---

## Data pipeline

```
External scraping scripts (Python, run manually)
  |
  |-- 25s_scrape_combine_doktoriope.py   (doctoral studies timetable)
  |-- 25s_final_pipeline.py              (Bak/Mag timetables + merges doctoral output)
  |
  v
sessions.json        (~42 MB)   individual session events
unified_courses.json (~6 MB)    course metadata + group_sessions arrays
  |
  |-- both tracked with Git LFS
  |-- commit triggers Netlify deploy (if source files also changed — see netlify.toml)
  v
Netlify build
  |-- sessions.json bundled into the serverless function (netlify.toml: included_files)
  |-- unified_courses.json served as a static asset
  v
Live site
```

Data is updated weekly. Commit messages follow: `Update YYYYMMDD session and unified courses: X groups and Y courses`.

> `unified_courses.json` is an authoritative source for course–group–instructor relationships. Do not derive these relationships from `sessions.json` alone — doctoral courses without scheduled sessions are absent from `sessions.json` but present in `unified_courses.json`.

---

## Build and deploy

```bash
# Deploy to production (main branch)
curl -X POST -d {} https://api.netlify.com/build_hooks/6980b6f3e6f1a66c892e33ab

# Deploy to development preview (dev branch)
curl -X POST -d {} https://api.netlify.com/build_hooks/6980b7cb2f57c96b40fd08ab

# Skip CI (documentation-only commits)
git commit -m "Your message [skip ci]"
```

Via VS Code: `Ctrl+Shift+P` → "Run Task" → select deployment task. Or `Ctrl+Shift+B` to start the local server.

Netlify build ignores commits that do not touch `index.html`, `main.js`, `main.css`, `netlify/`, `sessions.json`, `unified_courses.json`, or `package.json`.

---

## Key data shapes

### unified_courses.json

```
{
  "courses": [
    {
      "id": "AAV3351",               // course code (used as primary key)
      "name_et": "...",              // Estonian name
      "name_en": "...",              // English name
      "eap": 3.0,                    // credit points
      "school_code": "...",          // faculty code
      "school_name": "...",          // faculty name (ET)
      "school_name_en": "...",       // faculty name (EN)
      "institute_name": "...",
      "institute_code": "...",
      "groups": ["EAUI71", ...],     // flat list of all group codes
      "group_sessions": [
        {
          "group": "EAUI71",
          "session_status": "offline|hybrid|online",  // null treated as online
          "instructors": [{ "name": "...", ... }],
          "keel": ["est"],           // teaching language
          "ainekv": "kohustuslik|valikuline"  // mandatory or elective
        }
      ]
    }
  ],
  "scraping_datetime": "..."
}
```

### sessions.json

Array of individual session events:

```
[
  {
    "course_id": "AAV3351",
    "start": "2026-02-09T08:00:00",
    "end": "2026-02-09T10:00:00",
    "room": "...",
    "type": "...",
    "is_veebiope": true|false,
    "groups": [{ "group": "EAUI71", "ainekv": "kohustuslik", "status": "kohustuslik" }],
    "instructors": [...],
    "comment": "..."
  },
  ...
]
```

Note: `groups[].ainekv` and `groups[].status` are both used in different data versions to indicate mandatory/elective status. Border color logic checks both fields.
