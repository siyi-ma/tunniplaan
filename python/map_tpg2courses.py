import json
from collections import defaultdict

# Load all_daily_timetable.json
with open('../all_daily_timetable.json', 'r', encoding='utf-8') as f:
    timetable = json.load(f)

# Build mapping: tpg -> list of ainekood
map_tpg2courses = defaultdict(list)
for entry in timetable:
    print('Entry:', entry)  # Debugging output
    tpg = entry.get('tpg')
    ainekood = entry.get('ainekood')
    if tpg and ainekood:
        print(f'Adding: tpg={tpg}, ainekood={ainekood}')
        map_tpg2courses[tpg].append(ainekood)
    else:
        print(f'Skipped: tpg={tpg}, ainekood={ainekood}')

# Save to map_tpg2courses.json
with open('../map_tpg2courses.json', 'w', encoding='utf-8') as f:
    json.dump(map_tpg2courses, f, ensure_ascii=False, indent=2)
