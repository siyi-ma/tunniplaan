# Task 6 report — Build the source-to-Neon-to-API contract gate

**Date:** 2026-08-30
**Repo:** webapp `C:\Projects\tunniplaan`, branch `phase2-api`
**Plan:** Task 6 · **Spec:** §7.2.2, §9.1, §9.2, §13 (criteria 5, 6)
**Status:** complete — independently reviewed, all findings applied

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

The gate **counts and prints** how much that rule absorbed, at every depth and on both sides,
so it can never quietly grow:

```text
null keys dropped by canonicalisation (both sides, all depths): 295
```

295 decomposes exactly: 157 `school_name_en` nulls from the API, plus 69 nested
`group_sessions[].session_status` nulls the source already contains — counted once on each
side. If that number moves, someone has to explain why.

## 4. Red before green

The plan asks for a clear non-zero failure rather than a vacuous pass. Four ways:

```text
$ node scripts/contract-test-getcourses.js --source-dir C:/nope/does/not/exist
CONTRACT FAILED: --source-dir points at C:/nope/does/not/exist, which is not a directory   [exit 1]

$ node scripts/contract-test-getcourses.js --source-dir <a directory with no artifacts>
CONTRACT FAILED: …\unified_courses.json does not exist                                     [exit 1]

$ node scripts/contract-test-getcourses.js   # with TUNNIPLAAN_DATA_DIR unset in .env too
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
  unified_courses.json: 6687128 bytes, mtime 2026-08-24 14:05:46, sha256 9ad2679dd03f…
  sessions.json: 52775872 bytes, mtime 2026-08-24 14:05:49, sha256 7f8ec8320d44…
Reassembled envelope matches the source file.
  null keys dropped by canonicalisation (both sides, all depths): 295
COURSE CONTRACT OK version=1bf46c1d14e3d474ac97396a77645e7f54657bbc4463bda9767a5a4d56c8da14 \
  courses=1030 groups=430 pages=6 max_page_bytes=1101147

real 1.8s
```

The per-artifact provenance line is spec §7.2.2's requirement: identify the file before
trusting it. Ingesting or testing against the wrong artifact is the most common failure of a
pipeline like this one, and it is silent.

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

## 9. Independent review findings, applied

Verdict: **approved with minor findings**. The reviewer attacked the gate 26 ways —
injecting corruptions on the API side through a wrapper, and on the source side with the
version check neutralised so the reassembly logic itself was exercised — and it caught 24.
Both misses were the disclosed null rule, and only one was a genuine weakness.

It confirmed the normalisation is honest rather than permissive, by proof rather than by
reading: `false`, `0` and `""` all survive (strict `=== null`); array nulls are preserved so
array length never shifts; a source value against an API null is caught in *both* directions;
and a null nested two levels deep inside `group_sessions` is caught. The largest failure
diagnostic across all 26 runs was **336 bytes** — bounded, as the plan requires.

| # | Finding | Fix |
|---|---|---|
| **I1** | The "absorbed" counter was a separate top-level-only pass, so it never descended into `group_sessions` or `study_programmes` and counted only one direction. The reviewer proved it: adding a null nested key on the API side left the count at 157 and the gate green. The source already contains **69 nested `session_status` nulls** the counter never saw | counting moved inside `canonical()` itself, so it covers every depth and both sides. The figure is now **295** = 157 + 69 + 69, and a nested null appearing in a future ingest moves it |
| **I2** | Spec §7.2.2 requires each run to print the resolved path with each file's size, mtime and SHA-256 prefix before doing anything else; both scripts printed only the directory | both now print the full provenance line per artifact |
| M1 | `--source-dir=PATH` inline form in the session test sliced 14 characters off a 13-character prefix, eating the first character of the path | uses `'--source-dir='.length`; verified with the inline form |
| M2 | The gate asserted page immutability but never the manifest's own `no-store` | asserted, with the reason in the message |
| M3 | Stopping the resolution at two tiers instead of spec §7.2.2's three is an undeclared deviation | recorded in the ledger as **D6**, accepted |
| M4 | Dead `\|\| '(root)'` in a branch where the value is already truthy | removed |

Two report inaccuracies the reviewer could not reproduce, both corrected above: the
"no source configured" red case needs `TUNNIPLAAN_DATA_DIR` unset as well (the `.env` supplies
it), and the session gate took 14.9 s for them against 8.0 s here — network latency to Neon,
not a code difference.
