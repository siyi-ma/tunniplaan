# Task 8 report — Version calendar requests and handle stale tabs

**Date:** 2026-08-30
**Repo:** webapp `C:\Projects\tunniplaan`, branch `phase2-frontend`
**Plan:** Task 8 · **Spec:** §9.3, §10.4
**Status:** complete — independently reviewed, all findings applied

---

## 1. Changes

| File | Change |
|---|---|
| `netlify/functions/getTimetable.js` | versioned request path, split cache policy |
| `tests/functions/getTimetable.test.js` | 12 new tests |
| `main.js` | sends `version`, handles 409 without merging |
| `scripts/contract-test-gettimetable.js` | sends the version; refuses a vacuous run |

## 2. Both statements check the version, each from its own snapshot

The count query and the row query each resolve the active semester **by the requested
version**, in their own statement:

```sql
WITH active AS (
  SELECT code FROM semesters WHERE is_active = true AND dataset_version = $1
)
SELECT (SELECT count(*) FROM active) = 1 AS version_match, …
```

The `WITH` always yields exactly one output row, so `version_match` is explicit rather than
inferred from an empty result.

**The row statement returns one envelope row carrying both `version_match` and the array,
including when the array is empty.** That is the case the spec singles out: if an ingest
commits between the count and the row query, the row query comes back `version_match = false`
and the function returns 409 — instead of an empty array that looks like a perfectly ordinary
"no sessions for those courses" answer. There is a test driving exactly that interleaving.

A stale version short-circuits at the count query: the row query never runs, and a test
asserts the query count is 1 and that the one statement executed was not the row query.

## 3. No warm-lambda cache on the versioned path

`getTimetable` caches the active semester code for five minutes so an unversioned request in
a warm lambda stays cheap. A versioned request must not use it: the cached code could belong
to a semester that is no longer active, and the response would then be served under a version
the client trusts. The versioned path resolves the semester itself, every time. A test issues
two versioned requests and requires the second to re-resolve — it returns 409 where the first
returned 200, which a cached code would have made impossible.

## 4. The cache split

| Response | Policy | Why |
|---|---|---|
| versioned 200, body is the session array | `public, max-age=31536000, immutable` | content-addressed: the URL names a hash of the source artifacts |
| versioned 200, `limit_exceeded` envelope | `public, max-age=300` | depends on `CALENDAR_SESSION_LIMIT`, an env var that can change **without** the dataset version changing — so it is not content-addressed and must never be cached as if it were |
| 400 / 409 / 500 | `no-store` | a cached 409 would outlive the ingest that resolved it |
| unversioned | unchanged short-lived policy | the deployed frontend keeps working through the rollout |

## 5. Backward compatibility

Missing `version` preserves the existing behaviour exactly — same queries, same semester
cache, same headers. The frontend deployed today keeps working while the new one rolls out.
A test pins that. A `version` that is present but malformed is a 400 with no query at all,
rather than being silently ignored: silently ignoring it would serve an unpinned answer to a
client that believes it asked for a pinned one.

## 6. The frontend never merges across versions

`toggleCalendarView` sends `version=${activeDatasetVersion}`, and on 409 it **returns before
touching the calendar**, so no session from a newer dataset can reach course objects already
rendered. It then raises the same reload notice the freshness check uses. One recovery
attempt only: a second 409 re-renders the standing notice rather than starting again, because
a loop of reload prompts on a tab that keeps racing an ingest is worse than one clear notice.

Nothing here reloads automatically — the reload stays the button the user presses.

## 7. Verification

```text
node --test                                  ->  98 passed, 0 failed  (86 + 12 new)
node --check netlify/functions/getTimetable.js -> OK
node --check main.js                           -> OK
node --check scripts/contract-test-gettimetable.js -> OK
```

**Live, versioned vs unversioned over the same three courses:**

```text
courses ITX0020,ITI0102,MTX9070
unversioned: 200  470 events  public, max-age=300, stale-while-revalidate=3600
versioned:   200  470 events  public, max-age=31536000, immutable
byte-identical bodies:              false
deep-equal after canonicalisation:  true

stale version      -> 409 {"error":"version_changed"}  no-store
malformed version  -> 400 {"error":"bad_request"}      no-store
no matching courses-> 200 []                           immutable
```

