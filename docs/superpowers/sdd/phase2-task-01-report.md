# Task 1 report — Add dataset identity columns and an idempotent migration

**Date:** 2026-08-30
**Repository:** webapp `C:\Projects\tunniplaan`, branch `dev`
**Status:** complete — independently reviewed, all findings applied
**Branch:** `phase2-api` (plan §1.4), based on `dev` @ `7500c2a`

---

## 1. Changes

| File | Change |
|---|---|
| `db/schema.sql` | `semesters` gains nullable `dataset_version text` and `ingested_at timestamptz` |
| `db/migrations/20260829_phase2_dataset_version.sql` | new — two `ADD COLUMN IF NOT EXISTS` statements |
| `tests/db/schema.test.js` | new — three static assertions over the checked-in DDL |

Nothing else was touched. No Netlify function, no `main.js`, no wire contract, no
credential, no production DDL.

## 2. Red → green

The test was written first and failed for the right reason:

```text
not ok 1 - clean schema declares the Phase 2 dataset identity columns
  error: 'semesters.dataset_version must be declared text'
not ok 2 - the Phase 2 columns stay nullable until an ingest backfills them
  error: 'semesters.dataset_version must exist'
not ok 3 - the Phase 2 migration is idempotent and matches the clean schema
  error: '…\db\migrations\20260829_phase2_dataset_version.sql must exist'
# tests 10  # pass 7  # fail 3
```

After the schema and migration were added:

```text
# tests 10  # pass 10  # fail 0
```

The pre-existing seven `getTimetable` tests were green before and after.

One intermediate failure is worth recording: the "no NOT NULL constraint" assertion
first matched the phrase *"Do not add NOT NULL here"* in the migration's own comment
header. The **test** was wrong, not the migration — a constraint assertion must read
statements, not prose — so `stripComments()` was added and applied to both files.
Deleting the comment would have removed the warning a future editor most needs.

### Why a static test at all

`db/schema.sql` and the migration are applied by hand and have no runtime consumer, so
nothing else catches drift between them. A column added to one and not the other yields
two different `semesters` shapes depending on whether a database was *created* or
*migrated* — and the divergence would only surface much later, in Task 4's manifest
query. The test asserts three things: the clean schema declares both columns with the
right types, neither is `NOT NULL`, and the migration adds exactly those columns
idempotently and additively (no `DROP`).

## 3. Migration proof on a disposable branch

Branch `phase2-task1-migration-test` (`br-calm-art-as9qjjef`), created from production
HEAD (`br-misty-dawn-asz71awx`, LSN `0/6C480F8`), so it carries the real schema, the real
row, and the real roles.

**Before:** query for the two columns returned `[]` — neither existed.

**First apply**, both statements through the Neon control plane's multi-statement
transactional endpoint (deviation D2 — no `webapp_ro`/admin connection string is available
locally yet): success. Resulting `semesters`:

```text
 1 code              text                      NOT NULL
 2 label             text                      NOT NULL
 3 name_et           text
 4 name_en           text
 5 start_date        date
 6 end_date          date
 7 week1_monday      date
 8 is_active         boolean                   NOT NULL DEFAULT false
 9 scraping_datetime text
10 dataset_version   text                      nullable, no default   <-- new
11 ingested_at       timestamp with time zone  nullable, no default   <-- new
```

Both new columns are nullable with no default, as the plan requires. Column order matches
`db/schema.sql`.

**Second apply:** the identical transaction ran again and **succeeded with no
duplicate-column error**; the table still reports 11 columns. Idempotence proven.

Note the migration's own documented apply path,
`node scripts/run-sql.js db/migrations/…`, is **not** transactional:
`scripts/run-sql.js:24-32` splits on `;` and issues each statement as its own autocommit
HTTP call. That is harmless for this migration — both statements are additive and
idempotent, so a partial apply is simply re-run — but the runbook must not describe that
path as atomic. Task 3's ingest, which genuinely needs one transaction, cannot use
`run-sql.js`.

## 4. Role isolation

Two independent checks on the same branch.

**Catalog privileges** — table-level grants automatically extend to columns added later,
so `db/roles.sql` needed no change:

| Check | Result |
|---|---|
| `webapp_ro` SELECT `dataset_version` / `ingested_at` | **true / true** |
| `webapp_ro` UPDATE `dataset_version` / `ingested_at` | **false / false** |
| `webapp_ro` INSERT / DELETE on `semesters` | false / false |
| `scraper_rw` UPDATE `dataset_version` / `ingested_at` | true / true |

