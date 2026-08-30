# Task 9 report — Local full-stack and browser regression gate

**Date:** 2026-08-30
**Repo:** webapp `C:\Projects\tunniplaan`, branch `phase2-frontend`
**Plan:** Task 9 · **Spec:** §9.1–§9.3, §13
**Status:** **partially complete.** The HTTP/header half is done and green. The browser
regression matrix **was not run** — no browser automation is available in this environment.
See §5, which is an owner checklist, not a result.

---

## 1. The local function server

`scripts/dev-functions-server.js`, ~150 lines, Node built-ins only.

`npx netlify dev` cannot run here and `npm run dev` is static-only — it would serve the page
and 404 every function, so every endpoint assertion would pass *vacuously*. The server
therefore serves the repository root statically and dispatches `/.netlify/functions/<name>`
to that module's exported `handler`.

Built to the plan's constraints: no new package; the `event` carries only
`queryStringParameters`, which is all the handlers read; the handler's `statusCode`,
`headers` and `body` are returned **verbatim**, since Cache-Control and Content-Type are
themselves part of the gate; `.env` is loaded without printing it; and an unknown function
name is a 404 so a typo in a check fails loudly rather than silently exercising nothing.

**It is not Netlify.** It does not reproduce Netlify's routing, redirects, payload-limit
enforcement, or edge caching. It proves *handler* behaviour, not *platform* behaviour. The
4.5 MiB ceiling therefore stays asserted on serialized bytes in the Task 6 contract test, and
real CDN behaviour is confirmed on the `dev` deploy in Task 11 Stage A.

## 2. HTTP/header matrix — 19/19 over real HTTP

```text
label                           status     bytes   cache-control
manifest                        200         7259   no-store
courses page 0                  200      1101147   public, max-age=31536000, immutable
courses page 1                  200       980026   public, max-age=31536000, immutable
courses page 2                  200       961033   public, max-age=31536000, immutable
courses page 3                  200       935503   public, max-age=31536000, immutable
courses page 4                  200      1033933   public, max-age=31536000, immutable
courses page 5                  200       153763   public, max-age=31536000, immutable
courses stale version           409           27   no-store
courses page past end           404           26   no-store
courses malformed version       400           23   no-store
courses malformed page          400           23   no-store
timetable versioned             200       218827   public, max-age=31536000, immutable
timetable unversioned (legacy)  200       218827   public, max-age=300, stale-while-revalidate=3600
timetable stale version         409           27   no-store
timetable malformed version     400           23   no-store
unknown function name           404           48   (none)
static index.html               200        13233   no-store
static course-data.js           200        12755   no-store

19 ok, 0 failed
```

No page approaches the 4.5 MiB ceiling: the largest is 1,101,147 bytes, 24% of it.

### The `limit_exceeded` envelope, live at last

Task 8 carried this forward as fixture-only. Provoked here with 150 real course IDs:

```text
versioned:    HTTP 200   Cache-Control: public, max-age=300
              {"error":"limit_exceeded","count":9448,"limit":4000}
unversioned:  HTTP 200   Cache-Control: public, max-age=300, stale-while-revalidate=3600
              {"error":"limit_exceeded","count":9448,"limit":4000}
```

The versioned envelope is **not** immutable, which is the whole point: its content depends on
`CALENDAR_SESSION_LIMIT`, an environment variable that can change without the dataset version
changing. **Task 8's carried-forward item 2 is closed.**

## 3. Page wiring, fetched over HTTP

```text
script order: googletagmanager -> cdn.tailwindcss.com -> course-data.js -> main.js
course-data.js before main.js:        true
both deferred:                        true          (deferred scripts run in document order)
#datasetNotices present:              true
#syncInfo present:                    true
inline unified_courses.json fetch:    removed
course-data.js / main.js / main.css:  200, 200, 200
CourseData attached to the global:    true
```

## 4. Final gates

