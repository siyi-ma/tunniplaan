# Task 0 report — Freeze baselines and create the Phase 2 ledger

**Date:** 2026-08-30
**Executed on:** Windows 11, user `siyi.ma`
**Status:** complete — no stop condition triggered

---

## 1. Repository baselines

| Repo | Path | Branch | HEAD | `git status --short` | LFS files |
|---|---|---|---|---|---|
| webapp | `C:\Projects\tunniplaan` | `dev` | `4e1795804a90571ea965f402bf7f2e968b999721` | empty (clean) | `unified_courses.json` (oid `9ad2679dd0…`) |
| scraper | `C:\Projects\tunniplaanScraping` | `dev` | `30a0ad8b91c15cbd2bdddd5eac016494034f800b` | empty (clean) | none |

Both worktrees were clean before this task. No user changes were at risk.

The webapp LFS oid `9ad2679dd0…` equals the SHA-256 of the source
`unified_courses.json` recorded in §5, so the committed fallback copy is byte-identical to
the current source artifact.

## 2. Toolchain

```text
node    v22.17.0
python  3.13.1
pytest  9.1.1
npm     10.9.2
npx     10.9.2
```

**`npm` is usable on this device.** `npm ls --depth=0` and `npm install --dry-run`
(→ `up to date in 1s`) both succeed from Bash and from PowerShell. This contradicts the
recorded constraint that group policy blocks `npm`/`npx`; the block is either device- or
context-specific, or has been lifted. A real `npm install` was **not** attempted, so the
write path remains unproven.

Decision: **no change to the plan.** Every verification gate stays a direct `node`
invocation. A gate that works everywhere costs nothing; one that depends on `npm` fails on
whichever device is actually blocked.

`node_modules/` already contains `@neondatabase/serverless@1.1.0` and `http-server@14.1.1`,
so no vendoring was needed on this device.

## 3. Baseline test runs

**Webapp**

```text
node --test        → 1..7  # pass 7  # fail 0   (duration 367 ms)
node --check main.js → OK
```

**Scraper**

```text
python -m pytest tests/ -q                                  → 57 passed, 2 skipped in 0.60s
python -m py_compile 26s_pipeline.py publish_to_webapp.py    → OK
```

Both baselines are green. Nothing was normalised away.

`scripts/contract-test-gettimetable.js` was **not** run. As committed
(`scripts/contract-test-gettimetable.js:31-32`) it reads `path.join(root, 'sessions.json')`,
a file Phase 1 deleted and `.gitignore` now guards. This is the pre-existing condition the
plan predicted, not a regression; Task 8 makes the path an explicit input.

## 4. Live Neon state (read-only)

Project `tunniplaan-aws` (`billowing-haze-50098055`), `aws-eu-central-1`, Postgres 17.
Queried through the Neon control plane; no connection string was printed or logged.

**Schema.** The live column list for `semesters`, `groups`, `courses`, and `sessions`
matches `db/schema.sql` exactly — same names, order, types, and nullability, including
`sessions.id bigserial`, the four `jsonb` columns on `courses`, and
`semesters.is_active NOT NULL DEFAULT false`. **No material difference. Task 1 proceeds as
planned.**

**`dataset_version` and `ingested_at` do not exist on any table.** Task 1 adds both.

**Row counts and active semester**

| | |
|---|---|
| `semesters` | 1 |
| `groups` | **0** |
| `courses` | **0** |
| `sessions` | 66,846 |
| active `code` / `label` | `26s` / `2026/2027 sügis` |
| active `scraping_datetime` | `24.08.2026 16:43` |

`groups` and `courses` are empty, as expected: Phase 1 loaded sessions only. Task 6 and
everything downstream therefore genuinely require Task 3's atomic ingest to produce a
populated dataset, exactly as the dependency map states.

**Role grants — handoff finding 7 is resolved.** `db/roles.sql` *was* applied to
production:

| Grantee | Tables | Privileges |
|---|---|---|
| `neondb_owner` | all four | full |
| `scraper_rw` | all four | SELECT, INSERT, UPDATE, DELETE |
| `webapp_ro` | all four | **SELECT only** |

`webapp_ro` holds no write privilege on any table.

### 4.1 Finding: the live semester row is stale relative to the source pair

`semesters.scraping_datetime` is `24.08.2026 16:43`, but the current source
`unified_courses.json` carries `24.08.2026 17:05` (§5). `scripts/seed-sessions-from-json.js:24-33`
writes that column straight from `unified.scraping_datetime`, so the last seed ran against an
*earlier* `unified_courses.json` than the one now sitting beside the sessions file — while
the session row count still matches the current `metadata.json` exactly.

