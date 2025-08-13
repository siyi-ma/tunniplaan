# 20250812-Faculty Filter Deduplication Debugging

## Main Theme
Faculty dropdown deduplication and dependency filtering logic in timetable webapp. Focus: harmonizing faculty codes/names from multiple sources, fixing dropdown duplication, and restoring correct dependent filtering for institutes and groups (rühm).

## Errors Encountered
- Faculty dropdown showed duplicate names (upper/lower/title case) due to inconsistent codes/names from course data and mapping file.
- Dependent filters (institute, rühm) used different logic and sources, causing mismatched filtering and inconsistent UI behavior.
- Quick fixes failed to address root cause; deduplication by name or code alone did not resolve duplication.
- Attempts to harmonize code usage did not fully resolve the issue due to underlying data inconsistencies.

## Solutions Attempted
- Normalized faculty names to title case and codes to uppercase for dropdown and filtering.
- Patched dropdown to use code for value and name for display, deduplicating by code.
- Updated dependent filter logic to use normalized code for lookups in both institute and group filters.
- Harmonized code usage between course data and mapping file for all dropdowns and filters.
- Strictly deduplicated dropdown by normalized code, preferring course data name, falling back to mapping file.

## Code Snippets
**Dropdown Deduplication Logic (final attempt):**
```javascript
function toTitleCase(str) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
// Build a map of normalized faculty code to display name
const facultyMap = new Map();
// Prefer course data name, fallback to mapping file
if (window.tpg2teaduskondData) {
    window.tpg2teaduskondData.forEach(obj => {
        if (obj.teaduskond) {
            const normCode = obj.teaduskond.replace(/\s+/g, '').toUpperCase();
            if (!facultyMap.has(normCode)) {
                facultyMap.set(normCode, toTitleCase(obj.teaduskond));
            }
        }
    });
}
allSchoolNames.forEach((names, code) => {
    if (names[currentLanguage] || names['et']) {
        const normCode = code.replace(/\s+/g, '').toUpperCase();
        facultyMap.set(normCode, toTitleCase(names[currentLanguage] || names['et']));
    }
});
const schools = Array.from(facultyMap.entries()).map(([code, name]) => ({ code, name }));
schools.sort((a, b) => a.name.localeCompare(b.name));
```
**Harmonized Dependent Filter Logic:**
```javascript
const schoolCode = schoolFilterDOM.value;
instituteFilterDOM.disabled = !schoolCode;
let institutes = new Set();
let relevantGroups = [];
if (schoolCode) {
    // Harmonize: always use normalized code for both lookups
    (schoolToInstitutes.get(schoolCode) || []).forEach(inst => institutes.add(inst));
    if (window.tpg2teaduskondData) {
        window.tpg2teaduskondData.forEach(obj => {
            const normCode = obj.teaduskond.replace(/\s+/g, '').toUpperCase();
            if (normCode === schoolCode && obj.instituut) {
                institutes.add(obj.instituut);
            }
        });
    }
    relevantGroups = [...(facultyToGroupsMap.get(schoolCode) || [])].sort();
} else {
    relevantGroups = allUniqueGroups;
}
```

## Command Line Actions
None required; all changes were made via code patches in `main.js`.

## Factual Process Summary
- Session began with user reporting duplicate faculty names and broken dependent filtering in the dropdown UI.
- Multiple attempts were made to normalize, deduplicate, and harmonize faculty codes/names from course data and mapping file.
- Filtering logic for dependent dropdowns (institute, rühm) was updated to use normalized codes for lookups.
- Despite several patches, duplication persisted due to underlying data inconsistencies and mismatched logic between sources.
- User requested a break and suggested a deeper review of the original working logic rather than further quick fixes.
- End-of-session summary generated as per communication guidelines.

## Status
Problem not fully resolved. Further review of original logic and data sources recommended before next iteration.
