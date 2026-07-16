# 260707-handoff-roadmap-autonomy-amendments

Session date: 2026-07-07 (evening, ~21:50–22:40 EEST)
Branch: `dev`
Scope: review + amend `docs/260707-post-audit-remediate-roadmap.md`; verify it is executable by an autonomous agent. No roadmap phases were executed.

---

## 1. Current Task Objectives

- ✓ Review the synthesized remediation roadmap against actual repo state
- ✓ Apply amendments for the two blocking findings (Phase 7 coverage gap, stale working-tree premise)
- ✓ Apply minor amendments (Phase 6 server-authoritative limit, handoff prompt `docs/` path)
- ✓ Verify the roadmap is autonomously executable (feasibility check only)
- x Execute roadmap phases 0–11 — explicitly deferred by owner; owner chose "subagent now, I supervise" + "phases 0–11" scope when asked, then cancelled execution for this session

## 2. Current Progress

Completed this session (all in `docs/260707-post-audit-remediate-roadmap.md`):

- Phase 0: added state correction — working tree verified clean as of `db73e17`; the "known dirty items" (CLAUDE.md rewrite, Gemini doc deletion, GA fix, hook stripping) were already committed in `88352fb` and `516f24e`. Any dirty file found during execution is NEW and must be reported.
- Phase 7: corrected the hook-URL leak locations. `CLAUDE.md` was already stripped (`88352fb`). Remaining literal URLs: `docs/distilled-how-to-run.md:80,83` (active — must be scrubbed) and `docs/archive/setup-and-devops-2026/20260202-claude-md-and-index-html-fixes.md` (archived — policy: do NOT edit; inert after owner rotates the hook). Validation grep tightened to `api\.netlify\.com/build_hooks/[a-f0-9]+` with `--exclude-dir=docs/archive`.
- Phase 8: retitled "Remaining repo cleanup", reduced to two live tasks: fix stale size claims in CLAUDE.md (`sessions.json` is ~26 MB verified 2026-07-07, not 42 MB; `unified_courses.json` ~5 MB) and `git rm test.txt` (verified tracked, content is only "Test deploy"). Commit message updated to `audit H6: fix stale size claims and remove deploy test file` (both in Phase 8 and section 7 commit-order list).
- Phase 6 task 3: client must build the too-many-sessions message from the response's `count`/`limit` fields, not the local `CALENDAR_SESSION_LIMIT` constant.
- Section 6 final checklist: greps aligned with the Phase 7 archive policy.
- Section 9 handoff prompt: roadmap path corrected to `docs/260707-post-audit-remediate-roadmap.md`.

Known working (verified by direct inspection this session):

- `.gitattributes` is `*.json` LFS-wide; `package.json`/`package-lock.json` ARE LFS objects (Phase 1 premise holds)
- Root `netlify.toml` lacks `[build] ignore`; `docs/netlify.toml` has it (Phase 5 premise holds)
- `netlify/functions/getTimetable.js:6` reads `event.queryStringParameters.courses` unguarded; resolves `process.cwd()/sessions.json` (Phases 3–4 premises hold)
- `npm test` is the failing placeholder; `npm run dev:netlify` runs on port 8000 (`-p 8000` in package.json)
- `main.js:75` has `CALENDAR_SESSION_LIMIT = 4000`, checked only post-fetch at `main.js:915–926`
- `index.html` GA ID already correct (`G-S3SQ4PZ2JF`, lines 5 and 10) — Phase 10 item 1 is pre-satisfied
- `.vscode/tasks.json` is gitignored; `test.txt` is tracked; `server.js` exists

## 3. Key Context

| Area | Fact |
|---|---|
| Repo | `C:\Projects\tunniplaan`, vanilla JS SPA + one Netlify function |
| Branch model | Work on `dev` only; `main` is production (Netlify auto-deploy) |
| Roadmap | `docs/260707-post-audit-remediate-roadmap.md` — 14 phases, sections 5 (approval gates), 6 (definition of done), 9 (paste-ready handoff prompt) |
| Source audits | `docs/260707-codex5-*` and `docs/260707-fable5-*` (4 files) |
| Data files | `sessions.json` 26 MB, `unified_courses.json` 5 MB, both Git LFS |

Gotchas:

- `netlify dev` defaults to port 8888 but this repo pins 8000 — roadmap validation URLs use 8000 deliberately.
- Browser-validation steps (Phases 2, 6, 9, 10) need Netlify CLI auth (done on this machine) + a browser-driving tool; a headless agent should degrade to node-level checks and flag browser steps unverified.
- The bare string `build_hooks/` appears legitimately in audit docs as pattern text; only full URLs matching `api\.netlify\.com/build_hooks/[a-f0-9]+` count as leaks.

## 4. Key Findings

1. `docs/distilled-how-to-run.md:80,83` — live Netlify build-hook URLs committed in an active doc; the roadmap's Phase 7 originally missed this file entirely.
2. Phases 0/8 assumed a dirty working tree that was committed days before (`88352fb`, `516f24e`); executing them as originally written would have an agent hunting for nonexistent work.
3. CLAUDE.md still claims sessions.json is ~42 MB (actual 26.2 MB) — deliberately left for the roadmap's Phase 8 commit.
4. `test.txt` is tracked, content "Test deploy" — safe to `git rm` (Phase 8).

## 5. Incomplete Items

1. (Highest) Execute roadmap phases 0–11 — owner-approved scope, execution mode "supervised subagent", deferred to a future session.
2. Optional handoff-prompt hardening before execution: add "do not push; leave commits local for owner review" and an explicit degrade-path note for browser validation in headless environments (identified this session, not applied — owner did not request).
3. Phases 12–13 (helper tests, `groups=` URL param) deferred by owner choice; Phase 14 (browser smoke) needs owner dependency approval.

## 6. Suggested Handoff Path

Files to review first:

- `docs/260707-post-audit-remediate-roadmap.md` — the executable plan (amended, committed)
- This handoff

Verify steps:

```bash
git log --oneline -3          # amendment commit should be at/near HEAD
git status --short            # expect clean
```

Recommended next action: execute the roadmap via its own section 9 handoff prompt, scope phases 0–11, stopping at section 5 approval gates. Owner supervision preference: dispatch per-phase subagents, review each commit.

## 7. Risks and Notes

- **Hook rotation is owner-only**: the exposed main build hook (`6980b6f3...`) is live until the owner rotates it in Netlify UI. Scrubbing docs (Phase 7) does not de-risk the already-public git history — rotation does.
- **Do not edit `docs/archive/`**: Phase 7's archive policy and Phase 11 both forbid it; validation greps exclude it.
- **Pushing `dev` may trigger a Netlify branch build**: harmless for docs commits until Phase 5 lands the build-ignore rule; after Phase 5, docs-only pushes should be ignored by Netlify.
- **Roadmap is a program, not prose**: every phase has a validation block whose expected output is stated; an executing agent that cannot make a validation pass must stop and report, not widen scope (global rule 4).

## 8. Suggested First Step for the Next Agent

```bash
cd C:\Projects\tunniplaan
git checkout dev && git pull
git status --short   # must be clean before Phase 0
```

Then paste section 9 of `docs/260707-post-audit-remediate-roadmap.md` as the execution prompt, scoped to phases 0–11.