This is a live instance of the hazard spec §7.2.1 exists to close: the database's own
provenance stamp disagrees with the artifact pair on disk, and nothing in the Phase 1 path
noticed. Non-blocking — Task 3's atomic ingest overwrites the row — but it is direct
evidence for the manifest-hash precondition, and worth citing in the scraper's
`docs/260830-scrape-manifest-task.md`.

## 5. Source artifacts

Resolution per spec §7.2.2. No `--source-dir` flag exists yet and `TUNNIPLAAN_DATA_DIR` was
unset, so the configured default was consulted — **and it is wrong on this device**:

```text
26s_pipeline.py:35        C:\Users\siyima\OneDrive - Tallinna Tehnikaülikool\…\26s   (does not exist)
publish_to_webapp.py:21   same
```

The hardcoded path embeds the username `siyima`; this device is `siyi.ma`. The real
directory was located and is now pinned in both `.env` files:

```text
C:\Users\siyi.ma\OneDrive - Tallinna Tehnikaülikool\M_õppetöö\TunniplaaniAI\26s\data
```

This is the concrete failure §7.2.2 anticipates. Without `TUNNIPLAAN_DATA_DIR`, every
producer command on this device resolves to a nonexistent path.

| File | Bytes | mtime (local) | SHA-256 |
|---|---|---|---|
| `unified_courses.json` | 6,687,128 | 2026-08-24 17:05:46 | `9ad2679dd03fb5766a2e3277d724c33d4faf82ecc79a5fbb09b79220270eca36` |
| `sessions.json` | 52,775,872 | 2026-08-24 17:05:49 | `7f8ec8320d441adde0f1cdd07faed87e45a32c6803f480c46e1883664ebac261` |
| `metadata.json` | 958 | 2026-08-24 17:05:49 | `244a69f26ad4b19d7e16d6d743a31c3ee64ff1a812a7b51b98736e7770b1abd4` |

**Dataset version** (spec §7.2, `SHA256(unified ‖ 0x00 ‖ sessions)`):

```text
1bf46c1d14e3d474ac97396a77645e7f54657bbc4463bda9767a5a4d56c8da14
```

**Hydration confirmed.** Every byte of all three files was read and hashed, including the
52.8 MB `sessions.json`. No placeholder, no zero-byte read, no stall.

**Production, not test.** `metadata.json` reports `"mode": "PRODUCTION"`,
`"scraping_datetime": "24.08.2026 17:05"`, `total_courses` 1030, `total_sessions` 66846,
`failed_groups` 0. The `*_test.json` siblings (all dated 24.08.2026 14:2x, `unified_courses_test.json`
50,930 bytes) exist in the same directory and were not used. `metadata.json` records its
`output_files` under the *other* device's `siyima` path — informational only, but it means
those paths cannot be trusted as a source-resolution input.

Pair consistency, as far as the current artifacts allow: all three files share a 17:05
mtime and `metadata.json`'s counts match the parsed artifacts exactly (1030 / 66,846). The
hash stamping of spec §7.2.1(3) is still absent from `metadata.json` and remains the
scraper's task.

## 6. Baseline measurements

Script: read-only, deterministic; source in appendix A. Run against the resolved directory.

```text
counts:                      courses=1030  sessions=66846
scraping_datetime:           24.08.2026 17:05
semester (embedded):         26s / 2026/2027 sügis / 2026-08-24 → 2027-01-15, week1_monday 2026-08-31
groupToFacultyMap keys:      430   (60 still carry a location suffix)
distinct course.groups:      432   (430 groups + DOKTOR + VABA pseudo-groups)

raw unified_courses.json:    6,687,128 bytes
compact unified envelope:    5,168,251 bytes  (4.93 MiB)
compact courses array:       5,161,118 bytes

page size 200 → total_pages 6, spec §9.2 envelope:
  page 0: 1,100,773   page 1:   979,146   page 2: 960,989
  page 3:   934,381   page 4: 1,032,921   page 5: 153,741
  largest: page 0 = 1,100,773 bytes (1.050 MiB), against a 4.5 MiB ceiling — 4.3× headroom
```

**Every figure in the specification reproduces exactly**: 6,687,128 raw, 5,168,251 compact,
largest page 1,100,773 (1.050 MiB), six pages. Spec §9.2's page-size choice and §14's payload
criterion are confirmed against the real artifact.

