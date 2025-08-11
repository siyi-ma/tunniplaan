import json
from collections import defaultdict

# Load all_daily_timetable.json
with open('../all_daily_timetable.json', 'r', encoding='utf-8') as f:
    timetable = json.load(f)

# Build mapping: ainekood -> unique list of tpg
course_to_groups = defaultdict(set)
count = 0
for entry in timetable:
    ainekood = entry.get('ainekood')
    tpg = entry.get('tpg')
    if ainekood and tpg:
        course_to_groups[ainekood].add(tpg)
        count += 1

# Convert sets to lists for JSON serialization
course_to_groups = {k: list(v) for k, v in course_to_groups.items()}

print(f'Entries with both ainekood and tpg: {count}')

# Save to course_to_groups_map_test.json
with open('../course_to_groups_map_test.json', 'w', encoding='utf-8') as f:
    json.dump(course_to_groups, f, ensure_ascii=False, indent=2)
