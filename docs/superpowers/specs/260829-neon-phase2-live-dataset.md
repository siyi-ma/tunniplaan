# Neon Phase 2 — Live Course Dataset Specification

**Date:** 2026-08-29
**Status:** Draft — pending review
**Branch:** dev

---

## 1. Purpose

Move the remaining runtime timetable dataset—course metadata, group mappings,
semester metadata, and the displayed scrape timestamp—from the deployed
`unified_courses.json` asset into Neon Postgres.

After the one-time migration and production deployment, a routine data refresh must
be:

```text
scrape TalTech -> validate files -> atomically ingest Neon -> verify
```

It must not require a Git commit, Git LFS update, Netlify build, or Netlify deploy.

The browser must show a self-consistent dataset: the cards, filters, calendar,
semester boundaries, and top-right synchronization date must all refer to the same
successful ingest version.

## 2. Repositories and ownership

| Repository | Responsibility |
|---|---|
| `C:\Projects\scrape_taltech_tunniplaan` | Scrape and transform TalTech data, validate the producer contract, and atomically ingest all four dataset parts into Neon. |
| `C:\Projects\tunniplaan` | Read the active Neon dataset through read-only Netlify Functions, assemble course pages in the browser, and render cards/calendar/sync metadata. |

The two repositories remain separate. They share a versioned database contract, not
source code.

## 3. Verified current state

As inspected on 2026-08-29:

- `getTimetable.js` already reads `sessions` from Neon at runtime.
- `main.js` still fetches the static `./unified_courses.json` at startup.
- `index.html` performs a second fetch of the same static file solely to display
  `scraping_datetime`.
- Course cards, group/faculty filters, semester information, and the sync date therefore
  remain deployment-coupled.
- The Neon schema already defines `semesters`, `groups`, `courses`, and `sessions`.
  The implementation must query current row counts rather than assume that `groups`
  and `courses` are populated.
- The current dataset contains 1,030 courses and 430 group mappings.
- The deployed pretty-printed JSON is 6,687,128 bytes (6.38 MiB). Its compact JSON
  representation is 5,168,251 bytes (4.93 MiB).