```text
node --test                                  98 passed, 0 failed
node --check  (9 files)                      all OK
node scripts/contract-test-getcourses.js     COURSE CONTRACT OK  1030 courses, 430 groups, 6 pages,
                                             max_page_bytes=1101147, 295 nulls dropped
node scripts/contract-test-gettimetable.js   CONTRACT OK  66846 events deep-equal
```

Server stopped, port 8000 closed, working tree clean apart from this task's own new file.
`.env` untouched in both repositories — verified by key presence only, never printing a
value; `NEON_SCRAPER_URL` is still empty, so no production write is possible.

## 5. The browser matrix — NOT RUN

**This is the honest gap in this task.** The plan's browser regression matrix needs a real
browser driving the real page. This environment has none: the Chrome automation connection
dropped mid-session, and Playwright, Puppeteer and jsdom are all absent. Installing one would
mean adding a substantial dependency purely for verification, which the plan's own server
requirements argue against.

Simulating it with a DOM stub was the alternative and was rejected: a stub I write, asserted
against by tests I write, would mostly prove my stub matches my expectations. It would look
like browser evidence without being any.

So the matrix below is **an owner checklist, not a result.** Run
`node scripts/dev-functions-server.js`, open `http://localhost:8000`, and work down it.

| # | Check | Expected |
|---|---|---|
| 1 | Initial load | 1030 courses; no console errors |
| 2 | Network tab | 1 × `getDatasetManifest` + 6 × `getCourses`; **no request for `unified_courses.json`** |
| 3 | Sync date, ET | "…sünkroniseeritud TalTechi tunniplaaniga **24.08.2026 17:05**" |
| 4 | Switch to EN | Same date, English wording. The date must not blank or change |
| 5 | Switch back to ET | Date still correct — it used to survive only by accident |
| 6 | Faculty filter | Institute list narrows to that faculty |
| 7 | Group filter | Try `EAKB10_K` — a **location-suffixed** group. It must be selectable (60 of 430 keys carry suffixes) |
| 8 | EAP + language filters | Counts change as expected |
| 9 | One group's calendar | Renders; `getTimetable` request carries `version=1bf46c1d…` |
| 10 | Several comma-separated groups | Renders; course set matches the cards |
| 11 | Card ↔ calendar agreement | Same course set both ways |
| 12 | Reload with filters in the URL | `group`, `search`, `searchField`, `faculty`, `institutecode` survive; EAP/language/calendar do not — as the notice says |
| 13 | CSV export | Downloads, contents match the filtered set |
| 14 | New-data notice | Hard to stage without an ingest; see below |
| 15 | Simulated API failure | Block `/.netlify/functions/*` in devtools, reload: backup banner appears **naming the file's date**, calendar button renders disabled, cards still render |

Check 14 needs a second dataset ingested while a tab is open. The cheapest honest way is to
run the scraper's `neon_ingest.py` against the test branch with a modified dataset while the
page sits open, then switch away and back to the tab.

## 6. Findings

None from the automated half — every check passed first time, so no fix loop was opened
against a prior task.

The one thing worth recording is not a defect but a limit: **items 1–15 above are unverified.**
Tasks 7 and 8 are covered by 98 unit tests and two full-dataset contract tests, but no
assertion in this project has yet exercised `main.js` in a browser. Its DOM wiring, the
notice rendering, the language re-render, and the calendar 409 branch are verified by reading
and by unit tests around the modules they call — not by running the page.

## 7. Carried forward

1. **The browser matrix must be run before Task 11's production gate.** It is the only
   evidence that the page itself works; every layer beneath it is proven.
2. `scripts/dev-functions-server.js` is verification tooling. It is committed because Task 11
   and anyone reproducing this needs it, but it is not shipped code and Netlify never loads it.
3. Task 8's `main.js` 409 branch (its finding M4) remains covered by reading only — check 14
   is the item that would exercise it.
