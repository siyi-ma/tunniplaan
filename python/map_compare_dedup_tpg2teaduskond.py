import json
from pathlib import Path

# Step 1: Extract mapping from all_daily_timetable.json
all_daily_path = Path(__file__).parent.parent / 'all_daily_timetable.json'
tpg2teaduskond_path = Path(__file__).parent.parent / 'tpg2teaduskond_map.json'

with open(all_daily_path, 'r', encoding='utf-8') as f:
    timetable = json.load(f)

mapping = []
for group in timetable:
    tpg = group.get('tpg')
    teaduskond = group.get('teaduskond')
    if tpg and teaduskond:
        mapping.append({'tpg': tpg, 'teaduskond': teaduskond})

# Step 2: Deduplicate mapping
unique = []
seen = set()
for entry in mapping:
    key = (entry.get('tpg'), entry.get('teaduskond'))
    if key not in seen:
        unique.append(entry)
        seen.add(key)

# Step 3: Save deduplicated mapping
with open(tpg2teaduskond_path, 'w', encoding='utf-8') as f:
    json.dump(unique, f, ensure_ascii=False, indent=2)

# Step 4: Compare with existing tpg2teaduskond_map.json (after deduplication)
with open(tpg2teaduskond_path, 'r', encoding='utf-8') as f:
    generated = json.load(f)

# Check schema: each entry should have 'tpg' and 'teaduskond'
def check_schema(entries):
    for entry in entries:
        if not (isinstance(entry, dict) and 'tpg' in entry and 'teaduskond' in entry):
            return False
    return True

schema_generated = check_schema(generated)

# Compare entries
set_generated = set((e['tpg'], e['teaduskond']) for e in generated if 'tpg' in e and 'teaduskond' in e)
set_mapping = set((e['tpg'], e['teaduskond']) for e in mapping if 'tpg' in e and 'teaduskond' in e)

only_in_generated = set_generated - set_mapping
only_in_mapping = set_mapping - set_generated

print('Schema valid in generated:', schema_generated)
print('Entries only in generated:', only_in_generated)
print('Entries only in mapping:', only_in_mapping)
