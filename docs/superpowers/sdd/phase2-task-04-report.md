# Task 4 report — Add the uncached dataset manifest endpoint

**Date:** 2026-08-30
**Repo:** webapp `C:\Projects\tunniplaan`, branch `phase2-api`
**Plan:** Task 4 · **Spec:** §9.1
**Status:** implemented; awaiting independent review

---

## 1. Changes

| File | Change |
|---|---|
| `netlify/functions/getDatasetManifest.js` | new — the spec §9.1 endpoint |
| `netlify/functions/lib/dataset.js` | new — shared constants and helpers for the Phase 2 API |
| `tests/functions/getDatasetManifest.test.js` | new — 15 tests |

`lib/` is a subdirectory deliberately: Netlify turns each `.js` file at the *top level* of
the functions directory into an endpoint, so a shared module has to sit one level down or it
would be deployed as a function of its own.

## 2. Design

**One statement, one snapshot.** The semester row, the course count, and the group map are
assembled by a single query using a CTE and two correlated subqueries. Three separate reads
could straddle an ingest commit and produce a manifest describing two different datasets —
which is precisely the failure the whole version-pinning mechanism exists to prevent. A test
asserts the query count is exactly one.

**No semester cache.** `getTimetable.js` caches the active semester code for five minutes in
a warm lambda. The manifest must not: its freshness *is* the invalidation mechanism for every
immutable versioned URL behind it, so a five-minute stale window would let a client pin
itself to a version that no longer exists. A test proves two successive calls both query and
both see the current version.

**A null or malformed version is `dataset_unavailable`, not a 200.** This is the state the
database is in today after Phase 1: an active semester exists, but nothing has been ingested
with a version. Returning it would let a browser pin itself to `null` and then send
`?version=null` to every downstream endpoint. The check is the same `^[0-9a-f]{64}$` the
producer enforces.

**The group map is folded in JavaScript, not by `jsonb_object_agg`.** Aggregating in SQL
would resolve a duplicate key by last-write-wins, silently. `(semester_code, code)` is the
`groups` primary key, so a conflict means the database invariant is broken, and a group
filter that quietly disagrees with the data is worse than a 500. A duplicate that agrees with
itself is tolerated; one that conflicts returns `manifest_unavailable` and logs which group
and which two faculty codes.

**Counts are coerced to numbers.** Postgres returns `bigint` as a string to avoid precision
loss, and `JSON.stringify` would faithfully emit `"1030"` with quotes, breaking the contract
for anything doing arithmetic on it.

**Every response is `no-store`,** success and failure alike. A cached 503 or 500 would
outlive the ingest that fixed it.

**Errors never carry the driver's message.** The public body is always
`{"error":"manifest_unavailable"}`; the detail goes to `console.error`. A test asserts a DSN
embedded in a thrown error cannot reach the response body.

## 3. Verification

```text
node --test                                        ->  25 passed, 0 failed
node --check netlify/functions/getDatasetManifest.js   ->  OK
node --check netlify/functions/lib/dataset.js          ->  OK
```

15 new tests: the full envelope, the no-store and content-type headers, single-query
assembly, no reuse of the legacy semester cache, page-count arithmetic across eight
boundaries (0, 1, 199, 200, 201, 1030, 1200, 1201), numeric coercion of a bigint string, ISO
date normalisation from both a `Date` and a timestamp string, an empty and a null group map,
a conflicting duplicate group rejected, an agreeing duplicate tolerated, no active dataset,
a null/empty/undefined/malformed version, a query failure that must not leak its DSN, and a
missing `NEON_DATABASE_URL`.

### Live response

Run against the disposable Neon branch through the real driver, the function returned
HTTP 200 with `Cache-Control: no-store`, a 64-hex `dataset_version`, ISO semester dates, a
folded `groupToFacultyMap`, and consistent `course_count` / `page_size` / `total_pages`.

The sample was taken while the Task 3 reviewer was mid-run against that branch, so it
reflects the integration suite's own small semester rather than the production dataset.
**A sample against the 1030-course dataset is re-taken below once the branch settles** — the
numbers that matter for Task 5 are `course_count: 1030`, `page_size: 200`,
`total_pages: 6`.

## 4. Carried forward

1. `lib/dataset.js` already carries `IMMUTABLE_HEADERS` and `isDatasetVersion`, which Task 5
   needs; `PAGE_SIZE` now has exactly one definition, so the manifest and the course endpoint
   cannot disagree about it.
2. The live sample against the full dataset is pending — see §3.
3. `getTimetable.js` still uses its own five-minute semester cache. Task 8 owns making a
   versioned calendar request bypass it.
