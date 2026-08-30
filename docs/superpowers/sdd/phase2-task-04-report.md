# Task 4 report — Add the uncached dataset manifest endpoint

**Date:** 2026-08-30
**Repo:** webapp `C:\Projects\tunniplaan`, branch `phase2-api`
**Plan:** Task 4 · **Spec:** §9.1
**Status:** complete — independently reviewed, findings applied

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

### Live response against the full dataset

Through the real driver against the disposable branch holding the production dataset that
Task 3 ingested:

```text
status 200 | {"Content-Type":"application/json","Cache-Control":"no-store"}
7259 bytes | 256 ms
{
  "dataset_version": "1bf46c1d14e3d474ac97396a77645e7f54657bbc4463bda9767a5a4d56c8da14",
  "scraping_datetime": "24.08.2026 17:05",
  "semester": { "label": "2026/2027 sügis", "code": "26s", "name_et": "sügis 2026",
                "name_en": "autumn 2026", "start_date": "2026-08-24",
                "end_date": "2027-01-15", "week1_monday": "2026-08-31" },
  "groupToFacultyMap": <430 entries>,
  "course_count": 1030, "page_size": 200, "total_pages": 6
}
sample entries: {"AAVM11":"E","AAVM12":"E","AAVM31":"E","AAVM32":"E"}
```

The `dataset_version` is the one the Python producer computed for the same pair, so the
contract closes end to end: producer stamps it, ingest stores it, manifest serves it. All
430 groups fold without a conflict, and 7.3 KB is small enough that `no-store` costs nothing.

### One thing the live run exposed

**60 of the 430 group keys still carry a location suffix** — `EAKB10_K (Saaremaa vald)`
rather than `EAKB10_K` — because the committed `unified_courses.json` predates the scraper's
`strip_group_location_suffix()`. They flow through the ingest into `groups` and out through
this manifest verbatim.

That is correct behaviour here: the manifest reports what the dataset contains. But it means
**Task 7 must keep applying `stripGroupLocationSuffix()` to the manifest's map**, exactly as
`main.js` does today for the bundled file. Dropping it because "the data comes from the
database now" would make 60 groups unreachable in the dropdown again — the precise regression
fixed on 2026-08-24.

## 4. Carried forward

1. `lib/dataset.js` already carries `IMMUTABLE_HEADERS` and `isDatasetVersion`, which Task 5
   needs; `PAGE_SIZE` now has exactly one definition, so the manifest and the course endpoint
   cannot disagree about it.
2. **Task 7 must strip location suffixes from the manifest's group map** — see §3.
3. `getTimetable.js` still uses its own five-minute semester cache. Task 8 owns making a
   versioned calendar request bypass it.
4. **`db/migrations/20260830_one_active_semester.sql` is not applied anywhere yet** and
   needs the table owner — see §5. Task 11 applies it alongside the Phase 2 column migration.
5. **A null `scraping_datetime` is served as null, deliberately.** Task 7's sync indicator
   must fall back to the semester label rather than rendering `null` — decided here so Task 7
   inherits a decision rather than a discovery.
6. **`total_pages: 0` is a legal manifest** meaning the dataset has no courses. Task 5 must
   404 page 0 in that state (its own `0 <= page < total_pages` rule already says so), and
   Task 7 must treat it as "empty dataset, show the fallback" rather than fetching page 0.

## 5. Independent review findings, applied

Verdict: **approved with minor findings** — no Critical or Important. The reviewer confirmed
the central correctness claim by reasoning through PostgreSQL snapshot semantics: a single
statement in READ COMMITTED takes one snapshot at statement start, and the CTE and both
correlated subqueries share it, so no ingest committing mid-query can split the manifest
across two datasets. It also proved the tests are not tautological by mutating the
implementation six ways — removing the version guard, weakening `no-store`, making the group
fold last-write-wins, dropping the numeric coercion, adding a module-level cache, and
neutering the date normaliser — each of which failed the expected tests.

| # | Finding | Resolution |
|---|---|---|
| M1 | `scraping_datetime` passed through unvalidated and can be null, while every other field has a normaliser or guard | **Decided, no code change.** A valid `dataset_version` means a real ingest happened; a cosmetic timestamp gap must not 503 the whole site. Recorded as an explicit obligation on Task 7 (carried forward 5) |
| M2 | `total_pages: 0` is a silent dead end downstream | recorded for Tasks 5 and 7 (carried forward 6) |
| M3 | "Exactly one active semester" was a comment, not a constraint. Both `getDatasetManifest` and `getTimetable` pick it with an **unordered `LIMIT 1`**, so two active rows could resolve differently per request and hand two clients two different `dataset_version`s | `db/schema.sql` and a new migration add `CREATE UNIQUE INDEX semesters_one_active ON semesters ((true)) WHERE is_active` |
| M4 | The missing-env test passed only because no earlier test had connected — the memoised client would have made it vacuous | `lib/dataset.js` exports `_resetSql()`; the test calls it |
| M5 | `makeFakeSql` recorded the SQL text but nothing asserted on it, so dropping `WHERE is_active = true` or the group `ORDER BY` would have left all tests green | the single-query test now asserts those invariants and the absence of `;` |
| M6 | `IMMUTABLE_HEADERS` is unused until Task 5 | acknowledged; its value is byte-identical to spec §9.2 |

### A finding of its own: DDL needs an owner role

Applying the new index to the test branch failed:

```text
psycopg.errors.InsufficientPrivilege: must be owner of table semesters
```

`semesters` is owned by `neondb_owner`. **Neither of the two roles this project uses can run
DDL** — `webapp_ro` is read-only by design and `scraper_rw` has table privileges but not
ownership. Task 1's migration worked only because it was applied through the Neon control
plane, which acts as the owner.

So the migration is committed and **deliberately unapplied**, marked as such in its own
header. This is a real operational constraint for Task 11: the production rollout needs an
owner credential for the two DDL migrations, separate from the `scraper_rw` credential the
ingest uses, and Task 10's runbook has to say so. Better to surface it now than to discover
it during a production window.

The invariant currently holds on the test branch (exactly one active semester), so the index
will apply cleanly when an owner runs it.
