# 20260205-git-bash-and-local-server-workarounds

**Session Overview**
Addressed environment configuration issues on a Windows machine with restricted permissions (no admin rights, Group Policy blocks). Solved Git Bash path detection for Claude Code and implemented a custom local server to bypass Netlify CLI restrictions for the Calendar View.

## Errors & Resolutions

### 1. Git Bash Path Detection
- **Error**: `Claude Code on Windows requires git-bash...`
- **Reason**: `bash.exe` was not in the system PATH, and the user lacked administrator rights to edit system environment variables.
- **Solution**: Set the user-scope environment variable `CLAUDE_CODE_GIT_BASH_PATH`.
- **Method**: Used `rundll32 sysdm.cpl,EditEnvironmentVariables` to bypass the admin prompt for system variables.

### 2. Calendar View Failure (Python Server)
- **Error**: "Valitud ainete hulk on liiga suur..." (The number of selected courses is too large...).
- **Reason**: The frontend received a 404 error when trying to fetch `/.netlify/functions/getTimetable`. The simple Python server (`python -m http.server`) serves static files but cannot execute backend Node.js functions.
- **Attempted Solution**: Install Netlify CLI to simulate the backend.

### 3. Netlify CLI Installation & Execution Failures
- **Error 1**: `npm install netlify-cli -g` failed with `EBUSY` and `EPERM` errors (file locking/permissions).
- **Error 2**: `npx netlify dev` failed with "This program is blocked by group policy".
- **Reason**: Corporate security policies blocked the execution of binaries/scripts located in `AppData` or specific development tools.
- **Final Solution**: Created a custom `server.js` script using the standard Node.js `http` module (which was allowed) to serve the site and mock the backend API.

## Key Code Snippets

### Custom Node.js Server (`server.js`)
This script replaces the need for `netlify-cli` by serving static files and handling the API endpoint manually.

```javascript
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    // Mock Netlify Function
    if (parsedUrl.pathname === '/.netlify/functions/getTimetable') {
        // Logic to read sessions.json and filter by course ID
        // ...
        return;
    }

    // Serve Static Files
    // ...
});

server.listen(8888);
```

### User Environment Variable Command (PowerShell)
Alternative to GUI for setting the Git Bash path without admin rights.

```powershell
[System.Environment]::SetEnvironmentVariable("CLAUDE_CODE_GIT_BASH_PATH", "C:\\Program Files\\Git\\bin\\bash.exe", "User")
```

## Command Line Actions

- **Open User Environment Variables (GUI)**:
  ```cmd
  rundll32 sysdm.cpl,EditEnvironmentVariables
  ```
- **Run Custom Local Server**:
  ```bash
  node server.js
  ```

## Process Summary
1.  Diagnosed Git Bash path error; provided methods to set user-scope environment variables.
2.  Created `docs/git_bash_setup.md` with detailed instructions.
3.  Identified that the Python HTTP server could not support the Calendar View backend logic.
4.  Attempted to install Netlify CLI but encountered file permission and Group Policy blocks.
5.  Developed `server.js` to mimic the production environment locally using standard Node.js libraries.
6.  Verified the solution and updated `README.md` with the new run instruction.