# Task 7 report — Browser course loader and single-source sync text

**Date:** 2026-08-30
**Repo:** webapp `C:\Projects\tunniplaan`, branch `phase2-frontend` (from `phase2-api` @ `773fd4f`)
**Plan:** Task 7 · **Spec:** §10.1–§10.4
**Status:** implemented; awaiting independent review

---

## 1. Changes

| File | Change |
|---|---|
| `course-data.js` | new — the loader |
| `tests/frontend/course-data.test.js` | new — 23 tests |
| `index.html` | loads `course-data.js`; the inline second fetch is gone; a notices container added |
| `main.js` | loads through `CourseData`; dataset state; sync text from stored state; fallback and update notices; freshness watch; two duplicate listeners removed |
| `main.css` | notice styling |

## 2. The duplicate 5 MB download is gone

The page used to fetch `unified_courses.json` **twice**: once in `initializeApp`, and again
from an inline script at the bottom of `index.html` whose entire purpose was to fill in the
sync date. Roughly 13.4 MB of transfer for a 6.7 MB file, on every load.

It now makes 7 requests totalling about 5.17 MB — one uncached manifest plus six immutable
course pages, the latter cacheable for a year:

```text
getDatasetManifest   [cache: no-store]
getCourses?version=1bf46c1d…&page=0 … page=5
requests: 7 (1 manifest + 6 pages)
static unified_courses.json fetched: no
peak concurrency: 4 (limit 4)
elapsed: 1925 ms
```

## 3. It refuses partial data

The loader validates before returning anything, and every failure discards the whole attempt
rather than handing `main.js` a short course list. A partial list is worse than a load error
because it looks like a complete timetable that quietly lacks courses.

Rejected: a manifest whose `total_pages` disagrees with `ceil(course_count / page_size)`; a
malformed version (before any page is requested); an empty dataset; a page that answers with
a different page number; a page carrying a different version; a duplicate course across
pages; a missing page; and a final count different from the manifest's.

**One retry, never a loop.** A `version_changed` on any page discards all pages and starts
again from a fresh manifest, exactly once. An ingest landing mid-load is normal; two landing
while one tab fetches six pages is not, and retrying indefinitely is a loop rather than a
recovery. A second race surfaces as a load error.

## 4. Bounded concurrency

Four requests at once, measured rather than asserted — the test tracks in-flight count and
fails if the peak exceeds four, and the live trace shows a peak of exactly 4 across six
pages. Enough to hide latency, few enough not to stampede a 0.25 CU database from every tab
that opens at 08:00.

## 5. Sync text has one source now

`updateSyncInfoText()` renders from the stored `lastSyncDate`. Three things were wrong before:

- It took the date as an argument and the **top-level call passed `syncDate`**, which was
  never declared — it resolved to the browser's implicit global for
  `<span id="syncDate">`, i.e. the element itself.
- On a language switch, a second listener read the date back **out of the span it had just
  rendered** and passed it in again. The value survived a language change by accident.
- The inline `index.html` script then overwrote `textContent` after its own fetch resolved.

Now `setLanguage()` calls `updateSyncInfoText()` and `renderDatasetNotices()`, both of which
re-render from stored state, so a language switch cannot lose the date or a standing notice.
If `scraping_datetime` is ever null the line falls back to the semester label rather than
printing `null` — the decision recorded in Task 4's review as ledger finding F14.

A second duplicate listener was also removed: it re-ran `updateDynamicTitle` on a 10 ms timer
"to wait for currentLanguage to update", racing `setLanguage()`, which sets the language and
calls the same function itself, in order.

## 6. Fallback honesty

When the API cannot be reached and `STATIC_FALLBACK_ENABLED` is on, the loader falls back to
the committed `unified_courses.json` and reports `source: 'fallback'`, `dataset_version:
null`, and **the static file's own `scraping_datetime`** — never the manifest's. Showing the
manifest's newer date above older cards would be a lie about what the user is looking at;
there is a test for exactly that, driving a case where the manifest loads and the pages fail.

`main.js` then shows a bilingual "Varuandmed / Backup data" banner and **disables calendar
view**, explaining why in both languages. Without a dataset version there is nothing to pin
sessions to, so the calendar would be querying today's sessions against however old the
fallback metadata is.

## 7. Long-lived tabs: offered, never taken

On `visibilitychange` to visible, at most once per five minutes, the tab re-fetches the
manifest. A different version raises a **non-modal, dismissible** notice with a reload
button. Dismissing it suppresses that version for the life of the tab.

**Nothing reloads the page by itself.** There is a test asserting `course-data.js` contains
neither `location.reload` nor `setInterval`. The user is usually part-way through assembling
a timetable; discarding that because a scrape landed is not a trade worth making for data
that is never safety-critical.

The notice **states the limitation rather than claiming reload is lossless**: `main.js`
round-trips `group`, `search`, `searchField`, `faculty` and `institutecode` through the URL,
but not EAP, teaching language, or calendar-view state. The Estonian and English text both
say so. Extending the URL sync was the alternative; saying what actually happens is smaller
and does not change filter behaviour on the way to a rollout.

## 8. Verification

```text
node --test          ->  80 passed, 0 failed   (57 existing + 23 new)
node --check course-data.js   -> OK
node --check main.js          -> OK
```

Live, driving the real loader against the real handlers:

```text
courses 1030, unique ids 1030, groups 430
suffixed group keys preserved: 60
semester 26s / 2026/2027 sügis, scraping_datetime 24.08.2026 17:05
dataset_version 1bf46c1d…6c8da14, source api

against the file it replaces:
  courses identical: true
  groupToFacultyMap identical: true
  semester identical: true
  scraping_datetime identical: true
```

The 60 location-suffixed group keys are **passed through untouched**, which is ledger finding
F13. `main.js` strips them where it builds `facultyToGroupsMap`; stripping in the loader too
would be two places to keep in step, and dropping the strip would make those 60 groups
unreachable in the dropdown again — the regression fixed on 2026-08-24. There is a test.

## 9. Carried forward

1. **Task 8 owns the calendar.** `toggleCalendarView` still calls
   `getTimetable?courses=…` with no version. Task 8 adds `activeDatasetVersion` and handles
   `version_changed`; this task only blocks the calendar on the fallback path.
2. `git diff --check` reports trailing whitespace on every added line of `main.js` and
   `index.html`. Both are **committed with CRLF**, so git flags the CR — pre-existing, not
   introduced here. `main.css` briefly had mixed endings from an append and was normalised
   back to CRLF; its diff is 46 added lines with no whole-file churn.
3. The pre-existing `initializeApp` catch renders an English-only error. Left alone: the
   plan's bilingual requirement applies to new messages, and rewriting it is Task 9/10's call
   if the local end-to-end run shows it mattering.
4. `STATIC_FALLBACK_ENABLED` is the flag Task 12 removes at the end of the observation window.
