# Task 5 report — Add the versioned paged course endpoint

**Date:** 2026-08-30
**Repo:** webapp `C:\Projects\tunniplaan`, branch `phase2-api`
**Plan:** Task 5 · **Spec:** §9.2
**Status:** implemented; awaiting independent review

---

## 1. Changes

| File | Change |
|---|---|
| `netlify/functions/getCourses.js` | new — the spec §9.2 endpoint |
| `tests/functions/getCourses.test.js` | new — 30 tests |

No change to `lib/dataset.js`: Task 4 already put `PAGE_SIZE`, `IMMUTABLE_HEADERS` and
`isDatasetVersion` there, so the manifest and this endpoint cannot disagree about the page
size or what a valid version looks like.

## 2. Design

**The requested version is part of the query predicate, not a separate check.** The single
statement selects `WHERE is_active = true AND dataset_version = $version`, then counts and
pages from that CTE. Spec §9.2 forbids "check the version, then query by the semester code we
remembered": an ingest committing between those two statements would relabel the new rows
with the old version and serve a page from the wrong dataset under a version the client
trusts. Because no row matches when the version is stale, the 409 falls out of the same
query rather than needing its own.

**Malformed requests never reach the database.** `parseRequest` returns null and the handler
returns 400 before a connection is used. A test asserts the query count is zero.

**Page parsing is strict.** `^(0|[1-9][0-9]*)$` — `1.5`, `1e2`, `+1`, `-1` and `' 1'` are all
400, not silently rounded or coerced. `parseInt('1.5')` would have returned page 1 and served
the wrong page under a URL the client caches for a year.

**`study_programmes` splits back into two fields.** The database stores one JSONB value;
`unified_courses.json` — and therefore `main.js` — has `study_programmes_et` and
`study_programmes_en`. The row is projected explicitly, field by field, so a storage-only
column such as `semester_code` cannot leak into the wire format, and a new column added later
cannot silently appear in the API.

**`eap` is coerced to a number.** Postgres returns `numeric` as a string to preserve
precision; `JSON.stringify` would emit `"6"` with quotes and break every arithmetic and
comparison in the EAP filter. Null stays null rather than becoming 0.

**A 200 is immutable for a year; every other status is `no-store`.** A cached 409 is actively
harmful — it would outlive the ingest that resolved it and pin the client into a permanent
version-mismatch loop.

## 3. Verification

```text
node --test                                 ->  55 passed, 0 failed  (25 existing + 30 new)
node --check netlify/functions/getCourses.js -> OK
```

30 tests: the envelope and its exact key order, immutable headers on 200, the full 25-key
course shape with nothing extra and nothing missing, the `study_programmes` split, `eap`
coercion across four stored forms plus null, null/empty scalars and JSONB, result order, the
SQL's own invariants (`ORDER BY`, `LIMIT`, `OFFSET`, version bound into the query, offset =
page × 200, single statement), the last partial page, **twelve** distinct 400 cases, a
malformed request never reaching the database, 409, 409-is-never-cached, 404 past the end,
404 for page 0 of an empty dataset, 500 without leaking the DSN, a missing
`NEON_DATABASE_URL`, and a 200-course page of deliberately bulky courses staying under the
4.5 MiB ceiling.

### Live, against the disposable branch holding the production dataset

```text
page 0  200  200 courses  1101147 bytes  522 ms   public, max-age=31536000, immutable
page 1  200  200 courses   980026 bytes  333 ms   public, max-age=31536000, immutable
page 2  200  200 courses   961033 bytes  173 ms   public, max-age=31536000, immutable
page 3  200  200 courses   935503 bytes  172 ms   public, max-age=31536000, immutable
page 4  200  200 courses  1033933 bytes  196 ms   public, max-age=31536000, immutable
page 5  200   30 courses   153763 bytes   44 ms   public, max-age=31536000, immutable

courses fetched 1030, unique 1030, sorted ascending: true
largest page: 0 at 1,101,147 bytes = 1.050 MiB   (ceiling 4.5 MiB — 4.3x headroom)
sum of pages: 5,165,405 bytes

stale version -> 409 {"error":"version_changed"}  no-store
page past end -> 404 {"error":"page_not_found"}   no-store
page = -1     -> 400 {"error":"bad_request"}      no-store
```

All 1030 courses arrive exactly once, in ascending id order, with no gaps or overlaps at the
page boundaries. The largest page matches Task 0's independent prediction of 1,100,773 bytes
to within 374 bytes — the difference is the envelope, which Task 0 approximated.

## 4. The API reproduces the source file exactly, with one characterised normalisation

Every course returned by the API was compared against the same course in
`unified_courses.json`:

```text
courses compared: 1030
deep-equal to source: 873
differing: 157
```

All 157 differences are **the same single key**: `school_name_en` is *absent* from those
courses in the source file, and the API emits it as `null`.

```text
keys absent in source but emitted as null:   {"school_name_en": 157}
source keys present with an explicit null:   {}          <- none, anywhere
deep-equal treating absent == null:          1030 / 1030
```

**This is unavoidable and deliberate.** A nullable SQL column cannot distinguish "key was
absent" from "key was null" — the ingest writes NULL either way. The endpoint therefore emits
a stable 25-key shape for every course rather than a shape that varies per row.

The alternative — omitting null-valued keys to mimic the source byte for byte — would
currently produce an exact match, because no source key is ever explicitly null. It was
rejected: it makes the response shape data-dependent, and the first course that legitimately
carries a null value would silently lose its key.

**Consequence for Task 6:** its contract gate must canonicalise absent ≡ null before
comparing. With that one rule, source and API agree on all 1030 courses and all 25 fields.
This is the concrete instance of the normalisation Task 2's review anticipated for
`study_programmes`.

## 5. Carried forward

1. **Task 6's canonicalisation rule is now specified by evidence**, not guesswork: treat a
   missing key as null, compare everything else strictly. See §4.
2. `total_pages: 0` on an empty dataset makes page 0 a 404, as Task 4's review required. There
   is a test for it.
3. Latency is 44–522 ms per page against a 0.25 CU Neon compute, the first request paying
   cold-start. Six pages fetched in parallel by the browser is the Task 7 concern.