- Netlify currently documents a 6 MB buffered Function request/response payload
  limit. A single full-dataset buffered response has insufficient growth and encoding
  headroom. See [Netlify Functions configuration](https://docs.netlify.com/build/functions/configuration/).

## 4. Goals

1. A successful ingest becomes visible on a fresh page load without a Netlify deploy.
2. The top-right sync date comes from the active Neon dataset and describes the data
   actually loaded in that browser tab.
3. Course cards, filters, group mappings, semester metadata, and calendar sessions
   cannot silently mix two ingest versions.
4. A failed ingest leaves the previously committed dataset fully available.
5. Course API responses remain comfortably below Netlify's buffered response limit as
   the dataset grows.
6. The existing frontend data shape and user-visible behavior remain unchanged except
   for transparent freshness and an optional “new data available” notice.
7. The migration is independently reversible until production has survived at least
   two successful routine ingests.

## 5. Non-goals

- No React/Vue/TypeScript migration or frontend framework introduction.
- No SQL-side search or filter rewrite. Filtering remains client-side after the course
  pages have been assembled.
- No change to the public timetable session wire fields or the 4,000-session calendar
  limit.
- No automatic scrape scheduling in this phase.
- No removal of historical semester rows.
- No immediate deletion of `unified_courses.json`; it remains a rollback artifact
  through the observation window.
- No mutation endpoint exposed through Netlify. Only the scraper receives write
  credentials.

## 6. Architectural decision

### 6.1 Runtime read path

```text
Browser
  |
  |-- GET getDatasetManifest (no-store)
  |      -> active semester, scrape date, dataset version,
  |         group map, course count, page size
  |
  |-- GET getCourses?version=<sha256>&page=0..N (versioned/cacheable)
  |      -> bounded pages of course objects
  |
  `-- GET getTimetable?version=<sha256>&courses=... (versioned/cacheable)
         -> sessions from the same active ingest version

Netlify Functions -> Neon via NEON_DATABASE_URL (webapp_ro)
```

The manifest is deliberately small and uncached. It supplies the active
`dataset_version`; all larger requests include that version in their URL. A new ingest
therefore changes the URL and invalidates stale browser/CDN cache entries without a
deploy or cache-purge API call.

### 6.2 Why paged courses rather than one envelope

The current compact full envelope is already 4.93 MiB against a documented 6 MB
buffered Function limit. The source grew materially during the semester and may grow
again. Streaming would raise the response limit but introduces a beta runtime path and
does not solve atomic multi-resource versioning.

The course API uses a fixed page size of 200. Against the current production file, the
largest compact 200-course page is approximately 1.05 MiB. This provides substantial
headroom while requiring only six page requests for the present dataset.

The page size is a server-owned constant. Clients do not choose arbitrary limits.

## 7. Dataset identity and database changes

### 7.1 New semester columns

Add these columns to `semesters`:

```sql
dataset_version text,
ingested_at      timestamptz
```

For a clean schema, `dataset_version` is a 64-character lowercase hexadecimal SHA-256
and `ingested_at` is set at successful ingest. Existing production rows require a
nullable migration first. The first Phase 2 ingest backfills both fields before the
frontend cutover.

Do not add a uniqueness constraint to `is_active`; the single-active-semester invariant
continues to be owned by the ingest transaction.

### 7.2 Version computation

The producer computes:

```text
SHA256(raw unified_courses.json bytes + one NUL byte + raw sessions.json bytes)
```

This is deterministic for a specific pair of generated artifacts, covers every field
served by both course and timetable APIs, and allows an unchanged scrape to be
recognized as the same dataset.

The version must match `^[0-9a-f]{64}$` before database mutation begins.

### 7.3 Existing table mapping

The current `courses` table remains the storage contract. The source fields map as
follows:

| Source field | Database representation | API representation |
|---|---|---|
| `id` | `courses.id` | `id` |
| scalar course fields | existing scalar columns | same field names |
| `groups` | JSONB | `groups` |
| `group_sessions` | JSONB | `group_sessions` |
| `study_programmes_et`, `study_programmes_en` | `study_programmes = {"et": [...], "en": [...]}` JSONB | split back to the two original top-level fields |
| `groupToFacultyMap` entry | one `groups` row (`code`, `faculty_code`) | folded back into one object in the manifest |
| `scraping_datetime` | `semesters.scraping_datetime` | manifest `scraping_datetime` |
| `semester` block | `semesters` scalar columns | manifest `semester` object with ISO date strings |

`eap` must be emitted from SQL as a JSON number, not a numeric string. Semester dates
must be explicitly formatted as `YYYY-MM-DD`.

## 8. Atomic producer ingest contract

The scraper repository gains a production ingest command. It consumes only production
files (`unified_courses.json` and `sessions.json`), never `_test` files.

### 8.1 Pre-transaction validation

Before opening a write transaction, the command must:

1. Load both artifacts from an explicit or configured source directory.
2. Run the existing data-contract validation.
3. Require non-empty `semester.code`, `courses`, `groupToFacultyMap`, and sessions.
4. Require unique course IDs and valid group map keys/values.
5. Require every non-null `session_status` to be `online`, `offline`, or `hybrid`.
6. Count orphan session course IDs and preserve the existing warning behavior.
7. Compute and print the dataset version, scrape date, semester code, and all row
   counts without printing credentials.
8. In `--dry-run` mode, stop here with no database connection or mutation.

### 8.2 Transaction

Using `NEON_SCRAPER_URL` and one real PostgreSQL transaction:

1. Upsert the target semester metadata, `dataset_version`, and `ingested_at`.
2. Set the target semester active and all other semesters inactive.
3. Replace only the target semester's `sessions`, `courses`, and `groups` rows.
4. Insert all replacement rows using bounded bulk operations suitable for roughly
   70,000 sessions. Do not issue one autocommit per chunk.
5. Before commit, query counts and invariants inside the same transaction:
   - semester version equals the computed version;
   - inserted course/group/session counts equal source counts;
   - exactly one semester is active;
   - no inserted course has a missing ID;
   - no group has an empty code/faculty code.
6. Commit only if every check passes. Any exception or mismatch rolls back all
   mutations, leaving the previously visible dataset intact.

Deleting and replacing rows is acceptable because it occurs inside one transaction.
Postgres MVCC keeps the old committed rows visible until the new set commits.

### 8.3 Post-commit verification

Reconnect using a read-only URL (or invoke the same queries through the read path) and
verify active version and row counts. The command exits non-zero if this verification
does not match, even though the transaction has committed, so operations cannot report
a false success.

The normal operator command must end with a concise receipt suitable for a log:

```text
INGEST OK version=<64hex> semester=26s courses=1030 groups=430 sessions=66846 scraped="24.08.2026 17:05"
```

## 9. HTTP API contracts

All endpoint errors use JSON and `Content-Type: application/json`.

### 9.1 `GET /.netlify/functions/getDatasetManifest`

Success: HTTP 200.

```json
{
  "dataset_version": "<64 lowercase hex>",
  "scraping_datetime": "24.08.2026 17:05",
  "semester": {
    "label": "2026/2027 sügis",
    "code": "26s",
    "name_et": "sügis 2026",
    "name_en": "autumn 2026",
    "start_date": "2026-08-27",
    "end_date": "2027-01-15",
    "week1_monday": "2026-08-31"
  },
  "groupToFacultyMap": {
    "IADB11": "I"
  },
  "course_count": 1030,
  "page_size": 200,
  "total_pages": 6
}
```

Required headers:

```text
Cache-Control: no-store
Content-Type: application/json
```

Failure cases:

- no active dataset or missing version: HTTP 503 with `{ "error": "dataset_unavailable" }`;
- database/query failure: HTTP 500 with a generic public error and detailed
  secret-free server log.

The complete manifest must be assembled by one SQL statement (for example, CTEs for
the active semester, course count, and group map). Multiple autocommit reads could
straddle an ingest commit and produce a manifest containing two versions.

### 9.2 `GET /.netlify/functions/getCourses?version=<sha256>&page=<zero-based>`

Success: HTTP 200.

```json
{
  "dataset_version": "<same requested version>",
  "page": 0,
  "page_size": 200,
  "total_pages": 6,
  "courses": [
    { "id": "ITI0102", "name_et": "..." }
  ]
}
```

Courses are ordered by `id` before `LIMIT/OFFSET`, making page boundaries
deterministic. Every field consumed from the old `unified_courses.json` is returned
with the same name, type, and null semantics.

Required headers for HTTP 200:

```text
Cache-Control: public, max-age=86400, immutable
Content-Type: application/json
```

Failure cases:

- malformed/missing version or page: HTTP 400;
- requested version is not the active version: HTTP 409 with
  `{ "error": "version_changed" }`;
- page outside `0 <= page < total_pages`: HTTP 404;
- query failure: HTTP 500.

The implementation must measure serialized response bytes in its contract test and
fail if any page reaches 4.5 MiB. This project-level ceiling preserves margin below
Netlify's platform limit.

The version check, total count, and requested page must be produced from one SQL
statement/snapshot whose active-semester predicate includes the requested version. A
“check version, then query by remembered semester code” sequence is forbidden because
an ingest could commit between those statements and relabel new rows with an old
version.

### 9.3 Versioned `getTimetable`

The calendar endpoint accepts an additional query parameter:

```text
/.netlify/functions/getTimetable?version=<sha256>&courses=ITI0102,...
```

When `version` is supplied, all count and row queries must resolve the active semester
whose `dataset_version` matches it. A mismatch returns HTTP 409 with
`{ "error": "version_changed" }` and does not query session rows.

The existing count-first limit optimization may remain, but every statement must
return an explicit version-match result from its own snapshot. The row statement must
return one envelope row containing both `version_match` and the session array, including
when the array is empty. If an ingest commits between count and row statements, the row
statement therefore returns `version_match = false` and the function returns 409 rather
than accepting an empty or mixed old-version response.

During rollout, missing `version` preserves the existing active-semester behavior so
the old deployed frontend remains compatible. This compatibility path may remain after
cutover; the new frontend always sends a version.

The successful session array and `limit_exceeded` envelope remain unchanged.
Versioned 200 responses may use:

```text
Cache-Control: public, max-age=86400, immutable
```

Unversioned compatibility responses keep the current short-lived policy.

## 10. Frontend data-loading contract

### 10.1 Initial load

The browser:

1. Fetches the manifest with `cache: "no-store"`.
2. Validates the manifest fields and computes the expected page count.
3. Fetches all versioned course pages with bounded concurrency (maximum four requests
   at once).
4. Rejects duplicate/missing pages, mismatched versions, duplicate course IDs, or a
   final course count different from `manifest.course_count`.
5. Reassembles the existing envelope shape:

   ```javascript
   {
     semester,
     courses,
     groupToFacultyMap,
     scraping_datetime
   }
   ```

6. Initializes the existing application state and records `activeDatasetVersion` and
   `lastSyncDate`.

If any page returns `version_changed`, the loader discards all pages and retries from a
fresh manifest once. A second consistency failure is surfaced as a load error; it must
not render a partial course list.

### 10.2 Sync text

`updateSyncInfoText(lastSyncDate)` is the only rendering path for the top-right sync
text. The date comes from the assembled manifest, not a DOM-ID global and not a second
fetch. Language changes rerender the same stored value.

The shown date means “the dataset loaded in this tab was scraped at this time.” It must
not claim a newer timestamp than the cards/calendar currently loaded.

### 10.3 Long-lived tabs

On `visibilitychange` when the page becomes visible, and no more often than once every
five minutes, fetch the manifest. If its version differs from
`activeDatasetVersion`, show a bilingual non-blocking notice with a reload action.
Reloading preserves the current URL filters. Do not silently replace application state
while a user is reading or building a timetable.

### 10.4 Calendar consistency

Every calendar request includes `activeDatasetVersion`. If the endpoint returns
`version_changed`, offer/retry a full page reload once; never merge new-version sessions
into old-version course objects.

## 11. Rollout fallback

During migration, the new loader may fall back to `./unified_courses.json` only when the
manifest/course API is unavailable. The fallback must:

- load the static file as one complete envelope;
- show its own `scraping_datetime`;
- emit a visible bilingual “backup data” notice;
- disable calendar retrieval with a bilingual explanation, because the active Neon
  sessions may no longer match the older static course metadata;
- log the API failure without exposing secrets.

The fallback is for migration safety, not the normal daily workflow. It is removed only
after the production observation gate in section 14.

## 12. Security and operational constraints

- `NEON_SCRAPER_URL` exists only in the scraper environment and has write privileges.
- Netlify receives only `NEON_DATABASE_URL` for the `webapp_ro` role.
- No connection string, password, or substituted SQL is printed or committed.
- Function inputs are validated before SQL execution. SQL remains parameterized.
- Dataset APIs are read-only and public, matching the current public static data.
- Ingest logs may contain counts, hashes, timings, and semester codes, but no secrets.
- Test-mode scrape artifacts are never ingestible by the production command.

## 13. Acceptance criteria

The phase is accepted only when all statements below have evidence:

1. **No-deploy refresh:** a new scrape is ingested without modifying the webapp Git
   worktree or triggering Netlify, and a fresh production page load shows its new
   version/date.
2. **Exact course contract:** assembling all API pages is deep-equal to the source
   `unified_courses.json` envelope after canonicalizing object key and course order.
3. **Exact session contract:** versioned `getTimetable` remains deep-equal to the source
   `sessions.json` in bounded batches.
4. **Atomicity:** an intentionally failed test-branch ingest leaves the previously
   active version and all row counts unchanged.
5. **Version coherence:** a stale course-page or timetable request returns HTTP 409,
   never a mixed response.
6. **Payload safety:** every serialized course-page response is below 4.5 MiB; current
   pages should be near 1 MiB or less.
7. **Sync accuracy:** the top-right value equals the manifest scrape date and changes
   after the next successful ingest without deployment.
8. **Behavior parity:** card filters, one-group and multi-group calendar views, URL
   reload state, bilingual text, and CSV export behave as before.
9. **Role isolation:** `webapp_ro` can read all required tables and cannot mutate them.
10. **Failure safety:** API failure renders either the complete static fallback or a
    complete error state, never a partial dataset.

## 14. Rollout and rollback gates

1. Apply the schema migration and ingest into a disposable/test Neon branch.
2. Pass producer unit tests, transaction rollback test, API tests, course contract test,
   session contract test, and local browser checks.
3. Deploy read endpoints to the Netlify `dev` branch while production still uses the
   static file.
4. Populate production Neon courses/groups with one atomic ingest and verify read-only
   API parity.
5. Switch the `dev` frontend to the Neon loader and complete browser regression checks.
6. Production merge/deploy requires an explicit user checkpoint in the implementation
   plan.
7. Keep `unified_courses.json` and the old publish path available through at least two
   successful production ingests and 48 hours of observation.
8. If rollback is needed, restore the static loader in one deploy. Database rows remain
   intact and may be diagnosed independently.
9. Only after the observation gate may a separate cleanup remove the LFS file and retire
   file-copy publication.

## 15. Required evidence package

The downstream implementation must leave:

- per-task briefs, reports, commit ranges, and review outcomes under
  `.superpowers/sdd/`;
- source-vs-Neon count receipts for courses, groups, and sessions;
- canonical contract-test output for both course and session APIs;
- maximum serialized course-page byte size;
- failed-ingest rollback evidence from a non-production database branch;
- local, dev, and production HTTP status/header samples;
- browser evidence for cards, filters, sync date, one group, multiple groups, URL reload,
  and calendar rendering;
- a final daily-refresh runbook that does not include Git or Netlify commands.

## 16. Open review questions

These are review questions, not permission for an implementation agent to improvise:

1. Is a 24-hour immutable cache for versioned page/session URLs acceptable, given that
   every new ingest creates a new URL and the manifest is `no-store`?
2. Should the “new data available” notice reload automatically after a short delay, or
   remain user-triggered? This draft specifies user-triggered reload to preserve work.
3. Should `unified_courses.json` remain as a fallback for the full two-week high-change
   period even if the first two ingests pass? This draft recommends yes.

---

## Review notes

<!-- Add comments, questions, or change requests here before implementation begins -->
