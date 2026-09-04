# Phase 2 branch review and rollout decision

**Date:** 2026-08-30  
**Repository:** `tunniplaan`  
**Review scope:** local `phase2-api` and `phase2-frontend` branches, worktree state,
branch ancestry, remote refs, and the committed webapp test suite.

## Findings

The two new branches form one intentional chain:

```text
dev @ 7500c2a
  `-- phase2-api @ 773fd4f       11 commits: Tasks 1, 4, 5, 6
        `-- phase2-frontend @ a4c9d76  9 more commits: Tasks 7, 8, 9, webapp Task 10
```

`phase2-frontend` already contains every commit from `phase2-api`. It must not be
merged as two independent branches or the same API history will be reviewed twice.
Both branches are descendants of `dev`; there is no content divergence requiring a
merge commit. Fast-forward merges are available.

At review time, the remote had `origin/dev` at `4e17958` and `origin/main` at
`91d142f`. Neither `phase2-api` nor `phase2-frontend` existed on the remote. Local
`dev` was one commit ahead of `origin/dev`; `main` was in sync.

The committed branch work includes:

- versioned Neon dataset identity, manifest and paged-course endpoints;
- API contract tests and version-pinned timetable requests;
- the paged frontend loader, fallback handling, freshness notice, and calendar race
  protection;
- the local function server, operational documentation, and browser regression
  evidence.

The local `node --test` suite passed with **98 tests, 0 failures**, and all selected
JavaScript syntax checks passed. The branch reports record a 19/19 HTTP matrix, a
15/15 browser matrix, and a 66,846-event timetable contract receipt.

## Worktree and Git LFS finding

The checkout reported many modified files because the working copy uses CRLF while
the repository contains mixed line-ending blobs. With `core.autocrlf=true`, the only
remaining worktree change is `unified_courses.json`.

That file is a Git LFS object exposed as ordinary content because `git-lfs` is not
available in this environment. Its SHA-256 and size exactly match the committed LFS
pointer (`9ad2679d…`, 6,687,128 bytes). It is not a new dataset change and must not be
staged with `git add -A`. A Git-LFS-enabled checkout should be used before any future
dataset edit or cleanup.

## Rollout decision

Use the staged rollout defined in the Phase 2 plan:

1. Publish both feature refs for review, but merge only `phase2-api` into `dev`.
2. Verify the additive APIs and the old static-data frontend on the `dev` deploy.
3. Complete the approved Neon migration/ingest and production contract checks.
4. Only then fast-forward `phase2-frontend` into the updated `dev`.
5. Keep `main` unchanged until the `dev` cutover has passed and production approval
   explicitly includes it.

Task 10's cold-operator review findings were applied in its branch commit, but its
report still says independent review is pending. The ledger deliberately keeps that
status visible; it is a prerequisite for the frontend cutover, not a reason to mix
the frontend commits into the additive API stage.

### Owner override

After Stage A, the owner clarified that the desired repository state is one remote
development branch, not two retained Phase 2 refs. The explicit instruction was to
fast-forward the full `phase2-frontend` lineage into `dev`, push it, and remove
`phase2-api` and `phase2-frontend` from the remote. That instruction supersedes the
branch-retention part of the recommendation above; it does not authorise production
DDL, ingest, a `main` merge, or Task 12 cleanup.

## Execution record

The agreed first stage was executed after this review:

- `phase2-api` was published as `origin/phase2-api` at `773fd4f`;
- `phase2-frontend` was first published at `671c8c1`, then advanced to `7763158`
  with the rollout record and ledger correction;
- `dev` was fast-forwarded from `7500c2a` to `773fd4f` and pushed to
  `origin/dev`;
- the API-stage Node test suite passed: 4 test files, 0 failures;
- the owner then directed the complete frontend lineage into `dev`; the closeout commit
  records that override before the final fast-forward and remote-ref removal;
- no production DDL, production ingest, or `main` merge was done.

The next gate is verification of the combined `dev` deployment, followed by the approved
Neon migration/ingest and production contract checks. Task 10's independent cold-operator
review remains open even though its implementation is now on `dev`.

## Recovery path

The final merge into `dev` is fast-forward-only. Before pushing, verify the target branch
and run `git status --short`. If a deployment or API parity check fails, fix forward on
`dev`; do not force-push or merge `main`.

