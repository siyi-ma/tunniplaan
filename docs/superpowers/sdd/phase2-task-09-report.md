# Task 9 report — Local full-stack and browser regression gate

**Date:** 2026-08-30
**Repo:** webapp `C:\Projects\tunniplaan`, branch `phase2-frontend`
**Plan:** Task 9 · **Spec:** §9.1–§9.3, §13
**Status:** **complete.** HTTP/header matrix 19/19; browser regression matrix **run against a
real browser**, 15/15. See §5.

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

## 5. The browser matrix — RUN, 15/15

Driven against **real Microsoft Edge 151** over CDP, with the page served by
`dev-functions-server.js` reading the live Neon branch.

How, given no browser automation was available: `playwright-core` was installed with
`npm install --no-save` (so `package.json` and `package-lock.json` are untouched — verified),
and Edge was launched with `--remote-debugging-port` and driven via `connectOverCDP`. That
downloads no browser and adds no dependency to the project. The harness lives in the
scratchpad, not the repository.

| # | Check | Result |
|---|---|---|
| 1 | Initial card load | **PASS** — 1030 cards |
| 2 | Network trace | **PASS** — 1 manifest + 6 pages, `unified_courses.json` fetched **0** times |
| 3 | Sync date, ET | **PASS** — "sünkroniseeritud … 24.08.2026 17:05" |
| 4 | Switch to EN | **PASS** — same date, "synced with … on 24.08.2026 17:05" |
| 5 | Switch back to ET | **PASS** — date intact |
| 6 | Faculty filter | **PASS** — institutes 24 → 7 |
| 7 | **Location-suffixed group reachable** | **PASS** — 60 suffixed keys, `EAEI16_Tartu` present, 430 options |
| 8 | EAP filter | **PASS** — EAP=3: 1030 → 177 cards |
| 9 | One group's calendar | **PASS** — opens, request carries `version=1bf46c1d…` |
| 10 | Several comma-separated groups | **PASS** — `IADB11,IADB12,IAIB11` → 14 courses, 14 cards |
| 11 | Card ↔ calendar agreement | **PASS** — filtered=11, requested=11, versioned |
| 12 | Reload with filters in the URL | **PASS** — `/?group=IADB11` restores `activeFilters.group` |
| 13 | CSV export | **PASS** — 1583 bytes, 12 rows, correct header and data |
| 14 | New-data notice | **PASS** — appears, offers reload, dismissible, names what is lost |
| 15 | Simulated API failure | **PASS** — 1030 cards from fallback, notice names the date, calendar button disabled |
| — | Console errors | **PASS** — none beyond analytics/CDN noise |

### The three that mattered most

**Check 7 — the 2026-08-24 regression has not returned.** This was the risk flagged in Tasks 4
and 7: the manifest serves 60 group keys still carrying location suffixes, and `main.js` must
keep stripping them. Measured in the live page: 60 suffixed keys in `groupToFacultyMap`, and
the bare code `EAEI16_Tartu` **is** among the 430 selectable options. Had the strip been
dropped, those 60 groups would have been unreachable again.

**Check 14 — a dataset change is offered, never taken.** Staged by intercepting the manifest
to return a different version and firing `visibilitychange`. The notice appeared with both a
reload button and a dismiss button and text naming the EAP/language/calendar state that a
reload loses. After dismissing, a second visibility change produced **no** notice — the
dismissal sticks for that version. And `activeDatasetVersion` was still the originally loaded
one: **the tab did not reload itself.**

**Check 15 — the fallback is honest.** With every function returning 503, the page still
rendered all 1030 courses from the static file, showed
*"Varuandmed … varasem salvestatud koopia seisuga 24.08.2026 …"* — the file's own date, as
spec §11 requires — and rendered the calendar button **disabled**.

### Two harness artefacts, not app defects

- The CSV download event never fires on a CDP-attached context, so the check was done by
  capturing the blob the export builds. It also returns early when the visible week has no
  sessions — today (30 Aug) precedes the first sessions on 1 Sep — so the harness advances one
  week first. Both are properties of the test setup.
- `Blob.text()` strips a leading BOM per spec, so the harness's BOM assertion reads false even
  though `main.js` does prepend `﻿`. Reported here rather than as a finding.

### First run: 6 of 15 "failed", all mine

Worth recording, because it is the failure mode of automated UI checking. The first pass
reported 6 failures; every one was a harness bug — `#courseListContainer` instead of
`#courseList`, treating a searchable dropdown as a `<select>`, treating an EAP radio group as
a `<select>`, `window.facultyToGroupsMap` when `let` bindings are not window properties, and
clicking elements below the fold. A less careful run would have filed six bugs against
working code.

## 6. Findings

**No defects found in the application.** Every HTTP check passed first time, and every browser
check passed once the harness itself was correct. No fix loop was opened against a prior task.

That is now a much stronger statement than it was an hour ago: `main.js` had never been
exercised in a browser by anything in this project. Its DOM wiring, notice rendering, language
re-render, fallback path and versioned calendar request were verified only by reading and by
unit tests around the modules they call. They are now verified by running the page.

## 7. Carried forward

1. `scripts/dev-functions-server.js` is verification tooling. It is committed because Task 11
   and anyone reproducing this needs it, but it is not shipped code and Netlify never loads it.
2. **`playwright-core` is in `node_modules` but not in `package.json`** (installed with
   `--no-save`). `node_modules/` is gitignored, so nothing tracked changed — but it will not
   survive a fresh clone, and re-running the browser matrix needs it again. Deliberately not
   added as a devDependency: it is one person's verification tool, not a project dependency.
3. Task 8's finding M4 — the `main.js` 409 branch having no automated coverage — is now
   partly closed. Check 14 exercises the freshness/notice path end to end. The specific 409
   *from the calendar endpoint* is still only covered by reading; staging it needs an ingest
   mid-session, which belongs to Task 11.
4. The browser matrix should be re-run against the `dev` deploy in Task 11 Stage A, where real
   Netlify routing and CDN caching apply — this server proves handler behaviour only.
