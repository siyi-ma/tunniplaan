import json
import re

def transform_course(old_course):
    """
    Transforms a single course object from the old schema to the new schema.
    """
    
    # Mapping of school codes to full names
    school_name_map = {
        'E': 'Inseneriteaduskond',
        'I': 'Infotehnoloogia teaduskond',
        'L': 'Loodusteaduskond',
        'M': 'Majandusteaduskond', 
        'V': 'Eesti Mereakadeemia'
    }

    # --- Basic Key Renaming and Data Extraction ---
    # Use .get() to avoid errors if a key is missing in the old data
    new_course = {
        "oppeaine_register": old_course.get("õppeaine register"),
        "id": old_course.get("õppeaine kood"),
        "name_et": old_course.get("õppeaine nimetus eesti k"),
        "name_en": old_course.get("õppeaine nimetus inglise k"),
        "deklareeritav": old_course.get("deklareeritav"),
        "full_elearning": old_course.get("õppeaine täies mahus läbitav e-õppes"),
        "assessment_form_et": old_course.get("kontrollivorm"),
        "semester_et": old_course.get("õpetamise semester"),
        "course_card_link": old_course.get("Ainekaardi link"),
        "timetable_link": old_course.get("Tunniplaani link"),
        "objectives_et": old_course.get("õppeaine eesmärgid eesti k"),
        "objectives_en": old_course.get("õppeaine eesmärgid inglise k"),
        # Note the trailing dot in the old keys for learning_outcomes
        "learning_outcomes_et": old_course.get("õppeaine õpiväljundid eesti k."),
        "learning_outcomes_en": old_course.get("õppeaine õpiväljundid ingl k."),
        "description_short_et": old_course.get("õppeaine sisu lühikirjeldus eesti k"),
        "description_short_en": old_course.get("õppeaine sisu lühikirjeldus ingl k"),
        "assessment_method_et": old_course.get("hindamisviis eesti k"),
        "assessment_method_en": old_course.get("hindamisviis ingl k"),
        "independent_work_et": old_course.get("iseseisev töö eesti k"),
        "independent_work_en": old_course.get("iseseisev töö ingl k"),
        "literature_et": old_course.get("õppekirjandus"),
        "study_forms_volumes_et": old_course.get("õppevormid ja mahud"),
        "keel_et": old_course.get("KEEL_et"),
        "keel_en": old_course.get("KEEL_en"),
        "code": old_course.get("õppeaine kood") # Duplicate of 'id' as per new schema
    }

    # --- Complex Transformations ---

    # Convert EAP to a number (float)
    eap_str = old_course.get("õppeaine maht EAP")
    if eap_str:
        try:
            new_course["eap"] = float(eap_str)
        except (ValueError, TypeError):
            new_course["eap"] = 0.0 # Default value if conversion fails
    else:
        new_course["eap"] = 0.0

    # Split study programmes into an array
    programmes_str = old_course.get("Õppekavad, millesse aine kuulub", "")
    new_course["study_programmes"] = programmes_str.splitlines()
    new_course["study_programmes_et"] = programmes_str

    # Parse teaching units
    units_str = old_course.get("Ainet õpetavad struktuuriüksused", "")
    new_course["teaching_units_et"] = units_str
    
    # Extract institute code and name from the first unit listed
    first_unit_match = re.match(r"([A-Z]+)\s*-\s*(.*)", units_str)
    if first_unit_match:
        institute_code = first_unit_match.group(1)
        institute_name = first_unit_match.group(2).strip()
        school_code = institute_code[0] if institute_code else None
        
        new_course["institute_code"] = institute_code
        new_course["institute_name"] = institute_name
        new_course["school_code"] = school_code
        new_course["school_name"] = school_name_map.get(school_code)
    else:
        # Set default empty values if parsing fails
        new_course["institute_code"] = None
        new_course["institute_name"] = None
        new_course["school_code"] = None
        new_course["school_name"] = None

    return new_course

def main():
    input_filename = 'courses.json'
    output_filename = 'courses_new.json'

    try:
        with open(input_filename, 'r', encoding='utf-8') as f:
            old_data = json.load(f)
        
        print(f"Read {len(old_data)} courses from '{input_filename}'.")

        new_data = [transform_course(course) for course in old_data]

        with open(output_filename, 'w', encoding='utf-8') as f:
            # ensure_ascii=False is important for correct Estonian character encoding
            # indent=2 makes the file human-readable
            json.dump(new_data, f, ensure_ascii=False, indent=2)

        print(f"Successfully transformed data and saved to '{output_filename}'.")

    except FileNotFoundError:
        print(f"Error: The file '{input_filename}' was not found.")
    except json.JSONDecodeError:
        print(f"Error: The file '{input_filename}' is not a valid JSON file.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    main()

