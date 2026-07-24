# Handoff 260724 — Neon Phase 1 executed and deployed to production (Task 8 pending)

## 1. Current Task Objectives

Execute `docs/superpowers/plans/2026-07-24-neon-phase1-sessions.md` (8 tasks) via subagent-driven development.

- ✓ Task 1 — Neon project/schema/roles (`db/schema.sql`, `db/roles.sql`, `scripts/run-sql.js`)
- ✓ Task 2 — `netlify/functions/getTimetable.js` rewritten to Neon, TDD, 7/7 tests
- ✓ Task 3 — `scripts/seed-sessions-from-json.js`; DB seeded 5,692 rows, semester `26s`
- ✓ Task 4 — contract test: 5,692/5,692 events deep-equal old vs new (`scripts/contract-test-gettimetable.js`)
- ✓ Task 5 — `main.js` limit message built from server `count`/`limit` fields
- ✓ Task 6 — local e2e via netlify dev, 8/8 checks incl. limit path
- ✓ Task 7 — dev deploy verified; dev→main merged (user-approved); production deployed; **Task 8 gate CONFIRMED on production** (300-id request → `200` `limit_exceeded` `count=5692 limit=4000`, not 502 — audit finding #14 fixed live)
- ✓ Final whole-branch Opus review: **Ready to merge: Yes**, 0 Critical
- x Task 8 — remove `sessions.json` + doc updates: **NOT started** (session ended; gate is satisfied, task is unblocked)

## 2. Current Progress

Completed this session: everything above. Commit chain on `dev` (all merged to `main`, both at `4e1a55d`):
`a7240d4` plan → `e770660` T1 → `7569c3e`/`f4e1e27`/`e1a64fc` T2 → `0127bf3` T3 → `e236c93` T4 → `4e1a55d` T5.

Known working (verified live):
- Production `https://taltech-tunniplaan.netlify.app/.netlify/functions/getTimetable` queries Neon (`webapp_ro` via Netlify env var `NEON_DATABASE_URL`), returns wire-format-identical arrays, `Cache-Control: public, max-age=300, stale-while-revalidate=3600` on 200s.
- Dev site `https://dev--taltech-tunniplaan.netlify.app` identical behavior.
- The Task 7 Steps 4–5 appendix in `.superpowers/sdd/task-7-report.md` was being appended by a background agent when the session closed — **verify its production browser-check section exists before marking task 7 fully complete** (only that browser check was still running; both curl gates already passed).

## 3. Key Context

| Piece | Value |
|---|---|
| DB | Neon Postgres, project `tunniplaan`, id `noisy-cell-37209980`, `aws-us-east-2` |
| Tables | `semesters`, `groups`, `courses`, `sessions` (only `semesters`+`sessions` populated; Phase 2 fills rest) |
| Roles | `scraper_rw` (ingest), `webapp_ro` (Netlify function, SELECT only) |
| Secrets | local gitignored `.env`: `NEON_ADMIN_URL`, `NEON_SCRAPER_URL`, `NEON_DATABASE_URL`, `SCRAPER_RW_PASSWORD`, `WEBAPP_RO_PASSWORD`; Netlify env: `NEON_DATABASE_URL` (webapp_ro, all contexts) |
| Progress ledger | `.superpowers/sdd/progress.md` — authoritative task/finding record, incl. full resume map written at pause |
| Spec / plan | `docs/superpowers/specs/2026-07-24-neon-schema-design.md` / `docs/superpowers/plans/2026-07-24-neon-phase1-sessions.md` |

Gotchas:
- Repo-wide Git LFS rule on `*.json` — package.json diffs show pointer churn; read working-tree files.
- `npm test` must stay `node --test` (bare directory arg breaks on Node v24/Windows).
- Netlify CLI may need `netlify link --id` per machine; deploys trigger via auto-build-on-push (dev build hook in `.vscode/tasks.json` is DEAD, 404).

## 4. Key Findings

1. **Task 8 gate satisfied**: production 300-id request → `200` limit envelope (recorded in ledger + task-7-report.md).
2. Final Opus review Important #1: `server.js:39` still reads `sessions.json` (`npm start` mock). Must be handled in Task 8 — decision made: **delete `server.js` and the `"start"` script** (static serving duplicated by `npm run dev`; mock diverges from real function).
3. Stale docs to fix in Task 8: `CLAUDE.md:110`, `README.md:167`, `AGENTS.md:15,33` still say the function reads `sessions.json`.
4. Dev build hook `.vscode/tasks.json` → 404; only the main-branch hook exists on the site. Recreate dev hook in Netlify UI and update tasks.json.
5. Secret hygiene (post-merge): `scripts/run-sql.js:30` logs post-substitution SQL (echoed role passwords locally, Task 1); first `env:set` attempt echoed the webapp_ro string (Task 7). Fix run-sql.js logging **then** rotate both role passwords (update `.env` + Netlify `NEON_DATABASE_URL`).
6. Current `sessions.json` is a small summer scrape (3.4 MB, 161 real course ids, 5,692 sessions) — contract/limit numbers reflect that.

## 5. Incomplete Items (priority order)

1. **Task 8** (unblocked): per `.superpowers/sdd/task-8-brief.md` PLUS extended scope from final review — delete `sessions.json` (`git rm`), drop its `.gitattributes` LFS line, add `.gitignore` guard, remove `netlify.toml` `included_files`, update CLAUDE.md, **also** delete `server.js` + `"start"` script, fix README.md/AGENTS.md stale lines, grep for `npm start`/`server.js` references. Then dev deploy → verify → merge to main → verify production (standing user approval covers this, granted 2026-07-24).
2. Verify Task 7 report appendix (production browser check) → mark harness task #7 complete.
3. Post-merge hygiene: run-sql.js logging fix; rotate `scraper_rw`/`webapp_ro` passwords; recreate dev build hook.
4. Scraper-repo ingest plan (`C:\Projects\scrape_taltech_tunniplaan`, spec "Ingest contract" section) — separate session rooted there.
5. Phase 2 (getCourses + `unified_courses.json` removal) — future plan.

## 6. Suggested Handoff Path

Review first: `.superpowers/sdd/progress.md` (ledger, incl. SESSION PAUSE block), `.superpowers/sdd/task-7-report.md` (Steps 4–5 appendix), `.superpowers/sdd/task-8-brief.md`.
Verify: `git log --oneline -3 main dev` (both at `4e1a55d`); production curl `?courses=ITX0020` → 200 array.
Next action: dispatch Task 8 implementer (SDD pattern, Sonnet) with the extended file list from Key Finding 2–3.

## 7. Risks and Notes

- **Rollback path shrinks at Task 8**: while `sessions.json` is bundled, a code revert restores file-based behavior. After Task 8, rollback = revert + restore file from git history + redeploy. Do not rush Task 8's production verification.
- **Scraper still copies `sessions.json`** into this repo until the scraper-repo ingest plan lands; Task 8's `.gitignore` guard makes the stray copy harmless. Data refreshes meanwhile: rerun `node --env-file=.env scripts/seed-sessions-from-json.js` (uses `NEON_SCRAPER_URL`).
- **"Exactly one active semester"** is intentionally not DB-enforced (spec decision; ingest transaction owns it). Do not add a unique index.
- **Never commit `.env`**; refer to secrets by env-var name only in all reports.

## 8. Suggested First Step for the Next Agent

```bash
cat .superpowers/sdd/progress.md   # resume map at bottom
tail -60 .superpowers/sdd/task-7-report.md   # confirm Steps 4-5 appendix incl. browser check
```
Then mark task #7 complete and dispatch Task 8 with the extended scope.
