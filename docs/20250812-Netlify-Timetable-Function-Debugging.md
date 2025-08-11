# 20250812-Netlify Timetable Function Deployment and Debugging

## Main Theme
Restoring and debugging a Netlify serverless function for a calendar/timetable web app, focusing on backend access to a large JSON data file (`all_daily_timetable.json`).

## Errors Encountered
- **500 Internal Server Error** from Netlify function due to missing timetable file at runtime.
- **ENOENT: no such file or directory** error in Netlify logs when attempting to access `all_daily_timetable.json`.

## Solutions Implemented
- Added debug logging to `getTimetable.js` to verify file path and existence.
- Created and configured `netlify.toml` to include `all_daily_timetable.json` in deployment:
  ```toml
  [functions]
  included_files = ["all_daily_timetable.json"]
  ```
- Redeployed site after configuration change; backend function successfully accessed the timetable file.

## Key Code Snippets
### getTimetable.js (Netlify Function)
```javascript
const fs = require('fs').promises;
const path = require('path');

exports.handler = async (event) => {
  const requestedCoursesQuery = event.queryStringParameters.courses;
  if (!requestedCoursesQuery) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    };
  }
  const requestedCourses = new Set(requestedCoursesQuery.split(','));
  try {
    const dataPath = path.resolve(process.cwd(), 'all_daily_timetable.json');
    console.log('Resolved timetable path:', dataPath);
    try {
      await fs.access(dataPath);
      console.log('Timetable file exists!');
    } catch (err) {
      console.error('Timetable file does NOT exist:', err);
    }
    const timetableData = await fs.readFile(dataPath, 'utf-8');
    const allEvents = JSON.parse(timetableData);
    const filteredEvents = allEvents.filter(event => requestedCourses.has(event.ainekood));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filteredEvents),
    };
  } catch (error) {
    console.error('Error reading or filtering timetable data:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Error processing timetable data.' }) };
  }
};
```

### netlify.toml
```toml
[functions]
included_files = ["all_daily_timetable.json"]
```

## Command Line Actions
- No direct shell commands were required; deployment and configuration were handled via Netlify platform and file edits.

## Factual Process Summary
- Session began with troubleshooting a backend 500 error in a Netlify function.
- Debug logging was added to verify file path and existence.
- Netlify logs revealed the JSON file was missing at runtime.
- Solution: Created `netlify.toml` with `included_files` to ensure the JSON file is packaged with the deployment.
- After redeployment, the backend function successfully accessed and served timetable data.
- No sensitive data was exposed or referenced.
- Problem is resolved; calendar/timetable functionality restored.
