# Refreshing the timetable data

**A routine refresh does not deploy anything.** No `git add`, no `git commit`, no `git push`,
no Netlify build hook. You scrape, you ingest, you verify, you look at the site.

The canonical operator runbook lives in the scraper repository, because that is where the
commands run:

> **`C:\Projects\tunniplaanScraping\docs\neon-refresh-runbook.md`**

This page is the webapp-side summary: what changes, what to check here, and how to recover.

---

## What a refresh actually changes

| | Before | After |
|---|---|---|
| Runtime data | four Neon tables | four Neon tables, replaced in one transaction |
| Deployed code | unchanged | unchanged |
| `dataset_version` | old SHA-256 | new SHA-256 |
| What users see | old data until the tab reloads | new data on the next page load |

Open tabs keep their old dataset until the person reloads. That is deliberate: the endpoints
answer `409 version_changed` for the old version, and the page offers a reload rather than
taking one. Somebody halfway through assembling a timetable does not lose it because a scrape
landed.

## There is no exception: a refresh never touches this repository

There used to be one. `unified_courses.json` was committed here as a rollback artifact and
the scraper's publish step copied it in after every scrape, which made that one part of a
refresh a deploy.

Both are gone as of 2026-09-04. The file is no longer committed or deployed,
`STATIC_FALLBACK_ENABLED` in `main.js` is `false`, and the scraper's
`publish_to_webapp.py` has been deleted.

The reason is not that the observation window closed on schedule. Every data endpoint now
sits behind a human-verification gate, and a committed copy of the dataset is a public URL on
the deployed site that serves the whole thing to exactly the callers the gate refuses. The
recovery artifact was the documented way around the protection it sat next to.

**Do not reinstate it.** If a rollback copy is ever genuinely needed it is in Git history:
`git show e28c72b:unified_courses.json`.

## Verifying from this repository

After an ingest, with `NEON_DATABASE_URL` (the read-only `webapp_ro` string) set and
`TUNNIPLAAN_DATA_DIR` pointing at the scraper's data directory:

```bash
node scripts/contract-test-getcourses.js
# COURSE CONTRACT OK version=<sha> courses=1030 groups=430 pages=6 max_page_bytes=1101147

node scripts/contract-test-gettimetable.js
# CONTRACT OK: all responses deep-equal        (66846 events)
```

Both reassemble the API's output and compare it against the source artifacts on disk. Both
refuse to run against a directory that does not hold the dataset the database contains — the
error names both hashes.

Then look at the site: the sync line top-right must show the new scrape timestamp.

## Recovery

**The data is wrong or the ingest went sideways.** Re-ingest the previous artifacts. The
ingest is one transaction, so a failure leaves the previous dataset completely intact — there
is no half-applied state to clean up.

**The API is down.** The page shows a load error. There is no static fallback any more — see
"There is no exception" above for why the committed artifact was removed rather than kept.

An outage is therefore visible instead of being answered with an undated, weeks-old dataset.
That is the intended trade: the fallback only ever helped with genuine unavailability, and it
already refused to trigger on a consistency failure, so what it bought was narrow and what it
cost was an ungated copy of everything.

Note that a `403` mid-session is **not** treated as unavailability. The frontend clears its
verification marker and reloads once into the gate.

## Credentials

Referred to by environment-variable name only; values live in `.env` (gitignored) and in the
Netlify environment.

| Variable | Role | Used by |
|---|---|---|
| `NEON_DATABASE_URL` | `webapp_ro` — SELECT only | Netlify functions, both contract tests, the local function server |
| `NEON_SCRAPER_URL` | `scraper_rw` — SELECT/INSERT/UPDATE/DELETE | the scraper's production ingest, nowhere else |
| `NEON_TEST_SCRAPER_URL`, `NEON_TEST_DATABASE_URL` | the same two roles on a disposable branch | integration tests |
| `TUNNIPLAAN_DATA_DIR` | not a credential | resolves the source artifacts on this machine |

`scraper_rw` must never appear in the webapp or in Netlify. `webapp_ro` cannot write —
verified by acting as the role, not just by reading the catalogue.

**Neither role can run DDL.** Schema migrations under `db/migrations/` need the table owner
(`neondb_owner`), applied from the Neon console or with an owner connection string.
`scraper_rw` gets `must be owner of table semesters`.

## Local development

```bash
node scripts/dev-functions-server.js     # http://localhost:8000
```

The only mode that serves the functions, and therefore the only one where the page loads at
all. `npm run dev` is static-only; `npm run dev:netlify` needs `npx`, which is blocked by
group policy on the maintainer's devices.

The server is **not Netlify**: no routing, redirects, payload-limit enforcement, or edge
caching. It proves handler behaviour, not platform behaviour.