The two paths are **deep-equal after key canonicalisation, not byte-identical**. `jsonb`
normalises key order, so the versioned body emits
`end,date,room,type,start,…` where the column projection emits
`course_id,date,start,end,…`. No consumer depends on key order — `main.js` reads by field
name and `scripts/contract-test-gettimetable.js` canonicalises before comparing — but the
distinction matters enough not to leave a false "byte-identical" claim in an evidence package
someone may later build on.

That equality is the evidence the wire contract did not move, and the reviewer took it much
further than this run did: all 66,846 rows compared positionally, field by field, with **0
value differences and 0 type differences** — covering the 404 NULL date/start/end rows, 861
empty-string rooms, and the 11,219 array-valued versus 55,170 object-valued `instructor`
records the live data actually contains.

**The full session contract test, now versioned:**

```text
node scripts/contract-test-gettimetable.js
66846 events, 1030 distinct courses
  dataset_version: 1bf46c1d14e3d474ac97396a77645e7f54657bbc4463bda9767a5a4d56c8da14
  compared 66846/66846 events
CONTRACT OK: all responses deep-equal        (10.4 s, 20 batches)
```

Every batch now sends the version, asserts the immutable header, and treats a 409 as a
failure naming the version rather than something to work around. It also **refuses a vacuous
run**: zero events or zero courses raises instead of printing `CONTRACT OK` after comparing
nothing against nothing.

## 8. Carried forward

1. Task 9 runs both contract tests plus the unit suite as one local gate.
2. The `limit_exceeded` envelope is reachable on the versioned path but is not covered by a
   live run — the fixture test covers the policy, and provoking it live would mean requesting
   4000+ sessions. Task 9's browser pass is the natural place if it is worth doing at all.
3. `DATASET_CHANGED_UNKNOWN` is a display sentinel for the case where a 409 proves the dataset
   moved but the throttled freshness check has not said what it moved to. It is never sent to
   an endpoint.

## 9. Independent review findings, applied

Verdict: **changes required**, on two well-defined items; the core design was found sound.
The reviewer verified legacy compatibility character-by-character against the previous
commit, proved the short-circuit is genuine rather than a discarded result, and ran seven
mutations — every one was caught by a test.

| # | Finding | Fix |
|---|---|---|
| **I1** | **500 responses carried no headers at all** — no `Cache-Control`, no `Content-Type` — while this report's own table claimed `no-store`. Pre-existing, but this task introduced the split policy and criterion 6b puts it in scope | both 500 paths carry `NO_STORE_HEADERS`; a test asserts it on the versioned and legacy paths and that the DSN cannot leak into the body |
| **I2** | **"byte-identical payloads" was false.** `jsonb` normalises key order, so the two paths differ in serialisation while agreeing on content | corrected above to "deep-equal after canonicalisation", with the actual key orders shown |
| M1 | A valid version with **no** `courses` took the legacy shortcut: `200 []` on the unversioned cache policy, with the version never checked. A client that asked for a pinned answer got an unpinned one | the shortcut now applies only when no version was sent. Verified live: a stale version with no courses returns 409 rather than an empty array |
| M2 | `IMMUTABLE_HEADERS`, `NO_STORE_HEADERS` and the version regex were redeclared here while byte-identical definitions already existed in `lib/dataset.js` | imported from `lib/dataset.js`, as the other two endpoints already do |
| M3 | After the user dismissed the notice, a repeat calendar 409 re-rendered nothing: no calendar, no explanation | the repeat path restores the pending notice before re-rendering |
| M4 | The `main.js` 409 branch has no automated coverage | acknowledged — there is no browser harness; **Task 9** is the gate for it |

One report figure the reviewer could not reproduce: the `470 events` line did not name its
three courses. They are `ITX0020,ITI0102,MTX9070`, now recorded above.

After the fixes: **98 passed**, both contract tests green, and the live checks re-run.
