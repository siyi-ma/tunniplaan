# Task 10 report — Operational contract and the no-deploy runbook

**Date:** 2026-08-30
**Repos:** both · **Plan:** Task 10 · **Spec:** §11, §12
**Status:** implemented; awaiting independent review

---

## 1. Changes

**Webapp** (`phase2-frontend`)

| File | Change |
|---|---|
| `docs/DATA_REFRESH.md` | new — webapp-side summary, links to the canonical runbook |
| `README.md` | stack, local development, data model, data flow, architecture, project structure, deployment, contributor notes |
| `CLAUDE.md` | data model, frontend/backend architecture, data updates, local testing |
| `AGENTS.md` | overview, stack, local development, data flow, verification steps |
| `docs/distilled-how-to-run.md`, `-current-state.md`, `-how-timetable-logic-works.md` | run modes, data flow, env vars |

**Scraper** (`phase2-neon-ingest`)

| File | Change |
|---|---|
| `docs/neon-refresh-runbook.md` | new — the canonical operator runbook |
| `README.md` | "Getting the data live" replaces "Publishing to the Webapp"; rollback publishing separated |
| `CLAUDE.md` | step 5 is now the Neon ingest; the file copy becomes step 5b, marked temporary |
| `publish_to_webapp.py` | reframed as the rollback-artifact refresh; copies `unified_courses.json` only |

`docs/data-contract.md` already gained its `metadata.json` section in the manifest
prerequisite task.

## 2. The runbook is deploy-free, and that is checked

Steps 1–7 are: offline tests → test scrape → full scrape → dry-run validate → ingest →
contract verification → look at the site. Verified mechanically:

```text
awk '/^## 1\. Run the offline tests/,/^## 7\. Look at the site/' docs/neon-refresh-runbook.md
  | grep -E "git add|git commit|git push|build hook|netlify deploy"
  -> clean: no git/deploy step in steps 1-7
```

The one thing that *does* deploy — refreshing the committed rollback artifact — is in an
appendix, explicitly labelled temporary, and explicitly called a deploy. Hiding that would be
the dishonest simplification: it would make the "no deploy" claim tidier and wrong.

## 3. Three things that were being conflated

The old docs used "the data" for the scraper's output, the database contents, and the
committed JSON interchangeably. All three are now named separately wherever they appear:

| | What | Where |
|---|---|---|
| Source artifacts | `unified_courses.json` + `sessions.json` + `metadata.json` | the scraper's `TUNNIPLAAN_DATA_DIR` |
| Runtime data | four Neon tables | Neon Postgres |
| Rollback artifact | the committed `unified_courses.json` | the webapp repo, temporarily |

Nothing in the current docs still says the frontend loads the static file as its normal path
— grepped for and confirmed empty.

## 4. Local modes, stated accurately

The old docs called `npm run dev:netlify` "recommended (and only)". It cannot run here:
`npx` is policy-blocked and `netlify-cli` is not installed. And `npm run dev` is no longer
merely limited — the page loads **all** its data through functions now, so a static server
produces the load error rather than a partly-working page.

Every doc now says: use `node scripts/dev-functions-server.js`, it needs
`NEON_DATABASE_URL`, and **it is not Netlify** — no routing, redirects, payload-limit
enforcement or edge caching. It proves handler behaviour, not platform behaviour.

## 5. Credentials, by name only

Documented as environment-variable names with their roles and consumers; no value appears
anywhere. `scraper_rw` is stated as belonging only to the scraper's `.env`, never the webapp
or Netlify.

The runbook and `DATA_REFRESH.md` both record the constraint found in Task 4's review:
**neither role can run DDL.** Migrations need `neondb_owner`; `scraper_rw` gets
`must be owner of table semesters`. An operator discovering that during a production window
would be an avoidable bad evening.

## 6. Also documented

Transaction rollback (a failure leaves the previous dataset completely intact), the
`INGEST OK` receipt, stale-tab behaviour (409 plus an offered reload, never an automatic
one), the four-way cache policy and why `limit_exceeded` is excluded from it, recovery
through the static fallback and why the fallback is scoped to unavailability rather than any
error, and `--allow-new-semester`.

## 7. Grep triage

The plan's grep returns 304 hits across the webapp. They fall into two groups:

| Group | Files | Action |
|---|---|---|
| **Current operational docs** | `README.md`, `CLAUDE.md`, `AGENTS.md`, the three `docs/distilled-*.md` | **all updated** |
| **Dated handoffs and audits** | 18 files, every one prefixed with its date (`260707-…`, `260824-…`, `260829-…`) | **deliberately left alone** |

The dated files are point-in-time records of what was true when they were written. Rewriting
them would falsify the project's own history and destroy the audit trail those very reviews
depend on. `docs/superpowers/` was excluded for the same reason — it is the Phase 2 evidence
package, including the reports that record what each task found.

Post-update hits in the current docs are all correct usages: the runbook naming
`publish_to_webapp.py` as the rollback path, `CLAUDE.md` naming
`seed-sessions-from-json.js` as the superseded Phase 1 loader, and Netlify references that
are genuinely about hosting or deployment of code.

## 8. Verification

```text
webapp:   node --test                              98 passed, 0 failed
          node scripts/contract-test-getcourses.js COURSE CONTRACT OK
scraper:  python -m pytest tests/ -q               172 passed
          python -m py_compile (4 files)           OK
          python publish_to_webapp.py --dry-run    validates; new messaging correct
```

The publish script's dry run now prints:

```text
This refreshes the ROLLBACK ARTIFACT, not the live data.
The live refresh is: python neon_ingest.py  (see docs/neon-refresh-runbook.md)

Suggested commit (run in the webapp repo):
  git add unified_courses.json
  git commit -m "Update 20260830 unified courses: 430 groups and 1030 courses"
```

It no longer suggests `git add sessions.json` — that file is gitignored in the webapp and its
data lives in Neon, so the old suggestion produced either a confusing error or a stray 52 MB
file that looked load-bearing. `CLAUDE.md` previously carried a note telling readers to
ignore that part of the output; the note is gone because the output is now correct.

## 9. Carried forward

1. **A cold-operator review is the completion evidence this task cannot produce for itself.**
   The plan asks a reviewer to read the runbook as a downstream operator and report any
   missing command or ambiguous environment. I wrote it, so I am the worst judge of whether
   it is followable.
2. The runbook's step 3 timing (~140 min) is from records, not measured this session.
3. Task 12 deletes the rollback artifact, `STATIC_FALLBACK_ENABLED`, and the appendices that
   describe them.

## 10. One-time line-ending normalisation (read the diffs with this in mind)

Two files show a whole-file diff that is **not** a whole-file content rewrite:

| File | Blob before | Blob after | Content lines actually edited |
|---|---|---|---|
| webapp `CLAUDE.md` | CRLF (266) | LF (298) | ~60 |
| scraper `README.md` | CRLF (427) | LF (449) | ~45 |

Both were the sole CRLF-stored text files in their repositories — every other tracked text
file, including all the `.py` files, already stored LF — and both repos have
`core.autocrlf=true`, which normalises on commit. Writing to them at all was enough to
convert them.

I tried to preserve the CRLF blobs (`git -c core.autocrlf=false add`) rather than churn the
diff, and it did not take. Rather than add a `.gitattributes` rule to protect two outliers,
the normalisation stands: it aligns them with the other ~40 tracked text files. The plan's
actual constraint — "preserve LF in scraper `.py` files" — holds: `publish_to_webapp.py` was
LF before and after, and no `.py` file changed line endings.

`git diff -w` or a diff tool set to ignore line endings shows the real change in both files.
