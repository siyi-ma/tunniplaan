import json

# Load all_daily_timetable.json from root directory
with open('../all_daily_timetable.json', 'r', encoding='utf-8') as f:
    courses = json.load(f)

# Step 1: Check input file schema
def check_schema(courses):
    if not isinstance(courses, list):
        print('Input file is not a list of courses.')
        return False
    if not courses:
        print('Input file is empty.')
        return False
    sample = courses[0]
    return True

if not check_schema(courses):
    exit(1)

course_to_instructors = {}

for course in courses:
    course_id = course.get('ainekood')  # Use 'ainekood' for course code
    oppejoud_raw = course.get('oppejoud', '')
    if isinstance(oppejoud_raw, str) and oppejoud_raw:
        instructors = [i.strip() for i in oppejoud_raw.split('|') if i.strip()]
    else:
        instructors = []
    if course_id:
        course_to_instructors[course_id] = instructors

# Save to course_to_instructors_map_new.json
with open('../course_to_instructors_map_new.json', 'w', encoding='utf-8') as f:
    json.dump(course_to_instructors, f, ensure_ascii=False, indent=2)
