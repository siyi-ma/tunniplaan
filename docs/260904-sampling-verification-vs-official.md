# Sampling verification: webapp vs. tunniplaan.taltech.ee

- **Run**: 2026-09-04, three passes between 19:20 and 19:31 UTC
- **Dataset version**: `e400f2a588cccc41284a5b76dddcbc51da4b30c9b6c59a668c7b0e3587cc0755`
- **Scraped**: 04.09.2026 22:19
- **Semester**: 26s — 2026/2027 sügis
- **Upstream timetable**: ttId 12 "2026/2027 sügis"
- **Group coverage**: 428 shared, 2 only ours (`doktor`, `vaba`), 0 only upstream

## Why this check exists

The contract tests (`contract-test-getcourses.js`, `contract-test-gettimetable.js`)
prove the API serves exactly what the scrape wrote. They cannot prove the scrape
*read the site correctly*, because both sides of that comparison originate in the
same Selenium run. A scrape that silently misreads a page passes them at 100%.

That is not hypothetical. The dataset this one replaces
(`9eedf89ff5f1dd0432f8b274cfc3d2771d754faff8f83ddc54c8d653c1a93232`, ingested
2026-09-04 21:20) passed both contract tests, reported 428/428 groups scraped and
exited 0 — while 26 of its 428 groups had been parsed from the site's *weekly*
table instead of the daily one and were missing 40–95% of their sessions. The
worst, VDXR31 and VDXR32, held 8 sessions each against an upstream 162 (4.9%).

Only a comparison against an independent source can catch that, which is what
this check is.

## Method

For each group the webapp path is reproduced end to end — `getDatasetManifest` →
`getCourses` → `getTimetable` through `exports.handler`, so the human-verification
gate is on the measured path — and the resulting sessions are filtered to the
group exactly as `main.js` does. That last step matters: `getTimetable` answers
per course, not per group, so omitting it would compare a course's whole session
list against one group's timetable.

The upstream side is TalTech's own public REST API (`api/public/search`), the one
its official SPA calls. Different transport, different parse, no shared code with
our pipeline — so the two sides are genuinely independent.

Sessions are compared as `(course, date, start, end)`. Undated sessions (veebiõpe)
are counted, not diffed — they carry no date on either side.

## Summary

| Pass | Selection | Groups | Sessions compared | Matched | Missing | Extra |
|---|---|---:|---:|---:|---:|---:|
| 1 | random, seed `776673792` | 20 | 2904 | 2904 | 0 | 0 |
| 2 | targeted: the 26 groups corrupted in the previous ingest | 26 | 4369 | 4369 | 0 | 0 |
| 3 | random, seed `411429397` | 20 | 3327 | 3327 | 0 | 0 |
| | **total** (63 distinct groups; 3 checked twice) | **66** | **10600** | **10600** | **0** | **0** |

**All three passes: 100.00%, zero missing, zero extra.**

## Pass 1 — random sample, seed `776673792`

| Group | Courses | Upstream | Ours | Matched | Missing | Extra | Undated (up/ours) | Rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| EATI52 | 4 | 81 | 81 | 81 | 0 | 0 | 1/9 | 100.0% |
| EAAB36 | 10 | 290 | 290 | 290 | 0 | 0 | 10/62 | 100.0% |
| EAAB32 | 14 | 333 | 333 | 333 | 0 | 0 | 11/66 | 100.0% |
| IAPM11 | 12 | 258 | 258 | 258 | 0 | 0 | 1/3 | 100.0% |
| EAKB50_K | 5 | 45 | 45 | 45 | 0 | 0 | 0/0 | 100.0% |
| IAIB33 | 6 | 190 | 190 | 190 | 0 | 0 | 0/0 | 100.0% |
| TVTM11 | 7 | 127 | 127 | 127 | 0 | 0 | 1/1 | 100.0% |
| MAJB31_V | 6 | 80 | 80 | 80 | 0 | 0 | 1/1 | 100.0% |
| VDXR32 | 6 | 162 | 162 | 162 | 0 | 0 | 0/0 | 100.0% |
| EAUI71 | 7 | 123 | 123 | 123 | 0 | 0 | 0/0 | 100.0% |
| IADB30A | 9 | 64 | 64 | 64 | 0 | 0 | 1/2 | 100.0% |
| KVEM11 | 7 | 124 | 124 | 124 | 0 | 0 | 0/0 | 100.0% |
| EAEI75_Tartu | 6 | 69 | 69 | 69 | 0 | 0 | 4/10 | 100.0% |
| MATM10A | 5 | 40 | 40 | 40 | 0 | 0 | 0/0 | 100.0% |
| EAKM31 | 7 | 140 | 140 | 140 | 0 | 0 | 0/0 | 100.0% |
| IAAB32 | 7 | 230 | 230 | 230 | 0 | 0 | 1/8 | 100.0% |
| LATB12 | 9 | 188 | 188 | 188 | 0 | 0 | 0/0 | 100.0% |
| EANB32 | 5 | 162 | 162 | 162 | 0 | 0 | 1/11 | 100.0% |
| EAMM12 | 8 | 181 | 181 | 181 | 0 | 0 | 3/9 | 100.0% |
| EDKR71_V | 2 | 17 | 17 | 17 | 0 | 0 | 0/0 | 100.0% |

