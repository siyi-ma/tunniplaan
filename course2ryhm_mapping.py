import json
import os
from collections import defaultdict

# --- Configuration ---
# The name of your large, raw timetable data file.
INPUT_FILE = 'all_daily_timetable.json'
# The name of the small, efficient map file we want to create.
OUTPUT_FILE = 'course_to_groups_map.json'

def create_course_to_groups_map():
    """
    Reads the full timetable data and generates a smaller JSON file that maps
    each course ID to a list of unique group codes associated with it.
    """
    print(f"Starting to process '{INPUT_FILE}'...")

    # Check if the input file exists before proceeding.
    if not os.path.exists(INPUT_FILE):
        print(f"\nERROR: Input file not found: '{INPUT_FILE}'")
        print("Please make sure this script is in the same directory as your data file.")
        return

    # Use defaultdict(set) to automatically handle new courses and ensure group uniqueness.
    # The structure will be: {'course_id_1': {'group_A', 'group_B'}, ...}
    course_to_groups = defaultdict(set)

    try:
        # Open and load the large JSON file.
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            timetable_data = json.load(f)
        
        print(f"Successfully loaded {len(timetable_data)} timetable entries. Analyzing relationships...")

        # Iterate through every session entry in the timetable data.
        for session in timetable_data:
            course_id = session.get('ainekood')
            groups_list = session.get('ryhmad')

            # We only care about entries that have both a course ID and a list of groups.
            if not course_id or not isinstance(groups_list, list):
                continue

            # For each group dictionary in the list...
            for group_info in groups_list:
                # The group code is inside a dictionary with the key 'group'.
                group_code = group_info.get('group')

                # If a valid group code exists, add it to the set for the current course.
                # Using a set automatically handles duplicates.
                if group_code:
                    course_to_groups[course_id].add(group_code.strip())

    except json.JSONDecodeError:
        print(f"\nERROR: Could not parse '{INPUT_FILE}'. It might not be a valid JSON file.")
        return
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
        return

    print("Analysis complete. Converting data for final JSON output...")

    # Convert the sets to sorted lists for clean, consistent JSON output.
    final_map = {
        course_id: sorted(list(groups))
        for course_id, groups in course_to_groups.items()
    }

    # Write the final dictionary to the output file.
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            # indent=2 makes the file human-readable.
            # ensure_ascii=False correctly handles any special characters in course/group codes.
            json.dump(final_map, f, indent=2, ensure_ascii=False)

        print("-" * 40)
        print("🎉 Success! 🎉")
        print(f"Mapped {len(final_map)} courses to their associated groups.")
        print(f"Output file created: '{OUTPUT_FILE}'")
        print("-" * 40)
        
    except Exception as e:
        print(f"\nERROR: Could not write to output file '{OUTPUT_FILE}'. Reason: {e}")


if __name__ == "__main__":
    create_course_to_groups_map()