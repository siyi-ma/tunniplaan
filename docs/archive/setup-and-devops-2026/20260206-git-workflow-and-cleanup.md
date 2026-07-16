# 20260206-Git Workflow and Cleanup

## Main Theme
Git repository maintenance, `node_modules` cleanup, and documentation of branching/merging workflows.

## Errors Encountered
- **Massive Merge Output**: User saw thousands of `create mode` lines for `node_modules/` files after merging `dev` into `main`.
- **Git Push Typo**: `fatal: 'orgin' does not appear to be a git repository` due to a typo in the remote name.
- **Tracked Dependencies**: `node_modules` folder was accidentally tracked in Git, bloating the repository.

## Solutions Applied
- **.gitignore Update**: Updated `.gitignore` to explicitly exclude `node_modules/`, `.DS_Store`, `Thumbs.db`, `*.log`, and `.env`.
- **Git Cleanup Advice**: Provided commands to remove `node_modules` from the index without deleting local files:
  ```bash
  git rm -r --cached node_modules
  git commit -m "Stop tracking node_modules"
  ```
- **Workflow Documentation**: Added a "Git Workflow" section to `README.md` with specific commands for branching, pushing, and merging between `dev` and `main`.
- **Education**: Clarified the difference between `git push` (context-sensitive) and `git push origin main` (explicit), and explained the purpose of `node_modules` and `package-lock.json`.

## Key Code Snippets

**Updated .gitignore:**
```gitignore
.vscode/
.claude/
node_modules/
.DS_Store
Thumbs.db
*.log
.env
```

**Dependency Visualization:**
Command to see the dependency tree:
```bash
npm list
```

## Factual Process Summary
- Session began with the user questioning a large output during a git merge.
- Identified that `node_modules` was being tracked and advised on removal.
- Fixed `.gitignore` to prevent future tracking of dependencies and system files.
- Confirmed that `git push` works identically to `git push origin main` when the upstream is set.
- Documented the standard Git workflow (Feature -> Dev -> Main) in the project `README.md`.
- Problem resolved; repository configuration is now cleaner and documentation is updated.

---
No sensitive data was exposed during this session.