**20/20 groups matched exactly.** 2904/2904 upstream sessions found (100.00%), 0 missing, 0 extra.

## Pass 2 — targeted re-verification of the 26 previously corrupted groups

Named explicitly with `--only` rather than sampled. Random sampling answers "is
the dataset right?"; this answers "are the specific groups that were wrong now
right?" — the question a sample can only answer probabilistically. Every one of
the 26 is exact, including VDXR31 and VDXR32 at 162/162 against the 8/162 they
held in the replaced dataset.

| Group | Courses | Upstream | Ours | Matched | Missing | Extra | Undated (up/ours) | Rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| EANB11 | 11 | 228 | 228 | 228 | 0 | 0 | 1/2 | 100.0% |
| EANB12 | 11 | 228 | 228 | 228 | 0 | 0 | 1/2 | 100.0% |
| HAAM11 | 5 | 54 | 54 | 54 | 0 | 0 | 0/0 | 100.0% |
| HAAM31 | 8 | 79 | 79 | 79 | 0 | 0 | 0/0 | 100.0% |
| IABM11 | 13 | 241 | 241 | 241 | 0 | 0 | 0/0 | 100.0% |
| IACM11 | 11 | 319 | 319 | 319 | 0 | 0 | 0/0 | 100.0% |
| IACM12 | 9 | 202 | 202 | 202 | 0 | 0 | 0/0 | 100.0% |
| IAIB51 | 15 | 204 | 204 | 204 | 0 | 0 | 4/16 | 100.0% |
| IAIB52 | 15 | 204 | 204 | 204 | 0 | 0 | 4/16 | 100.0% |
| IAIB53 | 15 | 204 | 204 | 204 | 0 | 0 | 4/16 | 100.0% |
| IAVM11 | 7 | 188 | 188 | 188 | 0 | 0 | 0/0 | 100.0% |
| IAVM31 | 8 | 126 | 126 | 126 | 0 | 0 | 1/3 | 100.0% |
| IVCM11 | 10 | 166 | 166 | 166 | 0 | 0 | 1/2 | 100.0% |
| IVCM12 | 10 | 166 | 166 | 166 | 0 | 0 | 1/2 | 100.0% |
| IVCM31 | 10 | 189 | 189 | 189 | 0 | 0 | 0/0 | 100.0% |
| IVCM32 | 10 | 189 | 189 | 189 | 0 | 0 | 0/0 | 100.0% |
| IVDM10 | 7 | 45 | 45 | 45 | 0 | 0 | 0/0 | 100.0% |
| KATM11 | 8 | 149 | 149 | 149 | 0 | 0 | 0/0 | 100.0% |
| MARM11 | 8 | 172 | 172 | 172 | 0 | 0 | 0/0 | 100.0% |
| MARM31 | 9 | 201 | 201 | 201 | 0 | 0 | 0/0 | 100.0% |
| VAMM11 | 10 | 213 | 213 | 213 | 0 | 0 | 0/0 | 100.0% |
| VDSR51 | 6 | 114 | 114 | 114 | 0 | 0 | 1/1 | 100.0% |
| VDVR51 | 6 | 92 | 92 | 92 | 0 | 0 | 0/0 | 100.0% |
| VDVR71 | 5 | 72 | 72 | 72 | 0 | 0 | 0/0 | 100.0% |
| VDXR31 | 6 | 162 | 162 | 162 | 0 | 0 | 0/0 | 100.0% |
| VDXR32 | 6 | 162 | 162 | 162 | 0 | 0 | 0/0 | 100.0% |

**26/26 groups matched exactly.** 4369/4369 upstream sessions found (100.00%), 0 missing, 0 extra.

## Pass 3 — random sample, seed `411429397`

An independent second draw, to keep the headline result from resting on a single
seed.

