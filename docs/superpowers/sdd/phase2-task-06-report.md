# Task 6 report — Build the source-to-Neon-to-API contract gate

**Date:** 2026-08-30
**Repo:** webapp `C:\Projects\tunniplaan`, branch `phase2-api`
**Plan:** Task 6 · **Spec:** §7.2.2, §9.1, §9.2, §13 (criteria 5, 6)
**Status:** implemented; awaiting independent review

---

## 1. Changes

| File | Change |
|---|---|
| `scripts/contract-test-getcourses.js` | new — the gate |
| `scripts/contract-test-gettimetable.js` | source directory resolved instead of a repo-root read |

No npm scripts were added. The plan permits them but forbids making any gate depend on
`npm run`, and two ways to invoke the same script is one more thing to keep in step.

## 2. What the gate actually proves

That a browser can reassemble, from the manifest plus every course page, an envelope
**identical to the `unified_courses.json` it used to download whole**. All four parts:

| Envelope part | Source | Served by |
|---|---|---|
| `semester` | `unified.semester` | manifest |
| `groupToFacultyMap` | `unified.groupToFacultyMap` | manifest |
| `scraping_datetime` | `unified.scraping_datetime` | manifest |
| `courses` | `unified.courses` | six `getCourses` pages |

Plus, at every page: the version equals the manifest's, `total_pages` agrees, the response is
`immutable`, and the serialized body is under 4.5 MiB. The version itself is recomputed
locally as `SHA256(unified ‖ 0x00 ‖ sessions)` and compared with the manifest's, so the gate
knows it is testing *these* artifacts and not merely some self-consistent dataset.

## 3. Canonicalisation — exactly two things, and one is disclosed

The plan is explicit: canonicalise key order and course order only; do not normalise values
or coerce types to make differences disappear.

- **Key order** is sorted on both sides. Presentation, not content.
- **Course order** is sorted by `id` on both sides.
- **Nothing else is touched.** No type coercion, no trimming, no case folding.

The one further rule, and it is disclosed rather than silent: **null is treated as an absent
key, on both sides**. The ingest writes NULL for a key that was absent in the source, and no
SQL column can distinguish "absent" from "null" coming back out. Applying it symmetrically is
what keeps it honest — a source field holding a real value against a null from the API still
fails, because only one side loses the key.

The gate **counts and prints** how much that rule absorbed, so it can never quietly grow:

```text
null-for-absent normalisations absorbed: 157
```

157 is exactly the `school_name_en` population Task 5 measured. If that number jumps, someone
has to explain why.

## 4. Red before green

The plan asks for a clear non-zero failure rather than a vacuous pass. Four ways:

```text
$ node scripts/contract-test-getcourses.js --source-dir C:/nope/does/not/exist
CONTRACT FAILED: --source-dir points at C:/nope/does/not/exist, which is not a directory   [exit 1]

$ node scripts/contract-test-getcourses.js --source-dir <a directory with no artifacts>
CONTRACT FAILED: …\unified_courses.json does not exist                                     [exit 1]

$ node scripts/contract-test-getcourses.js            # with no source directory configured
CONTRACT FAILED: no source directory. Pass --source-dir or set TUNNIPLAAN_DATA_DIR.
                 There is no repository-root fallback on purpose.                          [exit 1]

$ node scripts/contract-test-getcourses.js --source-dir <dataset B, not what the DB holds>
CONTRACT FAILED: the database holds a different dataset than the source directory.
       source:   c8cfda15fef2d0510833f3e30255804e6f5863a015676786a120362baca64800
       database: 1bf46c1d14e3d474ac97396a77645e7f54657bbc4463bda9767a5a4d56c8da14
       Ingest these artifacts first (scraper: neon_ingest.py).                             [exit 1]
```

There is deliberately **no repository-root fallback**. A silent fallback is precisely how a
contract test ends up passing against the wrong data.

## 5. Green

```text
$ node scripts/contract-test-getcourses.js
Source: C:\Users\siyi.ma\OneDrive - Tallinna Tehnikaülikool\M_õppetöö\TunniplaaniAI\26s\data
Reassembled envelope matches the source file.
  null-for-absent normalisations absorbed: 157
COURSE CONTRACT OK version=1bf46c1d14e3d474ac97396a77645e7f54657bbc4463bda9767a5a4d56c8da14 \
  courses=1030 groups=430 pages=6 max_page_bytes=1101147

real 1.8s
```

Matches the receipt shape the plan specifies. `max_page_bytes=1101147` is 1.050 MiB against
the 4.5 MiB ceiling — and this is now a **standing** measurement of real response bytes,
which Task 5's fixture-based ceiling test could not be.

## 6. The session contract test runs again

`scripts/contract-test-gettimetable.js` has been unrunnable since Phase 1: it read
`<repo root>/sessions.json`, a file Phase 1 deleted and `.gitignore` now blocks. Task 0
recorded that as finding F3 and deliberately did not treat it as a baseline regression.

It now resolves its source directory the same way everything else does
(`--source-dir` > `TUNNIPLAAN_DATA_DIR`, no repo-root fallback) and loads `.env`:

```text
$ node scripts/contract-test-gettimetable.js
Source: C:\Users\siyi.ma\OneDrive - Tallinna Tehnikaülikool\M_õppetöö\TunniplaaniAI\26s\data
66846 events, 1030 distinct courses
  compared 66846/66846 events
CONTRACT OK: all responses deep-equal

real 8.0s
```

**All 66,846 session events are deep-equal** between the source file and the Neon-backed
handler, across 20 batches. This is the first time that regression has actually executed
since Phase 1, and it passes. **Ledger finding F3 is closed.**

Only the source path changed. Task 8 still owns adding dataset-version support to this
script, as the plan assigns.

## 7. Both gates together

```text
node scripts/contract-test-getcourses.js     COURSE CONTRACT OK   1030 courses, 430 groups, 6 pages
node scripts/contract-test-gettimetable.js   CONTRACT OK          66846 events
node --test                                  57 passed, 0 failed
```

Source and database row counts agree at every level: 1030 courses, 430 groups, 66,846
sessions, one active semester, one dataset version.

## 8. Carried forward

1. These two scripts need `NEON_DATABASE_URL` and a real dataset, so they are deliberately
   **not** part of `node --test`. Task 9 wires them into the local end-to-end gate and
   Task 10 documents when to run them.
2. Both currently point at the disposable branch. Before Task 11 they should be run once
   against production, read-only, after the first production ingest.
3. The gate reads the whole 52 MB `sessions.json` only to recompute the version. That is
   unavoidable — the version covers both artifacts — but it is why the course gate takes
   1.8 s rather than 0.3 s.