The `unified_courses.json` top-level keys are `semester`, `groupToFacultyMap`,
`scraping_datetime`, `courses`. Note the key is **`groupToFacultyMap`** (camelCase), not the
snake_case form; Task 4's manifest builder must use the camelCase name.

## 7. Environment files

`.env` created in both repositories from `.env.example`, with `TUNNIPLAAN_DATA_DIR` set to
the resolved path above. Both are gitignored (webapp `.gitignore:10`, scraper
`.gitignore:40`) and confirmed absent from `git status` in both repos. No value was printed.

**Outstanding, owner action required:** the connection-string fields are still blank.

| Repo | Variable | Needed for |
|---|---|---|
| webapp | `NEON_DATABASE_URL` (`webapp_ro`) | Tasks 4–6, 9; `scripts/contract-test-gettimetable.js` |
| scraper | `NEON_SCRAPER_URL` (`scraper_rw`) | Task 3 production ingest (Task 11 gate) |
| scraper | `NEON_TEST_SCRAPER_URL`, `NEON_TEST_DATABASE_URL` | Task 3 disposable-branch integration tests |

These were deliberately not fetched: doing so would have written live credentials into this
session's transcript. Copy them from the Netlify environment and the Neon console.
Task 1 does not need them; Task 4 onwards does.

## 8. Stop conditions — none triggered

| Condition | Result |
|---|---|
| Overlapping uncommitted changes | none — both worktrees clean |
| Baseline failure for an unrelated reason | none — 7/7 and 57 passed |
| Live schema differs materially from `db/schema.sql` | no difference; Task 1 unchanged |
| Unhydrated / empty source artifact | fully hydrated; all bytes read |

## 9. Carried forward

1. `NEON_*` credentials must be filled before Task 4. **Owner.**
2. Source-directory resolution (`--source-dir` > `TUNNIPLAAN_DATA_DIR` > default) must reach
   `26s_pipeline.py` and `publish_to_webapp.py`; today's default is unusable on this device.
   **Task 2.**
3. `scripts/contract-test-gettimetable.js` needs its source path made explicit. **Task 8.**
4. `groups` and `courses` are empty in production, so Task 6 cannot run before Task 3 is
   reviewed — the dependency-map warning is real, not theoretical.
5. Manifest builders must read `groupToFacultyMap` (camelCase). **Task 4.**
6. The stale `semesters.scraping_datetime` (§4.1) is evidence for the manifest-hash
   precondition. **Scraper `docs/260830-scrape-manifest-task.md`.**
7. `npm` works here (§2). Gates stay on `node` regardless; the recorded "blocked by group
   policy" constraint should be re-verified before anyone relies on either reading.

## 10. Evidence integrity

No tracked application code, schema, or data changed. No credential appears in any tracked
file, brief, report, or command transcript. No push, deploy, DDL, or ingest was performed.

---

## Appendix A — measurement script

Kept out of the repository per Task 0's "controller artifacts only" rule; reproduced here so
the numbers in §6 are re-derivable.

```js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const resolved = fs.realpathSync(process.argv[2]);
console.log('source dir:', resolved);

const files = ['unified_courses.json', 'sessions.json', 'metadata.json'];
const raw = {};
for (const f of files) {
  const p = path.join(resolved, f);
  const buf = fs.readFileSync(p);
  const st = fs.statSync(p);
  raw[f] = buf;
  console.log(`${f}: bytes=${buf.length} mtime=${st.mtime.toISOString()} ` +
              `sha256=${crypto.createHash('sha256').update(buf).digest('hex')}`);
}

const version = crypto.createHash('sha256')
  .update(raw['unified_courses.json'])
  .update(Buffer.from([0]))
  .update(raw['sessions.json'])
  .digest('hex');
console.log('dataset_version:', version);

const unified = JSON.parse(raw['unified_courses.json'].toString('utf8'));
const sessions = JSON.parse(raw['sessions.json'].toString('utf8'));
const courses = unified.courses;
console.log('counts: courses=%d sessions=%d', courses.length, sessions.length);
console.log('compact unified bytes:', Buffer.byteLength(JSON.stringify(unified), 'utf8'));

const PAGE = 200;
const sorted = [...courses].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const totalPages = Math.ceil(sorted.length / PAGE);
for (let p = 0; p < totalPages; p++) {
  const body = JSON.stringify({
    dataset_version: version,
    page: p,
    page_size: PAGE,
    total_pages: totalPages,
    courses: sorted.slice(p * PAGE, (p + 1) * PAGE),
  });
  console.log(`  page ${p}: ${Buffer.byteLength(body, 'utf8')} bytes`);
}
```
