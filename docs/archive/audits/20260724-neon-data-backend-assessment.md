# 20260724 — Assessment: Move data to a Neon database (decouple data from deploy)

Author: session 2026-07-24 (`dev`)
Status: **Assessment accepted** — schema design to follow in a separate spec.
Scope: architectural assessment + recommendation only. No schema, no code decided here.

---

## 1. The concern (owner's words)

> Raw data is scraped by the related repo `scrape_taltech_tunniplaan` and has to be
> uploaded to Netlify with each new scraping, which triggers a new deployment. Is it
> possible to store the data in a third-party database such as Neon, have the Netlify
> web app read from Neon to populate cards and answer user queries — so the scraper
> auto-scrapes → ingests into Neon → the web app always shows a fresh dataset?

Short answer: **yes, and it directly fixes the pain point plus a live production bug.**

---

## 2. How data flows today

Two different patterns, both coupled to deployment:

1. **`unified_courses.json` (~5 MB)** — shipped as a static asset. Every visitor's
   browser downloads the *whole* file at startup (`index.html`), then all filtering /
   search happens client-side in `main.js`. Good UX (instant, no round-trips), but the
   file only updates when the site is redeployed.
2. **`sessions.json` (~26 MB)** — *bundled inside* the Netlify function. Every calendar
   request reads the entire file from disk, `JSON.parse`s it, and filters in memory
   (`netlify/functions/getTimetable.js:20-34`).

Update loop today: scrape → `publish_to_webapp.py` copies both JSON into this repo →
commit via Git LFS → push → **full Netlify redeploy** before new data is live.

### Current dataset shape (verified 2026-07-24)

- `unified_courses.json`: top-level `semester`, `courses` (161), `groupToFacultyMap`
  (427 group→faculty entries), `scraping_datetime`. Data is **semester-scoped**
  (`26s`, autumn 2026), not the ~1000 courses CLAUDE.md still claims.
- `sessions.json`: flat array of 5,692 session events. Fields: `course_id`, nullable
  `date`/`start`/`end` (online sessions carry nulls), `type`, embedded `instructor`
  `{name,title}`, `room`, `weeks` range string (e.g. `"1-16"`), `comment`, `groups[]`
  (`{group, ainekv}`), `is_veebiope`.

---

## 3. Why this is the right fix (not just a nice-to-have)

Both problems share one root cause: **data is bundled with code.** That forces a
redeploy to update data *and* forces whole-file loads, because a bundled file has no
query interface.

- **The production 502 dissolves.** The last handoff flagged a 502 at 280+ selected
  courses: the filtered response exceeds Lambda's ~6 MB payload cap, and the function
  also parses 26 MB on every invocation. A `SELECT ... WHERE course_id = ANY($1)`
  against an indexed table is bounded and cheap — this bug is a symptom of the bundling,
  not a separate defect.
- **Scrapes stop triggering deploys.** Data updates become row upserts; the site is
  fresh immediately, with no build.
- **Git LFS churn goes away.** ~31 MB no longer rewritten in history every scrape.

## 4. Why Neon specifically

Neon is Postgres, but its **serverless HTTP/WebSocket driver**
(`@neondatabase/serverless`) is what makes it fit Netlify functions. Classic Postgres
uses long-lived TCP connections, which serverless exhausts (every cold Lambda opens a
new one). Neon's driver issues each query as a stateless HTTP call — a natural match for
Netlify's Lambda model. It also scales to zero (cheap for a student tool) at the cost of
a small cold-start on the first query after idle.

## 5. Target architecture

```
scrape_taltech_tunniplaan  (scheduled)
        │  upsert (read-write role)
        ▼
   Neon Postgres  —  courses + sessions (+ supporting tables)
        ▲
        │  SQL, only what's needed (read-only role)
   Netlify Functions
        ▼
   Browser SPA (index.html / main.js)
```

| Concern | Today | With Neon |
|---|---|---|
| New scrape | commit + push + full redeploy | scraper upserts rows; **no deploy** |
| Data freshness | after build finishes | immediately live |
| Calendar 502 | 26 MB parse, 6 MB cap hit | indexed query, bounded result |
| Course cards | 5 MB download every visit | query endpoint (can page/filter server-side) |
| Git LFS | 31 MB churn each scrape | removed (optionally keep JSON export as backup) |

## 6. Things to design deliberately (open questions for the schema spec)

1. **Don't reflexively move `unified_courses.json` server-side.** Card-view filtering is
   fully client-side today and feels instant. Simplest first step: one endpoint returns
   the whole course set once, client-side filtering unchanged. Only `sessions.json`
   *must* become genuinely queryable — that's the broken path.
2. **Caching / cost.** Neon free tier has a monthly compute budget and suspends when
   idle. Function responses are highly cacheable (data changes only on scrape) — add
   HTTP cache headers / edge cache to avoid hitting Neon per request.
3. **Two roles.** Scraper = read-write; functions = read-only. Both connection strings
   live in env vars, never committed (also closes the credential-hygiene gap from the
   audit docs).
4. **Idempotent ingest.** Upsert (`INSERT ... ON CONFLICT DO UPDATE`) on stable keys,
   inside a transaction, so a failed mid-scrape never leaves a half dataset live. Keep a
   version / `scraping_datetime` column for freshness display.
5. **Semester scoping.** Data is per-semester. Decide whether the DB holds one active
   semester or accumulates history — this shapes every table's key.
6. **Two-repo contract change.** The JSON schema is a coordinated contract between the
   scraper repo and this one (`docs/data-contract.md`). Moving to Neon turns that
   contract into a database schema; `publish_to_webapp.py` becomes an ingest script.

## 7. Recommended phasing

- **Phase 1 — highest value, lowest risk:** migrate only `sessions.json` → a Neon table;
  rewrite `getTimetable.js` to `SELECT` by course ID. Kills the 502, removes the 26 MB
  LFS churn, frontend essentially untouched (same endpoint, same response shape).
- **Phase 2:** move `unified_courses.json` → a `courses` table behind a `getCourses`
  endpoint; keep client-side filtering initially. Now scrapes never trigger a deploy.
- **Phase 3 (optional):** push heavy filtering/search into SQL if the client download
  ever grows too large.

Netlify stays as static host + functions; the scraper keeps its scheduling. Only the
*transport* of data changes: from "commit to git" to "write to DB."

## 8. Honest trade-off

This swaps a zero-moving-parts static setup (works offline, no runtime dependency) for a
system with a live external dependency: if Neon is down or cold-suspended, first render
can stall or fail. For this use case — given the deploy pain and the 502 — the trade is
clearly worth it, but it is a real trade and should be named.

---

## 9. Next step

Brainstorm the database schema (semester scoping, table boundaries, keys, how
`group_sessions` and the `groups[]` many-to-many are modelled), then write it up as a
design spec before any implementation. Tracked separately from this assessment.
