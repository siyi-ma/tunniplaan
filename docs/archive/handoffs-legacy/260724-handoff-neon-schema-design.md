# 260724-handoff-neon-schema-design

Session date: 2026-07-24 (afternoon, ~14:00–14:45 EEST)
Branch: `dev`
Scope: assess moving timetable data from LFS-bundled JSON to Neon Postgres; brainstorm and write the target schema design. No implementation — docs only.

---

## 1. Current Task Objectives

- ✓ Assess owner's proposal: can `scrape_taltech_tunniplaan` ingest into a third-party DB (Neon) instead of publishing JSON files, so scrapes stop triggering Netlify deploys?
- ✓ Write the assessment as a doc in `docs/`
- ✓ Brainstorm the Neon schema interactively with the owner (semester scope, normalization level, table boundaries)
- ✓ Verify the proposed schema against actual `main.js` field consumption (not just the JSON shape) — found and fixed 3 fit issues
- ✓ Write the schema as a design spec, get owner approval
- x Write an implementation plan (deferred — this session stopped at spec approval, next step per the brainstorming skill's own process)
- x Any code changes — zero implementation this session, docs only

## 2. Current Progress

Completed this session, both committed in `9a9c60f`:

1. **`docs/20260724-neon-data-backend-assessment.md`** — architecture assessment. Root cause identified: both problems (deploy-coupled data updates AND the production 502 at 280+ courses from the prior audit, finding #14) stem from the same thing — data bundled with code. Recommends Neon specifically for its serverless HTTP driver (`@neondatabase/serverless`), which avoids the connection-pool exhaustion problem classic Postgres has under Lambda. Recommends phased migration: sessions first (fixes the 502, highest value/lowest risk), courses second, SQL-side filtering only if ever needed.

2. **`docs/superpowers/specs/2026-07-24-neon-schema-design.md`** — the approved schema spec, produced via `superpowers:brainstorming`. Four tables: `semesters`, `groups`, `courses`, `sessions`. Key decisions (all owner-confirmed via `AskUserQuestion`):
   - **Semester scope**: accumulate all scraped semesters in DB (every table has `semester_code`), but app functions default to `WHERE semester_code = <active>`. No UI change; history kept for free.
   - **Normalization**: hybrid — real indexed columns for anything `main.js` filters/joins on (eap, school_code, institute_code, keel, assessment_form, etc.), JSONB for nested payloads (`group_sessions`, session `groups[]`, `instructor`, `study_programmes`) so the wire format matches today exactly.
   - **Session identity**: sessions have no stable natural key in the source data, so ingest is replace-per-semester (`DELETE` + bulk `INSERT` in one transaction) rather than per-row upsert. Courses and groups DO have stable keys and use real `ON CONFLICT` upsert.
   - **`groupToFacultyMap`**: modeled as a real `groups` table (427 rows, semester-scoped) rather than a JSONB blob, since `getCourses` must reassemble it into a flat map on every request.

3. **Post-brainstorm verification pass** (not part of the skill's default checklist — added because the owner asked "make sure it fits well to webapp"): grepped every field `main.js` actually accesses and traced `getTimetable`/`initializeApp` call sites. Found 3 issues the schema-only view missed:
   - **Critical**: `main.js:211` `parseDate` splits on `.` expecting `DD.MM.YYYY`; a raw Postgres `date` column serializes as ISO and would silently break the calendar (no thrown error — just empty render). Same for `time` columns vs. expected `HH:MM`. Fixed by specifying the exact `to_char(...)` formatting in the `getTimetable` SELECT — this is now the load-bearing part of the spec.
   - `getCourses` must reassemble a 4-part envelope (`semester`, `courses`, `groupToFacultyMap`, `scraping_datetime`) from 3 tables — `main.js:1670-1675` destructures all four keys.
   - Folded in the prior roadmap's Phase 6/H7 amendment (server-authoritative session limit, `{count, limit}` response shape) into the `getTimetable` rewrite directly, since we're touching that function anyway — closes audit finding #14 as part of Phase 1 rather than as separate future work.

Known working (verified by direct inspection this session):

- `sessions.json`: 5,692 events, flat array, `course_id`/nullable `date,start,end`/`type`/`instructor{name,title}`/`room`/`weeks` (25 distinct value shapes incl. comma lists)/`comment`/`groups[]{group,ainekv}`/`is_veebiope`. 35/5692 have null date (online sessions).
- `unified_courses.json`: 161 courses (not ~1000 as CLAUDE.md still claims — data is semester-scoped, currently `26s` autumn 2026), top-level `semester` object (7 fields incl. `week1_monday`), `groupToFacultyMap` (427 entries), `scraping_datetime`.
- `main.js:1670-1675` (`initializeApp`) is the sole consumer of the `unified_courses.json` envelope shape.
- `main.js:938-951` (`toggleCalendarView`) is the sole consumer of `getTimetable`'s response; `main.js:954` compares `totalFilteredSessions` against local `CALENDAR_SESSION_LIMIT` — this is the exact spot the roadmap's H7 amendment and this session's Phase-1 rewrite both target.

## 3. Key Context

| Area | Fact |
|---|---|
| Repo | `C:\Projects\tunniplaan`, vanilla JS SPA + one Netlify function |
| Sibling repo | `C:\Projects\scrape_taltech_tunniplaan` (scraper; publishes via `publish_to_webapp.py`) — **owner intends to put both repos in one workspace** for the cross-repo implementation phase (stated at close-session time, not yet done) |
| Branch model | Work on `dev` only; `main` is production (Netlify auto-deploy) |
| New docs this session | `docs/20260724-neon-data-backend-assessment.md`, `docs/superpowers/specs/2026-07-24-neon-schema-design.md` |
| Prior roadmap | `docs/260707-post-audit-remediate-roadmap.md` — 14 phases, still not executed (owner deferred in the 2026-07-07 session too); finding #14 / H7 (server-side session limit) is now partially superseded — the Neon spec's Phase 1 subsumes it |
| Data contract today | `docs/data-contract.md` in the scraper repo defines the JSON schema shared by both repos; the Neon spec's "Ingest contract" section is designed to replace this once Phase 1 ships |

Gotchas:

- The Neon spec deliberately preserves the **exact legacy wire format** (`DD.MM.YYYY` dates, `HH:MM` times, bare-array response) via `to_char()` formatting in SQL, specifically so Phase 1 requires **zero frontend rewrite** beyond the `count`/`limit` limit-response handling (which the audit roadmap already specified as a client change). Do not "clean up" the date format during implementation without treating it as a scope change — it's called out explicitly in the spec's Risks section as a deliberate compat seam.
- `semesters.is_active` is the single source of truth for "which semester does the webapp serve" — exactly one row must be true at all times. The ingest contract sets this atomically as part of the same transaction that upserts the semester row.
- Session `weeks` field is free-text with 25+ distinct shapes (ranges, comma lists, singles) parsed client-side only — deliberately kept as `text`, not modeled relationally.

## 4. Key Findings

1. Root cause unification: the deploy-coupling complaint and the standing 502 production bug (audit finding #14, 280+ courses) are the same underlying defect — data bundled into the deploy artifact — not two separate problems needing two separate fixes.
2. `main.js`'s date parsing (`parseDate` at line 211, dot-split) is a hard constraint on any DB-backed rewrite: naive Postgres `date`/`time` serialization would silently break the calendar view with no error surfaced. This is now the single most important line in the design spec's wire-format contract section.
3. CLAUDE.md's course-count claim ("~1000 courses") is stale against the live data (161 courses, semester-scoped) — noted here but out of scope to fix this session (CLAUDE.md wasn't touched).
4. The prior roadmap's Phase 6 / H7 amendment (client must read `count`/`limit` from the response, not the local constant) is still unexecuted from the 2026-07-07 session, but is now folded into the Neon Phase-1 scope rather than needing separate execution against the JSON-file version of `getTimetable.js`.

## 5. Incomplete Items

1. (Highest) Write the implementation plan for Phase 1 (sessions table + `getTimetable.js` rewrite) via `superpowers:writing-plans` — this is the explicit next step the brainstorming skill hands off to, not started this session.
2. Phase 1 implementation spans two repos. This repo's plan can be written now; the scraper repo (`scrape_taltech_tunniplaan`) needs its own ingest-script implementation against the spec's "Ingest contract" section — that's a separate planning pass in the other repo.
3. Owner stated intent to combine both repos into one workspace before/during implementation — not yet done as of this handoff. Next agent should confirm workspace setup before starting the implementation plan if cross-repo editing is expected in one session.
4. Neon project itself does not exist yet — no database has been provisioned, no connection strings issued. First implementation step will need this (owner action, likely — Neon console).
5. Prior roadmap (`docs/260707-post-audit-remediate-roadmap.md`, phases 0-11) is still fully unexecuted — orthogonal to this work but still outstanding from two sessions ago.

## 6. Suggested Handoff Path

Files to review first:

- `docs/20260724-neon-data-backend-assessment.md` — why, in plain terms
- `docs/superpowers/specs/2026-07-24-neon-schema-design.md` — the approved spec (schema, wire-format contract, ingest contract, phasing, testing, risks)
- This handoff

Verify steps:

```bash
git log --oneline -3          # 9a9c60f should be at/near HEAD
git status --short            # expect clean (or only .remember/ noise, untracked, ignorable)
```

Recommended next action: invoke `superpowers:writing-plans` against the approved spec, scoped to Phase 1 only (sessions table + `getTimetable.js` rewrite in this repo). Treat the scraper-repo ingest script as an out-of-scope dependency to be planned separately once workspace setup is confirmed.

## 7. Risks and Notes

- **Wire-format compat is load-bearing, not cosmetic**: any implementation that "modernizes" the date/time format without updating `main.js:211`'s `parseDate` (and the dedupe key at `main.js:1062`) will silently break the calendar view. Flagged in the spec's own Risks section — repeating here because it's the single highest-probability implementation mistake.
- **Two-repo coordination**: this repo's plan cannot cover the scraper-repo ingest script. Do not treat Phase 1 as "done" until both sides are verified against the same live Neon instance with a contract test (spec's Testing section describes the old-vs-new deep-equal approach).
- **No Neon project provisioned yet**: implementation cannot proceed past scaffolding until the owner creates the Neon project and issues `scraper_rw` / `webapp_ro` credentials per the spec's Roles section.
- **Docs-only commit, not pushed**: `9a9c60f` is local-only on `dev`. Per repo convention (noted in the 260707 handoff), pushing docs-only commits is low-risk but still triggers a Netlify branch build until the roadmap's Phase 5 build-ignore rule lands (which itself is still unexecuted).

## 8. Suggested First Step for the Next Agent

```bash
cd C:\Projects\tunniplaan
git status --short   # confirm clean before starting
```

Then invoke `superpowers:writing-plans` with `docs/superpowers/specs/2026-07-24-neon-schema-design.md` as input, scoped to Phase 1 (sessions table + `getTimetable.js` rewrite) only.
