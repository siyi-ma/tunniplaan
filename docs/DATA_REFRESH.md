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

## The one exception during the observation window

`unified_courses.json` is still committed here as a rollback artifact, and the scraper's
publish step still copies it in. **That commit is a deploy** — a deliberate transitional cost,
not a regression against the no-deploy goal. The *routine* refresh path is deploy-free from
the first production ingest; keeping the recovery artifact current is a separate, temporary
obligation, because an artifact that has drifted weeks from production is not a recovery
artifact.

It goes away at the end of the observation window, along with `STATIC_FALLBACK_ENABLED` in
`main.js`.

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

**The API is down.** The frontend falls back to the committed `unified_courses.json`
automatically, shows a bilingual banner naming that file's date, and disables calendar view —
there is no dataset version to pin sessions to, so the calendar would be querying today's
sessions against older course metadata.

The fallback is scoped to genuine unavailability: an unreachable manifest, a 5xx, or a dead
network. It deliberately does **not** trigger on a consistency failure, because serving an old
file after a count mismatch would hide a broken ingest behind stale-but-plausible data.

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
