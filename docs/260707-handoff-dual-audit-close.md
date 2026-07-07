# Handoff: Dual audit close (2026-07-07)

# Current Task Objectives

- ✓ Produce fable5 repo audit: `docs/260707-fable5-audit-report.md` + `docs/260707-fable5-audit-improvement-plan.md`
- ✓ Review codex audit docs (`docs/260707-codex5-audit-report.md`, `docs/260707-codex5-audit-improvement-plan.md`) and answer its four open reviewer questions
- ✓ Fix GA loader ID in `index.html` (line 5: `G-4Z7G03F5WN` → `G-S3SQ4PZ2JF`)
- ✓ Establish Netlify function latency baseline and bracket the production 502 threshold
- ✓ Strip build-hook URLs from `CLAUDE.md` before commit (partial H5)
- x Execute the improvement plan (M1–M5, H1, H3–H7, L1–L3) — NOT started, awaiting user go-ahead
- x Rotate build hook `6980b6f3e6f1a66c892e33ab` — USER-ONLY action in Netlify UI, still outstanding

# Current Progress

Completed this session (2026-07-07):

- Two fable5 audit docs written and refined; finding #14 (production 502) and plan item H7 (server-side session limit) added after live probing.
- Codex's four open questions answered; codex report's own "open questions" section already records the resolutions.
- `index.html` GA fix applied (uncommitted until this close).
- `CLAUDE.md` rewrite verified: real delta is 3 insertions / 2 deletions (scraper provenance + data-contract reference); the 437-line raw diff is CRLF/LF churn. Hook URLs removed at close.
- Deletion of `docs/20250813-Gemini-Refactoring...` verified intentional: archive copy at `docs/archive/early-sessions-2025/20250813-Gemini-Refactoring-Course-Timetable-Data-Integrity-UX.md` is byte-identical modulo line endings.

Known working: site live at `taltech-tunniplaan.netlify.app`; calendar works for selections ≤ ~250 courses.

# Key Context

| Layer | Tech |
|---|---|
| Frontend | Vanilla JS SPA: `index.html`, `main.js` (~1700 lines), `main.css` |
| Backend | `netlify/functions/getTimetable.js` — filters `sessions.json` (26.2 MB) per request |
| Data | `unified_courses.json` (860 courses), `sessions.json` (44,332 rows), both Git LFS |
| Data source | External scraper repo `C:\Projects\scrape_taltech_tunniplaan` ([siyi-ma/tunniplaanScraping](https://github.com/siyi-ma/tunniplaanScraping)); contract in its `docs/data-contract.md`; published via `publish_to_webapp.py` |
| Deploy | Netlify; branch `dev` = dev deploy, `main` = production |

Gotchas:

- `npm run dev` / Python static server CANNOT test calendar view — use `npm run dev:netlify` or `npm start`.
- `.gitattributes` routes ALL `*.json` through LFS, including `package.json` (plan item M-level fix).
- `npm test` is a failing placeholder.
- Repo is public but the user plans to make it private; build hooks in git history are burned either way.

# Key Findings

1. **Production 502 threshold measured**: ≤250 courses (4.38 MB raw body) → HTTP 200; ≥280 courses (5.46 MB) → HTTP 502. Cause: AWS Lambda ~6 MB response cap (effective ~5 MB with envelope). Recorded as fable5 report finding #14.
2. **Latency baseline**: local handler 110–184 ms for 5→860 courses (parse of sessions.json dominates); live warm 1.5–2.1 s, cold ~3.3 s; CDN gzip ~50:1. Acceptable for a spinner-backed action — no caching justified.
3. **Client guard is post-download**: `CALENDAR_SESSION_LIMIT = 4000` checked in `toggleCalendarView` (main.js ~905) AFTER `await response.json()` — never protects the function or the wire. Fix spec'd as plan item H7: function returns `{"tooManySessions": true, "count": <n>, "limit": 4000}` when filtered count > 4000.
4. **Codex made no code changes** — its footprint is the two audit docs only.
5. Both audit plans overlap (tests, LFS narrowing, docs drift, debug logging); the fable5 plan is newer and incorporates the measured 502 — treat it as authoritative where they diverge (codex item 10 "measure latency" is already done).
6. GA property confirmed `G-S3SQ4PZ2JF`; `index.html:5` fixed.

# Incomplete Items

1. **User: rotate build hook** `6980b6f3e6f1a66c892e33ab` in Netlify UI (dev hook `6980b7cb...` found dead). Highest priority; agent cannot do this.
2. **Execute fable5 improvement plan** `docs/260707-fable5-audit-improvement-plan.md` in its stated execution order (M-items first; H7 slotted at position 6). Not started.
3. `.vscode/tasks.json` still contains hook URLs (covered by plan item H5 when executed).
4. User: make GitHub repo private (planned).

# Suggested Handoff Path

1. Read `docs/260707-fable5-audit-improvement-plan.md` — it is the execution spec, written for a downstream agent, with per-item closed loops and verify steps.
2. Cross-check `docs/260707-codex5-audit-improvement-plan.md` for overlap before executing any item — do not do the same work twice.
3. Follow the fable5 plan's execution order; each item states its own verification.
4. Calendar-affecting items: verify with `npm run dev:netlify` or `npm start`, never a static server.

# Risks and Notes

- **Never push to `main`**: merging dev→main and production deploys are user decisions.
- **`main.js` is high-coupling**: card view, calendar, URL state, CSV export share logic; small edits ripple (see `docs/260421-handoff-group-timetable-builder.md`).
- **Data files are LFS**: do not commit regenerated JSON casually; the broad `*.json` LFS rule catches everything until the plan narrows it.
- **Scraper contract is external**: field names consumed by `main.js`/`getTimetable.js` must match the scraper repo's `docs/data-contract.md`; do not guess schema changes.
- **Line-ending churn**: CRLF/LF noise can make small edits look like full rewrites; use `git diff --ignore-all-space` before judging a diff.

# Suggested First Step for the Next Agent

```bash
git log --oneline -3   # confirm this session's commit landed
```

Then open `docs/260707-fable5-audit-improvement-plan.md` and start with item M1, following its closed loop exactly.
