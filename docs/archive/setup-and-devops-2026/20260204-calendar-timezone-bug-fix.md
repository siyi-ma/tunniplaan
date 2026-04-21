# 20260204 - Calendar Timezone Bug Fix

## Session Overview
**Date:** 2026-02-04
**Main Issue:** Calendar view displaying sessions on incorrect days (one day earlier than scheduled)
**Affected Component:** Calendar view in main.js
**Status:** Resolved - fix implemented and tested locally, ready for deployment

## Problem Description

### Initial Report
User reported that for group TVTB22, courses TES0020 and TMJ0230 were scheduled for Monday (02.02.2026) but displayed on Sunday in the calendar view.

### Root Cause Analysis
The calendar view was using `.toISOString().split('T')[0]` to convert Date objects to ISO date strings (YYYY-MM-DD format). This method converts dates to UTC timezone.

Since Estonia is UTC+2 (EET) or UTC+3 (EEST), dates created at local midnight (00:00:00) were shifted to the previous day when converted to UTC:
- Local: February 2, 2026 00:00:00 EET (Monday)
- UTC: February 1, 2026 22:00:00 (Sunday)
- Result: Sessions appeared one day earlier in calendar

### Affected Code Locations
1. `main.js:762` - Session date conversion in `getSessionData()`
2. `main.js:838` - Calendar week date generation in `renderWeeklyView()`
3. `main.js:974` - Calendar grid day date mapping in `renderWeeklyView()`

## Solution Implementation

### New Helper Function
Added timezone-safe date conversion function at `main.js:151`:

```javascript
const toLocalISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
```

This function creates ISO date strings using local date components instead of converting to UTC.

### Code Changes

**Before (main.js:762):**
```javascript
const dateKey = sessionDate.toISOString().split('T')[0];
```

**After (main.js:762):**
```javascript
const dateKey = toLocalISODate(sessionDate);
```

**Before (main.js:838):**
```javascript
weekDates.push(d.toISOString().split('T')[0]);
```

**After (main.js:838):**
```javascript
weekDates.push(toLocalISODate(d));
```

**Before (main.js:974):**
```javascript
const dateKey = dayDate.toISOString().split('T')[0];
```

**After (main.js:974):**
```javascript
const dateKey = toLocalISODate(dayDate);
```

## Secondary Issue: Local Development Environment

### Problem
After implementing the fix, user encountered error when testing calendar view on localhost:
```
Valitud ainete hulk on liiga suur, et kalendri andmeid laadida.
Palun kitsenda valikut ja proovi uuesti.
```
(Translation: "The number of selected courses is too large to load calendar data. Please narrow your selection and try again.")

### Root Cause
The error occurred because the calendar view requires the Netlify serverless function at `/.netlify/functions/getTimetable`, which filters session data. This function is not available when using Python's simple HTTP server (`python -m http.server 8000`).

### Solution
User needs to run Netlify Dev instead of Python HTTP server for calendar view testing:

```bash
# Install Netlify CLI globally (if not already installed)
npm install -g netlify-cli

# Run local development server with serverless functions
netlify dev
```

This provides access to serverless functions locally (typically at `http://localhost:8888`).

## Deployment Process

### Pre-deployment Steps
1. Commit changes to git:
```bash
git add main.js
git commit -m "Fix timezone bug in calendar view - sessions now display on correct days"
git push origin main
```

### Deployment Methods

**Option 1: VS Code Task**
1. Press `Ctrl+Shift+P`
2. Type "Tasks: Run Task"
3. Select "Netlify: Deploy Main Branch"

**Option 2: Command Line**
```bash
curl -X POST -d {} https://api.netlify.com/build_hooks/[MASKED]
```

### Verification
After triggering deployment:
1. Check terminal output for JSON response confirming build triggered
2. Use VS Code task "Netlify: View Latest Deploy" to check status
3. Build takes 1-3 minutes; status should change to "Published"
4. Verify fix on live site by checking TVTB22 calendar view

## Key Takeaways

### For Future Developers
1. **Timezone Awareness:** Always use local date methods when comparing dates that should remain in local timezone. Avoid `.toISOString()` unless UTC conversion is explicitly needed.

2. **Date Comparison Best Practice:** When creating date keys for comparison, ensure both sides use the same timezone (either both local or both UTC).

3. **Local Testing Requirements:** Calendar view requires Netlify Dev (`netlify dev`) for local testing due to serverless function dependency. Simple HTTP servers cannot serve the `/.netlify/functions/getTimetable` endpoint.

4. **Error Message Context:** The "too many courses" error message can be misleading - it appears in the catch block for any fetch error, not just session limit issues.

### Related Files
- `main.js` - Main application logic (modified)
- `sessions.json` - Session data (not modified, tracked with Git LFS)
- `.vscode/tasks.json` - VS Code tasks for development and deployment
- `netlify/functions/getTimetable.js` - Serverless function for session filtering

## Testing Results
User confirmed the fix works correctly after switching to Netlify Dev. Sessions now display on their scheduled days without timezone offset.

## Status: RESOLVED
The timezone bug has been fixed and tested locally. Changes are ready for production deployment pending user's git commit and build trigger.
