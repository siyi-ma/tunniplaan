import json

# Load the huge timetable file
with open('all_daily_timetable.json', 'r', encoding='utf-8') as f:
    timetable_data = json.load(f)

group_to_faculty = {}

# Create a unique mapping from tpg to teaduskond
for entry in timetable_data:
    if 'tpg' in entry and 'teaduskond' in entry:
        group_to_faculty[entry['tpg']] = entry['teaduskond']

# Convert the dictionary to the desired list format
output_list = [{"tpg": tpg, "teaduskond": teaduskond} for tpg, teaduskond in group_to_faculty.items()]

# Save the new, small JSON file
with open('tpg2teaduskond_map.json', 'w', encoding='utf-8') as f:
    json.dump(output_list, f, ensure_ascii=False, indent=2)

print(f"Successfully created group_to_faculty_map.json with {len(output_list)} entries.")