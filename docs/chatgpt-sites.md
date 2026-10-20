# ChatGPT Sites runbook

Second deployment of this app, at `tunniplaan.taltech.chatgpt.site`. Netlify stays the production site: `dev` is the Netlify preview, `main` is Netlify production. Nothing in this runbook deploys either target, and nothing in it writes to Neon.

The Site is static files plus one Worker. The Worker serves `dist/client` through the platform's `ASSETS` binding and answers the same three dataset queries the Netlify functions answer. Queries live in `server/api/`; `netlify/functions/*.js` and `sites/worker/` are adapters.

Access on the Site is ChatGPT workspace sign-in (TalTech Uni-ID). The platform rejects anonymous requests and sends the visitor email in `oai-authenticated-user-email`. The Worker returns 401 when that header is missing. It also refuses addresses outside `ALLOWED_EMAIL_DOMAINS`, which defaults to `taltech.ee`. Set the variable to `*` to allow any signed-in address, or to a comma-separated list to name more domains. The Netlify slider and its cookie are unchanged, and the Sites build hides that overlay.

`.openai/hosting.json` holds the project link only (`project_id`, and `d1` / `r2` left null). Never put a connection string or other secret in it.

## One-time Site setup

1. In the TalTech ChatGPT workspace, create a Site whose slug is `tunniplaan`, so the hosted URL is `tunniplaan.taltech.chatgpt.site`.
2. Restrict sharing to that workspace. Matriculated students and staff already have Uni-ID. Do not leave the Site public.
3. Open the Site's settings and add environment values. Do this in the Sites UI, not in the repo.

   | Name | Value |
   |---|---|
   | `NEON_DATABASE_URL` | The **read-only** `webapp_ro` connection string from [db/roles.sql](../db/roles.sql). The same value Netlify already uses. Never the `scraper_rw` string. |
   | `ALLOWED_EMAIL_DOMAINS` | `taltech.ee` (optional; the Worker defaults to this when the variable is unset) |
   | `CALENDAR_SESSION_LIMIT` | Optional. Defaults to `4000`, matching Netlify. |

4. After the Site exists, put the project id the UI shows into `.openai/hosting.json` as `project_id`. Leave `d1` and `r2` null. Commit that file. It is not a secret.

`HUMAN_VERIFICATION_SECRET` is not used on the Site. Do not copy it across.

## Build

From a checkout of the commit you intend to ship:

```bash
npm ci
npm test
npm run build:sites
```

`build:sites` writes `dist/client/` (the static app, with `<meta name="tunniplaan-target" content="sites">` injected), `dist/server/index.js` (the Worker), and `dist/.openai/hosting.json`. It copies an allow-list of static files and fails if `unified_courses.json` or `sessions.json` appears in `dist/`. Netlify does not publish `dist/`; it still serves the repository root, where that meta tag is absent, so the slider and `/.netlify/functions/*` stay as they are.

## Release

`sites:release` refuses to run when `git status` is dirty, then builds and copies `client/`, `server/` and `.openai/` into the folder you name. It does not deploy.

```bash
npm run sites:release -- --dest /path/to/the/site/source/folder
```

`SITES_RELEASE_DIR` is the same flag as an environment variable. The destination is the folder you save a version from. A previous copy's `client/`, `server/` and `.openai/` are replaced. Other files already in that folder are left alone.

## Deploy

In the Sites UI, save a version from that folder, then deploy the saved version. Deploying is a separate step from saving. Do it only when that version should be what signed-in students see.

Confirm after deploy:

- `https://tunniplaan.taltech.chatgpt.site/` opens without the slider.
- A signed-in `@taltech.ee` account can load the course list and a small group's calendar.
- The Netlify production URL still shows the slider and still loads.

## Rollback

In the Sites UI, deploy the previous saved version. That does not touch Netlify and does not touch Neon. A bad Worker is rolled back there; a bad dataset is an ingest problem and is the same data both targets read.

## What stays manual

Saving a version and deploying it are done by Siyi in the Sites UI. This repository has no token and no script that publishes the Site.
