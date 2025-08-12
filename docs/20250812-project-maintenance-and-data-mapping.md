# 20250812 - Project Maintenance and Data Mapping

## Main Theme
Project maintenance, data mapping, and encoding issues in timetable and mapping files. Focus on cleaning up the workspace, updating group/faculty mappings, and ensuring data consistency.

## Errors Encountered
- Special Estonian characters (e.g., ü, õ) were corrupted in `all_daily_timetable.json` due to PowerShell's default encoding.
- File lock errors when attempting to rewrite large JSON files with UTF-8 encoding.
- Context drift between mapping files and data files (e.g., doctoral studies group/faculty naming).
- Unwanted complexity from Python scripts and virtual environment in the workspace.

## Solutions Applied
- Proposed and executed replacements for doctoral study group/faculty naming in JSON files:
  - Replaced `Doktoriõpe` with `DOKTOR`.
  - Replaced `teaduskond: all` with `teaduskond: Ülikooliülene doktoriõpe`.
- Attempted to fix encoding issues by rewriting JSON files with UTF-8 encoding using PowerShell:
  ```powershell
  Get-Content -Raw 'all_daily_timetable.json' | Set-Content -Encoding UTF8 'all_daily_timetable.json'
  ```
- Advised on restoring files to previous versions using git:
  ```bash
  git checkout HEAD -- all_daily_timetable.json
  ```
- Deleted `.venv` and `python` folders to simplify the workspace:
  ```powershell
  Remove-Item -Recurse -Force .venv; Remove-Item -Recurse -Force python
  ```
- Provided git commands to commit only specific files and ignore large data files:
  ```bash
  git add index.html
  git commit -m "Update index.html only; ignore all_daily_timetable.json"
  echo all_daily_timetable.json >> .gitignore
  git add .gitignore
  git commit -m "Ignore all_daily_timetable.json in future commits"
  ```

## Code Snippets
- PowerShell and Bash commands for file operations and git actions (see above).
- Python script suggestion for future encoding/data fixes (not executed):
  ```python
  with open('all_daily_timetable.json', 'r', encoding='utf-8') as f:
      data = f.read()
  # process and save as needed
  ```

## Factual Process Summary
- Workspace was cleaned up by removing unnecessary Python scripts and virtual environment.
- Data mapping for doctoral studies was standardized across mapping and timetable files.
- Encoding issues were identified and troubleshooting steps were provided, but file locks prevented resolution via PowerShell.
- Git was used to restore and manage file versions, and `.gitignore` was updated to prevent accidental commits of large data files.
- All actions were documented and code/command snippets provided for future reference.

## Status
- Main issues resolved except for encoding fix, which requires file to be unlocked or processed in Python.
- Workspace is now easier to maintain and less prone to accidental data corruption.

---
Sensitive data was not present in this session. All commands and code snippets are safe for sharing.