| Group | Courses | Upstream | Ours | Matched | Missing | Extra | Undated (up/ours) | Rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| TABB55 | 8 | 189 | 189 | 189 | 0 | 0 | 1/8 | 100.0% |
| TARM32 | 6 | 61 | 61 | 61 | 0 | 0 | 1/2 | 100.0% |
| TATM31 | 11 | 135 | 135 | 135 | 0 | 0 | 1/4 | 100.0% |
| LATB32 | 5 | 124 | 124 | 124 | 0 | 0 | 0/0 | 100.0% |
| IACB31 | 9 | 172 | 172 | 172 | 0 | 0 | 0/0 | 100.0% |
| EAAB51 | 14 | 266 | 266 | 266 | 0 | 0 | 3/14 | 100.0% |
| HAJM31 | 6 | 70 | 70 | 70 | 0 | 0 | 0/0 | 100.0% |
| TATM14 | 6 | 80 | 80 | 80 | 0 | 0 | 1/4 | 100.0% |
| TVTB52 | 9 | 150 | 150 | 150 | 0 | 0 | 0/0 | 100.0% |
| KVEM33 | 6 | 96 | 96 | 96 | 0 | 0 | 0/0 | 100.0% |
| IVCM31 | 10 | 189 | 189 | 189 | 0 | 0 | 0/0 | 100.0% |
| EARB52 | 8 | 244 | 244 | 244 | 0 | 0 | 0/0 | 100.0% |
| EDJR74_V | 3 | 15 | 15 | 15 | 0 | 0 | 0/0 | 100.0% |
| EAAB16 | 8 | 204 | 204 | 204 | 0 | 0 | 1/8 | 100.0% |
| VDVR51 | 6 | 92 | 92 | 92 | 0 | 0 | 0/0 | 100.0% |
| EAAB54 | 16 | 376 | 376 | 376 | 0 | 0 | 2/12 | 100.0% |
| EARB33 | 9 | 324 | 324 | 324 | 0 | 0 | 1/6 | 100.0% |
| EAAB31 | 14 | 333 | 333 | 333 | 0 | 0 | 11/66 | 100.0% |
| EAXM37 | 4 | 64 | 64 | 64 | 0 | 0 | 0/0 | 100.0% |
| TAAB11 | 8 | 143 | 143 | 143 | 0 | 0 | 2/11 | 100.0% |

**20/20 groups matched exactly.** 3327/3327 upstream sessions found (100.00%), 0 missing, 0 extra.

## What changed in the scrape

Four defects were fixed in `26s_pipeline.py` before this run, all of them the same
mistake in different clothing — a singular API standing in for a plural reality,
returning a plausible wrong answer rather than raising:

1. `EC.element_to_be_clickable` resolves its locator with `find_element`, so it
   only ever inspects the **first** DOM match. The SPA renders several copies of
   the view-switcher tab bar, most zero-size placeholders, in varying order.
   Replaced with `first_interactable()`, which scans every match.
2. `//table[.//h3[contains(text(), '.202')]]` — XPath `contains()` coerces the
   `text()` node-set to its **first** node, and Angular splits
   `"Esmaspäev 31.08.2026"` around an interpolation marker. This wait had never
   matched a single table in any historical run; the code always fell through to
   its "first visible table" fallback, which was correct only when the tab click
   happened to land. Fixed to `contains(., '.202')`.
3. `presence_of_element_located((By.XPATH, "//table"))` was satisfied instantly by
   the **previous** group's hidden, still-mounted table, so the readiness wait
   returned before the new group's view existed. Now requires a *displayed* table.
4. `driver.get(BASE_URL)` does not reload a hash-route SPA already at that URL —
   the browser treats it as a same-document no-op, so panels accumulate across
   groups. `reset_spa()` now navigates via `about:blank` first. A/B on the
   reproducing sequence: 6/8 groups without the reset, 8/8 with it.

A `WeeklyViewRendered` guard was also added, which raises when the parsed table
carries bare weekday headers, converting the silent corruption into a retry. It
fired zero times across all 428 groups in this run — the click now lands on the
first attempt rather than being caught and retried.

The run itself: 428/428 groups, 0 failures, 0 guard trips, 40.6 minutes
(down from ~110, because every group had been burning dead 10–20 s waits).
67,257 sessions against the replaced dataset's 63,337.

## Reproducing

```bash
node scripts/sample-verify-vs-official.js --groups 20 --seed 776673792
node scripts/sample-verify-vs-official.js --groups 20 --seed 411429397
node scripts/sample-verify-vs-official.js --only EANB11,EANB12,HAAM11,HAAM31,IABM11,IACM11,IACM12,IAIB51,IAIB52,IAIB53,IAVM11,IAVM31,IVCM11,IVCM12,IVCM31,IVCM32,IVDM10,KATM11,MARM11,MARM31,VAMM11,VDSR51,VDVR51,VDVR71,VDXR31,VDXR32
```

A seeded replay reproduces the group selection, not the result: the upstream
timetable is edited continuously, so a session added there after 22:19 is a
legitimate difference rather than a scrape defect. The scrape timestamp is
printed beside the run time for exactly that reason.
