# Distilled Current State — TalTech Tunniplaan

## What this app does

TalTech Tunniplaan is a single-page timetable application for Tallinn University of Technology (TalTech). It allows students, faculty, and administrative staff to search, filter, and view scheduled course sessions across all study programmes and student groups for the active semester. The app renders two primary interface modes: a card grid organized by instruction mode (online, hybrid, offline) and a weekly calendar grid. It also provides a multi-group timetable builder that allows users to aggregate multiple student groups into a unified timetable, export calendar views to CSV, or share state via direct URLs.

---

## Architecture / Access Model

```mermaid
flowchart TD
    Client["User Browser (Vanilla JS SPA)"]
    NF_Manifest["Netlify Function: getDatasetManifest"]
    NF_Courses["Netlify Function: getCourses"]
    NF_Timetable["Netlify Function: getTimetable"]
    Neon["Neon Postgres Database (semesters, groups, courses, sessions)"]
    NF_Human["Netlify Function: humanVerification (POST only)"]
    Gate{"withHumanGate: valid tt_human_verified cookie?"}
    Denied["403 human_verification_required"]

    Client -->|"0. POST /humanVerification (slider completed)"| NF_Human
    NF_Human -->|"Set-Cookie: HMAC-SHA256 signed, HttpOnly, SameSite=Lax, 12h"| Client

    Client -->|"1. GET /getDatasetManifest"| Gate
    Client -->|"2. GET /getCourses?version=...&page=..."| Gate
    Client -->|"3. GET /getTimetable?version=...&courses=..."| Gate

    Gate -->|"missing / forged / expired"| Denied
    Gate -->|"valid"| NF_Manifest
    Gate -->|"valid"| NF_Courses
    Gate -->|"valid"| NF_Timetable

    NF_Manifest -->|"Query active semester metadata"| Neon
    NF_Courses -->|"Query courses table"| Neon
    NF_Timetable -->|"Query sessions table"| Neon
```

Users access the web application through any modern browser. Netlify hosts the static assets (`index.html`, `main.js`, `main.css`) and handles serverless function routing. Application data resides in Neon Postgres and is fetched on demand by Netlify functions. Deployments to Netlify occur when commits land on `main` (production) or `dev` (preview). Data updates occur via direct database ingest from `tunniplaanScraping` without requiring code redeployments.

Every data endpoint sits behind `withHumanGate`. There is no static fallback path any more: `STATIC_FALLBACK_ENABLED` in `main.js` is `false`, `unified_courses.json` is no longer committed or deployed, and the scraper's `publish_to_webapp.py` has been deleted. A committed dataset would be a public URL serving in full what the gate exists to withhold, so an API outage is now a visible load error rather than a silently stale dataset.

---

## What works right now

Feature status as of 2026-09-04:

- **Bilingual Interface**: Seamless Estonian and English language toggling driven by central `uiTexts` definitions.
- **Card View Grid**: Displays filtered courses split into delivery sections (online, hybrid, offline) and sorted deterministically.
- **Weekly Calendar Grid**: Timezone-safe rendering (8:00–22:00) with online-only courses positioned in a top banner.
- **Multi-Group Timetable Builder**: Chip-based input supporting comma-separated student groups, wildcard matching (e.g. `TVTB*`), URL parameter serialization, and weekly CSV exporting.
- **Neon Postgres Backend**: Netlify functions (`getDatasetManifest`, `getCourses`, `getTimetable`) reading live data from Neon Postgres.
- **Human Verification Gate**: A slider overlay mints an HMAC-SHA256 signed `tt_human_verified` cookie (HttpOnly, SameSite=Lax, 12 h) via a POST-only endpoint; all three data endpoints refuse callers without one. The slider is UX, the signature is the boundary. Gated responses are downgraded from `public` to `private` caching because the Netlify CDN keys on URL rather than on cookie. The gate fails open when no signing secret is available, so a missing environment variable cannot take the timetable offline.
- **Pagination Reassembly**: Asynchronous fetching of course dataset pages (4 parallel requests) reassembled into client memory.
- **Client-Side Filtering**: Instant multi-attribute filtering by faculty, institute, student group, study level, EAP credits, assessment form, and instruction language.
- **Group-Specific Instructor Mapping**: Filters instructor lists to display only personnel assigned to the active student group.

---

## Known issues to fix

| File | Issue | Impact |
|---|---|---|
| `main.js` | Card view and calendar view share redundant rendering branches | Maintenance overhead when extending filter or display logic |
| `main.js` | URL parameter state relies on legacy `searchField=study_group` alongside the multi-group builder state | Edge case confusion when parsing complex deep-linked URLs |
| `getTimetable.js` | 4,000 session limit envelope requires user-facing notification when exceeded | Extremely broad searches return limit error envelope instead of partial sessions |
| `index.html` | Top-right synchronization date reflects deployment timestamp rather than dataset scraping date | Cosmetic discrepancy between site deploy date and Neon ingest date |

---

## What to build next

1. Consolidate URL parameter handling between single-field search filters and multi-group builder chips.
2. Synchronize header timestamp display to read `scraping_datetime` directly from the `getDatasetManifest` API response.
3. Refactor redundant card grid and calendar view rendering pipelines in `main.js`.
4. Improve multi-group calendar session color assignment for improved visual distinction between overlapping courses.
