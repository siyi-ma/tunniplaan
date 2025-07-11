import json
import os
from collections import defaultdict

# --- Configuration ---
INPUT_FILE = 'all_daily_timetable.json'
OUTPUT_FILE = 'course_to_instructors_map.json'

def create_course_to_instructors_map():
    """
    Reads the full timetable data and generates a smaller JSON file that maps
    each course ID to a list of unique instructor names associated with it.
    """
    print(f"Starting to process '{INPUT_FILE}' for instructor mapping...")

    if not os.path.exists(INPUT_FILE):
        print(f"\nERROR: Input file not found: '{INPUT_FILE}'")
        return

    course_to_instructors = defaultdict(set)

    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            timetable_data = json.load(f)
        
        print(f"Loaded {len(timetable_data)} entries. Analyzing instructors...")

        for session in timetable_data:
            course_id = session.get('ainekood')
            # Instructors can be a single string, so handle that case.
            instructors = session.get('oppejoud')

            if not course_id or not instructors:
                continue

            # The 'oppejoud' field is a pipe-separated string "Name1|Name2"
            # Split the string by the pipe and add each instructor to the set
            for instructor in instructors.split('|'):
                # .strip() removes any leading/trailing whitespace
                if instructor.strip():
                    course_to_instructors[course_id].add(instructor.strip())

    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
        return

    print("Analysis complete. Converting data for final JSON output...")

    # Convert sets to sorted lists for clean JSON output
    final_map = {
        course_id: sorted(list(names))
        for course_id, names in course_to_instructors.items()
    }

    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(final_map, f, indent=2, ensure_ascii=False)

        print("-" * 40)
        print("🎉 Success! 🎉")
        print(f"Mapped {len(final_map)} courses to their associated instructors.")
        print(f"Output file created: '{OUTPUT_FILE}'")
        print("-" * 40)
        
    except Exception as e:
        print(f"\nERROR: Could not write to output file '{OUTPUT_FILE}'. Reason: {e}")


if __name__ == "__main__":
    create_course_to_instructors_map()