**Empirical, acting as the role.** A first attempt failed with
`permission denied to set role "webapp_ro"`, which was misread as missing membership;
`GRANT webapp_ro TO neondb_owner` was then issued **on the disposable branch only**. The
review established that production *already* grants that membership (via `cloud_admin`,
with `admin_option`), so the grant was redundant and the real cause of the first failure
was the execution channel — each statement travels as its own HTTP call, so a bare
`SET ROLE` does not survive into the next one. Issuing `SET LOCAL ROLE` inside a
multi-statement transaction is what actually made it work:

```text
SET LOCAL ROLE webapp_ro;
select current_user, code, dataset_version, ingested_at from semesters where is_active;
  -> webapp_ro | 26s | null | null            -- reads the new columns

SET LOCAL ROLE webapp_ro;
update semesters set dataset_version = 'must-not-succeed' where is_active;
  -> ERROR: permission denied for table semesters
```

The extra membership row exists only on the throwaway branch. Production role membership is
unchanged, and `db/roles.sql` is untouched.

## 5. Production untouched

After all of the above, queried against the production default branch:

```text
phase2_columns_on_production = 0
semesters = 1
sessions  = 66846
```

Neither column exists in production, and no row changed. Production DDL happens at
Task 11's gate, not here.

## 6. Verification output

```text
node --test        # tests 10  # pass 10  # fail 0
git diff --check   (no output)
```

## 7. Carried forward

1. The disposable branch `phase2-task1-migration-test` (`br-calm-art-as9qjjef`) still
   exists and holds a full copy of production data plus a role-membership grant that
   production does not have. **It must be deleted once this task's review is complete** —
   deletion needs the owner's explicit approval.
2. The production migration is deferred to Task 11's staged rollout, together with the
   first atomic ingest that backfills both columns.
3. `db/roles.sql` needs no amendment: table-level grants already cover columns added
   later. Worth restating in Task 10's runbook so nobody "fixes" it.

## 8. Task 0 review findings, applied here

The Task 0 independent review returned *approved with minor findings*. All three text
fixes ride along in this task's commit:

| Finding | Fix |
|---|---|
| Spec and plan still said "the drafts remain `Draft — pending review`" in their Review notes, contradicting the approved header | sentence replaced in both files |
| Task 0's "Expected evidence" said `No tracked commit`, contradicting §1.1's requirement that the ledger be tracked | bullet narrowed to application code/schema/data; logged as **D3** |
| Report §6 cited spec §14 for the payload ceiling; §14 is the rollout gate list | corrected to §9.2 / §13 criterion 6 |

Marking the spec and plan `Approved` was also logged as **D4**, since it rests on owner
authorisation no reviewer can verify independently.

## 9. Task 1 review findings, applied

Verdict: **changes required**, on process rather than engineering. The reviewer independently
reproduced every technical claim — including six mutation tests proving the new schema test
is not a tautology — and confirmed production was never migrated.

| # | Finding | Fix |
|---|---|---|
| I1 | The commit landed on `dev`, not the `phase2-api` branch plan §1.4 mandates. Left alone until Tasks 7–9 also landed there, the two-stage rollout would have needed the cherry-picking §1.4 exists to avoid | commit moved to `phase2-api`; `dev` reset to `7500c2a`. Nothing was pushed, so no visible history changed. Topology table added to the ledger |
| M2 | Ledger F9 claimed the throwaway branch's role grant was something production lacked; production already had that membership via `cloud_admin` | F9 reworded; §4's rationale corrected — the `SET ROLE` failure came from the per-statement HTTP channel, not from missing membership |
| M3 | §3 claimed "one transaction", but the migration's documented `run-sql.js` path issues autocommit statements | corrected, and the limitation recorded for Task 3, which genuinely needs atomicity |
| M4 | `stripComments()` missed `/* … */`, so a block-comment rewrite of the "do not add NOT NULL" warning would have failed the build for no reason | block comments now stripped; the remaining string-literal assumption is stated in the code |
| M5 | The ledger recorded no commands or worktree state for Task 1, which §1.1 requires | "Commands run in Task 1" section added |
| M6 | The ledger said "this commit" self-referentially | resolved to `ffce930` |
