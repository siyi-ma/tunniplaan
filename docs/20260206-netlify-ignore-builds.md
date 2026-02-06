# 20260206-Netlify Ignore Builds

## Main Theme
Configuring Netlify to ignore builds for trivial changes (documentation, etc.) and ensure builds for data/code updates.

## Solutions Applied
- **Created `netlify.toml`**: Added a `[build]` configuration with an `ignore` command.
- **Git Diff Logic**: Implemented a `git diff` check that monitors specific critical files:
  - `index.html`, `main.js`, `main.css` (Frontend)
  - `netlify/` (Backend functions)
  - `sessions.json`, `unified_courses.json` (Data)
  - `package.json` (Dependencies)
- **Function Configuration**: Re-added `included_files = ["sessions.json"]` to `netlify.toml` to ensure the serverless function has access to the data file (replacing older configuration references).

## Key Code Snippets

**netlify.toml:**
```toml
[build]
  ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- index.html main.js main.css netlify/ sessions.json unified_courses.json package.json"

[functions]
  included_files = ["sessions.json"]
```

## Factual Process Summary
- User requested a way to skip Netlify builds for trivial git commits while ensuring data updates trigger builds.
- Created `netlify.toml` in the project root.
- Configured the `ignore` command to return exit code 0 (cancel build) unless changes are detected in source code or JSON data files.
- Verified file paths against `README.md` project structure.

---
No sensitive data was exposed.