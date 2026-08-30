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

## 10. Line-ending normalisation (read the diffs with this in mind)

Two files show a whole-file diff that is **not** a whole-file content rewrite:

| File | Blob before | Blob after | Content lines actually edited |
|---|---|---|---|
| webapp `CLAUDE.md` | CRLF (266) | LF (298) | ~60 |
| scraper `README.md` | CRLF (427) | LF (449) | ~45 |

Both repos have `core.autocrlf=true`, which normalises on commit, so writing to either file at
all was enough to convert it. I tried to preserve the CRLF blobs
(`git -c core.autocrlf=false add`) and it did not take.

**A first version of this section justified that by claiming these were the only CRLF-stored
text files in their repositories. That was false, and the Task 10 reviewer caught it.**
Measured at the commits' parents:

- **webapp: 3 CRLF blobs** — `main.js` (2031), `CLAUDE.md` (266), `main.css` (186)
- **scraper: 25 CRLF blobs** — including `archive/25s_pipeline.py` (834),
  `docs/archive/reference-sources/repo_agents.md` (514), `README.md` (427)

So the two largest source files in the webapp (`main.js`, `main.css`) remain CRLF, and the
repositories are *mixed*, not uniformly LF. The normalisation of these two files is therefore
incidental — a side effect of editing them under `autocrlf=true` — not an alignment with a
convention.

It stands because reverting it would mean adding `.gitattributes` rules to pin two files
against the repo's own commit filter, which is more machinery than the problem deserves. The
plan's actual constraint holds: **`publish_to_webapp.py` was LF before and after, and no `.py`
file changed line endings.** `git diff -w` shows the real change in both files.

## 11. Cold-operator review findings, applied

Verdict: **changes required**. The reviewer executed the runbook as a stranger would, ran
every read-only and dry-run step, and produced a step-by-step followability table. Four steps
were not followable as written. The routine flow's deploy-freedom passed in substance, which
was the one thing this task most needed to get right.

### Critical

| # | Finding | Fix |
|---|---|---|
| **F1** | **`docs/data-contract.md` — a file the plan names as a Task 10 deliverable — was never touched.** It still said the webapp consumes two files published to its repo root, routed the operator to the superseded non-atomic `seed-sessions-from-json.js`, described the 1–2 minute partial-data window as current, and presented commit-and-push as part of a data refresh. Both scraper `README.md` and `CLAUDE.md` point at it as the reference | rewritten: artifacts are ingest inputs, `neon_ingest.py` is the refresh, the rollback copy is separated and marked temporary, and the Phase 1 loader is labelled superseded |
| **F2** | The runbook's credential table put `NEON_DATABASE_URL` in the scraper `.env`, where it does not exist. Worse, `neon_ingest.py` silently fell back to the **write** connection for the post-commit re-read — so the "separate read-only connection" both the runbook and `CLAUDE.md` claimed was not happening | the ingest now prints which connection it verified on, and says plainly when it is not independent; `.env.example` gains the variable; the runbook documents it as optional-but-recommended |
| **F3** | `docs/distilled-current-state.md` still drew the static file as "loaded at startup; drives all filtering", with the manifest hanging off calendar view and terminating at a 42 MB `sessions.json` "bundled with function" — a file that is not in the repo. Report §3 claimed no such statement remained | architecture redrawn: page load → manifest → paged courses → Neon; calendar → versioned timetable; static file only on API failure |

### Important

| # | Finding | Fix |
|---|---|---|
| F4 | `docs/distilled-how-to-run.md` described `netlify.toml` `included_files` bundling and a build-ignore rule. **There is no `netlify.toml`** — removed in `4190a72`. The same file also committed two live Netlify build-hook URLs, which `CLAUDE.md` declares secrets | corrected; hook URLs redacted, and the two unmasked copies in `docs/archive/` masked to match the convention a later doc in that folder already used |
| F5 | The runbook told the operator the publish script "still mentions" `git add sessions.json` — a thing this very task had already fixed | removed |
| F6 | Report §10's line-ending justification was false: it claimed these were the only CRLF-stored files. Measured: the webapp had 3 (including `main.js`), the scraper 25 | §10 rewritten with the real counts and an honest reason |
| F7 | `--dry-run` did not print the per-file hash prefixes that three documents promised — and "check you are ingesting the right bytes" is the entire point of that line | `describe_source()` now prints them; the runbook shows the real output |
| F8 | `DATA_REFRESH.md` claimed both contract tests name both hashes on a mismatch; the timetable one named only the source | the timetable test now reports the database's active version too |

### Minor

F9 (receipt shown wrapped, is one line), F10 (`max_page_bytes` pinned as an expected value
when it is dataset-dependent), F11 (benign `WARNING:` lines undocumented, so an operator could
read one as failure), F12/F13 (naming and a missing consumer in the credential table), F14
(the cache table conflated versioned and legacy `limit_exceeded` policies) — all applied.

### Cold-operator gaps, applied

The runbook gained a **Before you start** section it was missing entirely: which repository
each step runs in, both repo paths, the required toolchain (Python, `psycopg`, Edge +
WebDriver, Node, and the `node_modules` caveat given that `npm` is policy-blocked), network
and data-directory prerequisites, and a per-repo environment table. Steps 1–6 now state their
working directory, their expected output, and what to do on failure — including a copy-pasteable
check that `failed_groups` is 0 before ingesting.

### One thing left as-is

Spec §11 requires the fallback notice to state the file's **age**; the notice states its
**date**. The docs describe the code accurately, so this is a Task 7 wording question rather
than a Task 10 defect — recorded here so it is a decision rather than an oversight.

After the fixes: webapp 98 tests pass and both contract gates are green; scraper 172 tests
pass and `py_compile` is clean.
