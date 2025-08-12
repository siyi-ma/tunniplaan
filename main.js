// main.js - extracted scripts from index.html
// Place all your JavaScript logic here. Start by moving all <script> code from index.html into this file.
// Example: DOMContentLoaded handler

document.addEventListener('DOMContentLoaded', initializeApp);

// ...existing code from index.html <script> tag should be moved here...
        // --- DOM Elements ---
        const searchInputDOM = document.getElementById('searchInput');
        const searchFieldSelectorDOM = document.getElementById('searchFieldSelector');
        const courseListContainerDOM = document.getElementById('courseList');
        const weeklyViewDOM = document.getElementById('weeklyView');
        const schoolFilterDOM = document.getElementById('schoolFilter');
        const instituteFilterDOM = document.getElementById('instituteFilter');
        const assessmentFormFilterDOM = document.getElementById('assessmentFormFilter');
        const loadingIndicatorDOM = document.getElementById('loadingIndicator');
        const filterPanelDOM = document.getElementById('filterPanel');
        const resultsCounterDOM = document.getElementById('resultsCounter');
        const activeFiltersDisplayDOM = document.getElementById('activeFiltersDisplay');
        const viewToggleButtonContainerDOM = document.getElementById('viewToggleButtonContainer');
        const scrollTopBtnDOM = document.getElementById('scrollTopBtn');
        const groupFilterInput = document.getElementById('groupFilterInput');
        const customTooltipDOM = document.getElementById('customTooltip');
        const eapFilterRadiosDOM = document.querySelectorAll('input[name="eapFilter"]');
        const languageFilterRadiosDOM = document.querySelectorAll('input[name="languageFilter"]');

        // --- State & Constants ---
        let allCourses = [], filteredCourses = [], currentLanguage = 'et', isCalendarViewVisible = false, totalFilteredSessions = 0;
        const SEMESTER_START = new Date('2025-09-01T00:00:00'), SEMESTER_END = new Date('2026-01-31T23:59:59');
        const STUDY_WEEK_CUTOFF = new Date('2025-12-21T23:59:59');
        const CALENDAR_SESSION_LIMIT = 3000;
        let calendarDate = new Date(SEMESTER_START);
        
        let sessionDataCache = null, activeFilters = { searchTerm: '', searchFieldType: 'all', school: '', institute: '', eap: '', assessmentForm: '', teachingLanguage: '', group: '' };
        
        // --- Data Sources ---
        const DATA_URL_COURSES = './courses_new.json';
        const DATA_URL_COURSE_GROUP_MAP = './course_to_tpgs_map.json';
        const DATA_URL_GROUP_FACULTY_MAP = './tpg2teaduskond_map.json';
        const DATA_URL_INSTRUCTOR_MAP = './course_to_instructors_map.json';
        // we are using netlify functions to fetch all_dailytimetable.json 

        // In-memory maps for fast lookups
        let schoolToInstitutes = new Map();
        let facultyToGroupsMap = new Map(), groupToFacultyNameMap = new Map();
        let allUniqueGroups = [], allSchoolNames = new Map();

        // Calendar constants
        const HOUR_HEIGHT_PX = 60, START_HOUR = 8, END_HOUR = 22;

        const uiTexts = {
            pageTitle: { et: 'TalTech kursused sügis 2025', en: 'TalTech Courses Autumn 2025' },
            searchInputLabel: { et: 'Otsisõna (eralda komaga)', en: 'Search term (separate by comma)' },
            searchPlaceholder: { et: 'Sisesta otsisõna või -sõnad...', en: 'Enter search term(s)...' },
            searchFieldSelectorLabel: { et: 'Otsi väljal', en: 'Search in field' },
            searchField_all: { et: 'Kõik väljad', en: 'All fields' },
            searchField_title: { et: 'Aine nimetus', en: 'Course name' },
            searchField_course_id: { et: 'Ainekood', en: 'Course Code' },
            searchField_keyword: { et: 'Märksõna', en: 'Keyword' },
            searchField_instructor: { et: 'Õppejõud', en: 'Instructor' },
            searchButtonText: { et: 'Otsi', en: 'Search' },
            resetSearchButtonText: { et: 'Lähtesta', en: 'Reset' },
            activeFiltersHeader: { et: 'Valitud filtrid:', en: 'Selected filters:'},
            clearAllFiltersButton: { et: 'Eemalda kõik filtrid', en: 'Clear all filters'},
            filtersTitle: { et: 'Filtrid', en: 'Filters' },
            schoolFilterLabel: { et: 'Teaduskond', en: 'Faculty' },
            allSchools: { et: 'Kõik teaduskonnad', en: 'All Faculties' },
            instituteFilterLabel: { et: 'Instituut', en: 'Institute' },
            allInstitutes: { et: 'Kõik instituudid', en: 'All Institutes' },
            groupFilterLabel: { et: 'Rühm', en: 'Group' },
            assessmentFormFilterLabel: { et: 'Hindamisvorm', en: 'Assessment Form' },
            allAssessmentForms: { et: 'Kõik vormid', en: 'All Forms' },
            eapFilterLabel: { et: 'EAP', en: 'ECTS' },
            eapAllLabel: { et: 'Kõik', en: 'All' },
            eap3Label: { et: '3 EAP', en: '3 ECTS' },
            eap6Label: { et: '6 EAP', en: '6 ECTS' },
            languageFilterLabel: { et: 'Õppekeel', en: 'Language' },
            langAllLabel: { et: 'Kõik', en: 'All' },
            langEtLabel: { et: 'Eesti keel', en: 'Estonian' },
            langEnLabel: { et: 'Inglise keel', en: 'English' },
            noCoursesFound: { et: 'Vastavaid aineid ei leitud.', en: 'No matching courses found.' },
            resultsFound: { et: (n) => `Leitud ${n} ainet`, en: (n) => `Found ${n} courses` },
            calendarLimitExceeded: { et: (n) => `Leitud ${n} sessiooni. Kalendrivaate kuvamiseks (max ${CALENDAR_SESSION_LIMIT}) kitsenda valikut.`, en: (n) => `Found ${n} sessions. Please narrow your search to display the calendar view (max ${CALENDAR_SESSION_LIMIT}).` },
            showCalendarView: { et: 'Kalendrivaade', en: 'Calendar View' },
            backToCourses: { et: 'Tagasi ainete juurde', en: 'Back to Courses' },
            noSessionsThisPeriod: { et: 'Sellel nädalal sessioone ei toimu.', en: 'No sessions this week.' },
            showMore: { et: 'Näita rohkem', en: 'Show more' },
            showLess: { et: 'Näita vähem', en: 'Show less' },
            objectives: { et: 'Eesmärgid', en: 'Objectives' },
            assessment: { et: 'Hindamisvorm', en: 'Assessment' },
            loadingText: { et: 'Laen andmeid...', en: 'Loading data...' },
            loadingCalendarText: { et: 'Laen kalendri andmeid...', en: 'Loading calendar data...' },
            today: { et: 'Täna', en: 'Today' },
            startsInDays: { et: (d, n) => `Täna on ${d}. Sügissemestri 2025 õppetöö algab ${n} päeva pärast.`, en: (d, n) => `Today is ${d}. The 2025 autumn semester will start in ${n} days.` },
            semesterComplete: { et: (d) => `Täna on ${d}. Sügissemestri 2025 kontaktõpe on lõppenud.`, en: (d) => `Today is ${d}. The contact study of Autumn 2025 is complete.` },
            todayIs: { et: (d, w) => `Täna: ${d} (${w}. õppenädal)`, en: (d, w) => `Today: ${d} (Study week ${w})` },
            mandatoryForGroups: { et: 'Aine on rühmale kohustuslik', en: 'Mandatory for groups' },
            electiveForGroups: { et: 'Aine on rühmale valikuline', en: 'Elective for groups' },
        };
        
        // --- Utility Functions ---
// Assessment form translation map and function
const assessmentFormTranslation = {
    "eksam": "exam",
    "arvestus": "pass/fail",
    "hindeline arvestus": "graded pass/fail",
    "praktiline töö": "internship"
};
function translateAssessmentForm(value) {
    if (!value) return '';
    // If value is already in English or not in map, return as is
    return assessmentFormTranslation[value.trim().toLowerCase()] || value;
}
        const debounce = (func, delay) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func.apply(this, a), delay); }; };
        const timeToMinutes = (timeStr) => { if (!timeStr?.includes(':')) return 0; const [h, m] = timeStr.split(':').map(Number); return h * 60 + m; };
        const parseDate = (dateStr) => { const [d, m, y] = dateStr.split('.'); return new Date(y, m - 1, d); };
        const getCleanInstructorNames = (instructorStr) => {
            if (!instructorStr) return [];
            return instructorStr.split('|').map(i => i.split(' (')[0].trim()).filter(Boolean);
        };
        
        const getStudyWeek = (currentDate) => {
            if (currentDate > STUDY_WEEK_CUTOFF) return null;
            const semesterStartMonday = new Date(SEMESTER_START);
            semesterStartMonday.setDate(semesterStartMonday.getDate() - (semesterStartMonday.getDay() + 6) % 7);
            semesterStartMonday.setHours(0,0,0,0);
            const currentMonday = new Date(currentDate);
            currentMonday.setDate(currentMonday.getDate() - (currentMonday.getDay() + 6) % 7);
            currentMonday.setHours(0,0,0,0);
            if (currentMonday < semesterStartMonday) return null;
            const diffTime = Math.abs(currentMonday - semesterStartMonday);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const weekNumber = Math.floor(diffDays / 7) + 1;
            return weekNumber <= 16 ? weekNumber : null;
        };
        
        // --- Data Processing Functions ---
        function processInitialData(courseData, courseToGroupMap, groupToFacultyData, courseToInstructorMap) {
            groupToFacultyNameMap.clear();
            facultyToGroupsMap.clear();
            groupToFacultyData.forEach(mapEntry => {
                const group = mapEntry.tpg;
                const facultyName = mapEntry.teaduskond;
                if(group && facultyName) {
                    groupToFacultyNameMap.set(group, facultyName);
                    const normalizedKey = facultyName.toUpperCase().replace(/\s+/g, '');
                    if (!facultyToGroupsMap.has(normalizedKey)) {
                        facultyToGroupsMap.set(normalizedKey, new Set());
                    }
                    facultyToGroupsMap.get(normalizedKey).add(group);
                }
            });

            allCourses = courseData.map(c => ({ 
                ...c, 
                sessions: [], 
                uniqueInstructors: new Set((courseToInstructorMap[c.id] || []).map(name => name.split('(')[0].trim())),
                associatedGroups: new Set(courseToGroupMap[c.id] || []) 
            }));

            allSchoolNames.clear();
            allCourses.forEach(c => {
                if (c.school_code && c.school_name) {
                    allSchoolNames.set(c.school_code, { et: c.school_name, en: c.school_name_en || c.school_name });
                }
            });
            
            allUniqueGroups = [...new Set(Object.values(courseToGroupMap).flat())].sort();
            
            schoolToInstitutes.clear();
            allCourses.forEach(course => {
                if (course.school_code) {
                    if (!schoolToInstitutes.has(course.school_code)) {
                        schoolToInstitutes.set(course.school_code, new Set());
                    }
                    if (course.institute_name) {
                        schoolToInstitutes.get(course.school_code).add(course.institute_name);
                    }
                }
            });
        }

        function mergeTimetableData(filteredTimetableData) {
            allCourses.forEach(course => course.sessions = []);

            const sessionMap = new Map();
            filteredTimetableData.forEach(s => {
                const key = `${s.ainekood}|${s.date}|${s.start}|${s.end}|${s.ruum || ''}`;
                const currentSessionRyhmadInfo = new Map();
                if (Array.isArray(s.ryhmad)) s.ryhmad.forEach(r => r && r.group && currentSessionRyhmadInfo.set(r.group.trim(), r.ainekv || 'N/A'));
                if (!sessionMap.has(key)) {
                    sessionMap.set(key, { ...s, ryhmadInfo: currentSessionRyhmadInfo });
                } else {
                    const existing = sessionMap.get(key);
                    currentSessionRyhmadInfo.forEach((status, group) => existing.ryhmadInfo.set(group, status));
                }
            });
            const timetableData = Array.from(sessionMap.values()).map(s => ({ ...s, ryhmad: [...s.ryhmadInfo.keys()].sort().join(',') }));
            
            const sessionsByCourse = new Map();
            timetableData.forEach(s => { if (!sessionsByCourse.has(s.ainekood)) sessionsByCourse.set(s.ainekood, []); sessionsByCourse.get(s.ainekood).push(s); });
            
            allCourses.forEach(course => {
                const courseSessions = sessionsByCourse.get(course.id);
                if (courseSessions) {
                    course.sessions = courseSessions;
                }
            });
        }
        
        // --- Filtering and Rendering Logic ---
        function applyAllFiltersAndRender(resetView = true) {
            if (resetView) { isCalendarViewVisible = false; calendarDate = new Date(SEMESTER_START); }
            
            filteredCourses = allCourses.filter(course => {
                try {
                    const rawSearchTerm = (activeFilters.searchTerm || '').toLowerCase();
                    if (rawSearchTerm) {
                        // Split by comma, filter out empty, and ignore unexpected characters
                        const searchTerms = rawSearchTerm.split(',')
                            .map(t => t.trim())
                            .filter(t => t.length > 0 && /^[\w\s\-äöüõ]+$/i.test(t));
                        if (searchTerms.length > 0) {
                            const searchField = activeFilters.searchFieldType;
                            const instructorsStr = Array.from(course.uniqueInstructors).join(' ').toLowerCase();
                            const keywordsStr = `${(course.keywords_et || []).join(' ')} ${course.description_short_et || ''} ${course.learning_outcomes_et || ''} ${currentLanguage === 'et' ? (course.assessment_form_et || '') : (course.assessment_form_en || course.assessment_form_et || '')}`.toLowerCase();
                            const titleStr = `${course.name_et||''} ${course.name_en||''}`.toLowerCase();
                            const courseIdStr = `${course.id||''}`.toLowerCase();
                            let matchFound = false;
                            switch (searchField) {
                                case 'title': {
                                    matchFound = searchTerms.some(term => titleStr.includes(term));
                                    break;
                                }
                                case 'course_id': {
                                    matchFound = searchTerms.some(term => courseIdStr.includes(term));
                                    break;
                                }
                                case 'keyword': {
                                    matchFound = searchTerms.some(term => keywordsStr.includes(term));
                                    break;
                                }
                                case 'instructor': {
                                    const instructorArr = Array.from(course.uniqueInstructors).map(i => i.toLowerCase());
                                    matchFound = searchTerms.some(term =>
                                        instructorArr.some(instr =>
                                            instr.includes(term) ||
                                            term.split(' ').every(word => instr.includes(word))
                                        )
                                    );
                                    break;
                                }
                                case 'all': {
                                    const combinedStr = `${courseIdStr} ${titleStr} ${keywordsStr} ${instructorsStr}`.trim().toLowerCase();
                                    matchFound = searchTerms.some(term => {
                                        if (!term) return false;
                                        const cleanTerm = term.trim().toLowerCase();
                                        return combinedStr.includes(cleanTerm);
                                    });
                                    break;
                                }
                                default: {
                                    matchFound = false;
                                }
                            }
                            if (!matchFound) return false;
                        }
                    }
                } catch (e) {
                    // If any error, skip this course
                    return false;
                }
                // --- FIX: Stricter faculty filtering ---
                if (activeFilters.school && course.school_code !== activeFilters.school) {
                    return false;
                }
                if (activeFilters.institute && course.institute_name !== activeFilters.institute) {
                    return false;
                }
                if (activeFilters.eap && course.eap != activeFilters.eap) return false;
                if (activeFilters.assessmentForm && (course.assessment_form_et !== activeFilters.assessmentForm && (course.assessment_form_en || course.assessment_form_et) !== activeFilters.assessmentForm)) return false;
                if (activeFilters.teachingLanguage && course[`keel_${activeFilters.teachingLanguage}`] !== "1") return false;
                if (activeFilters.group && !course.associatedGroups.has(activeFilters.group)) return false;
                return true;
            });
            
            totalFilteredSessions = 0; 
            render();
        }
        
        function render() {
            renderActiveFiltersDisplay(); 
            updateViewToggleButton();
            if (isCalendarViewVisible) {
                courseListContainerDOM.classList.add('hidden');
                weeklyViewDOM.classList.remove('hidden');
                renderWeeklyView();
            } else {
                weeklyViewDOM.classList.add('hidden');
                courseListContainerDOM.classList.remove('hidden');
                renderCardView(filteredCourses);
            }
        }

        function createCourseCardHTML(course) {
            const name = currentLanguage === 'et' ? course.name_et : (course.name_en || course.name_et);
            const nameOtherLang = currentLanguage === 'et' ? course.name_en : course.name_et;
            const description = currentLanguage === 'et' ? course.description_short_et : (course.description_short_en || course.description_short_et);
            const instructors = Array.from(course.uniqueInstructors).join(', ');
            let langTag = '';
            if (course.keel_et === "1" && course.keel_en === "1") langTag = 'ET+EN';
            else if (course.keel_et === "1") langTag = 'ET'; else if (course.keel_en === "1") langTag = 'EN';
            const timetableLinkHTML = course.timetable_link ? `<a href="${course.timetable_link}" target="_blank" rel="noopener noreferrer" class="text-tt-magenta hover:underline text-sm font-normal"><i class="fas fa-calendar-alt fa-fw"></i> Tunniplaan</a>` : '';
            return `<div class="bg-white rounded-lg shadow-md border border-tt-grey-1 overflow-hidden flex flex-col h-full">
                        <div class="p-4 flex-grow">
                            <div class="flex justify-between items-start mb-1">
                                <h2 class="text-lg proxima-nova-bold uppercase flex-grow pr-2"><a href="${course.course_card_link || '#'}" target="_blank" class="text-tt-magenta hover:underline">${course.id || ''} - ${name}</a></h2>
                                <div class="text-right flex-shrink-0">${timetableLinkHTML}</div>
                            </div>
                            ${nameOtherLang && name.toLowerCase() !== nameOtherLang.toLowerCase() ? `<h3 class="text-md text-gray-700 font-semibold mb-2">${nameOtherLang}</h3>` : ''}
                            ${instructors ? `<p class="text-sm text-gray-600 mb-2"><i class="fas fa-chalkboard-teacher fa-fw text-gray-400"></i> ${instructors}</p>` : ''}
                            <div class="mb-3 flex flex-wrap gap-2 items-center text-xs font-semibold">
                                ${course.school_code ? `<span class="bg-gray-200 text-gray-700 px-2 py-0.5 rounded">${currentLanguage === 'et' ? course.school_name : (course.school_name_en || course.school_name)}${course.institute_code ? ' | ' + course.institute_code : ''}</span>` : ''}
                                ${langTag ? `<span class="bg-tt-light-blue text-white px-2 py-0.5 rounded">${langTag}</span>` : ''}
                                <span class="bg-gray-200 text-tt-dark-blue px-2 py-0.5 rounded">${course.eap} EAP</span>
                            </div>
                            <p class="course-description text-sm text-gray-700 mb-3 body-text max-h-20 overflow-hidden">${description || ''}</p>
                        </div>
                        <div class="px-4 pb-4 mt-auto">
                            <button class="expand-button text-tt-magenta hover:text-tt-dark-blue text-sm proxima-nova-bold" aria-expanded="false" aria-controls="details-${course.id}"><i class="fas fa-plus" data-show="fa-plus" data-hide="fa-minus"></i> <span class="ml-1">${uiTexts.showMore[currentLanguage]}</span></button>
                        </div>
                        <div id="details-${course.id}" class="expandable-content hidden p-4 border-t border-tt-grey-1 bg-gray-50 text-sm">
                            <h4 class="font-semibold tt-dark-blue mt-2 mb-1 headline">${uiTexts.objectives[currentLanguage]}</h4>
                            <ul class="list-disc list-inside body-text">${currentLanguage === 'et' ? (course.objectives_et || '').split('\n').map(li => `<li>${li.replace(/^- /, '')}</li>`).join('') : (course.objectives_en || '').split('\n').map(li => `<li>${li.replace(/^- /, '')}</li>`).join('')}</ul>
                            <p><strong>${currentLanguage === 'et' ? 'Õpiväljundid' : 'Learning Outcomes'}:</strong></p>
                            <ul class="list-disc list-inside body-text">${currentLanguage === 'et' ? (course.learning_outcomes_et || '').split('\n').map(li => `<li>${li.replace(/^- /, '')}</li>`).join('') : (course.learning_outcomes_en || '').split('\n').map(li => `<li>${li.replace(/^- /, '')}</li>`).join('')}</ul>
                            <p><strong>${currentLanguage === 'et' ? 'Hindamismeetod' : 'Assessment Method'}:</strong> ${currentLanguage === 'et' ? course.assessment_method_et || '' : course.assessment_method_en || course.assessment_method_et || ''}</p>
                                <script>
                                    <script>
                                    // Assessment form translation map and function
                                    const assessmentFormTranslation = {
                                        "eksam": "exam",
                                        "arvestus": "pass/fail",
                                        "hindeline arvestus": "graded pass/fail",
                                        "praktiline töö": "internship"
                                    };
                                    function translateAssessmentForm(value) {
                                        if (!value) return '';
                                        // If value is already in English or not in map, return as is
                                        return assessmentFormTranslation[value.trim().toLowerCase()] || value;
                                    }
                                    </script>
                                <p><strong>${uiTexts.assessment[currentLanguage]}:</strong> ${currentLanguage === 'et' 
                                    ? course.assessment_form_et 
                                    : (course.assessment_form_en || translateAssessmentForm(course.assessment_form_et) || 'N/A')}
                                </p>
                        </div>
                    </div>`;
        }
        
        function renderCardView(courses) {
            resultsCounterDOM.textContent = uiTexts.resultsFound[currentLanguage](courses.length);
            courseListContainerDOM.innerHTML = courses.length === 0 ? `<p class="text-center text-tt-grey-1 col-span-full">${uiTexts.noCoursesFound[currentLanguage]}</p>` : courses.map(createCourseCardHTML).join('');
            
            document.querySelectorAll('.expand-button').forEach(button => {
                if (button.dataset.listener) return;
                button.addEventListener('click', () => {
                    const cardRoot = button.closest('.flex-col');
                    const content = cardRoot.querySelector('.expandable-content');
                    const desc = cardRoot.querySelector('.course-description');
                    if (!content || !desc) return;
                    
                    const icon = button.querySelector('i');
                    const span = button.querySelector('span');
                    const isHidden = content.classList.contains('hidden');
                    
                    content.classList.toggle('hidden');
                    desc.classList.toggle('max-h-20', !isHidden);
                    button.setAttribute('aria-expanded', isHidden);
                    
                    if (isHidden) {
                        icon.className = `fas fa-minus`;
                        span.textContent = ` ${uiTexts.showLess[currentLanguage]}`;
                        button.classList.add('font-bold');
                    } else {
                        icon.className = `fas fa-plus`;
                        span.textContent = ` ${uiTexts.showMore[currentLanguage]}`;
                        button.classList.remove('font-bold');
                    }
                });
                button.dataset.listener = 'true';
            });
        }
        
        async function toggleCalendarView() {
            const loadingText = document.getElementById('loadingText');
            loadingText.textContent = uiTexts.loadingCalendarText[currentLanguage];
            loadingIndicatorDOM.classList.remove('hidden');

            try {
                const courseIds = filteredCourses.map(course => course.id).join(',');
                if (!courseIds) {
                    totalFilteredSessions = 0;
                    throw new Error("No courses selected.");
                }

                const response = await fetch(`/.netlify/functions/getTimetable?courses=${courseIds}`);
                if (!response.ok) {
                    throw new Error(`Server returned status ${response.status}`);
                }
                
                const filteredTimetableData = await response.json();
                
                totalFilteredSessions = filteredTimetableData.length;

                if (totalFilteredSessions > CALENDAR_SESSION_LIMIT) {
                    updateViewToggleButton(); 
                    throw new Error("Calendar limit exceeded after fetching.");
                }
                
                mergeTimetableData(filteredTimetableData);

            } catch(error) {
                console.error("Failed to load calendar data:", error);
                loadingIndicatorDOM.classList.add('hidden');
                return;
            } finally {
                loadingIndicatorDOM.classList.add('hidden');
            }
            
            isCalendarViewVisible = true;
            calendarDate = new Date(SEMESTER_START);
            applyAllFiltersAndRender(false);
        }

        function updateViewToggleButton() {
            viewToggleButtonContainerDOM.innerHTML = '';
            if (isCalendarViewVisible) {
                viewToggleButtonContainerDOM.innerHTML = `<button id="toggleViewBtn" class="px-3 py-1 rounded text-sm font-medium bg-tt-magenta text-white hover:bg-opacity-80"><i class="fas fa-arrow-left mr-1"></i> ${uiTexts.backToCourses[currentLanguage]}</button>`;
                viewToggleButtonContainerDOM.querySelector('#toggleViewBtn').addEventListener('click', () => {
                    isCalendarViewVisible = false;
                    render();
                });
            } else if (totalFilteredSessions > CALENDAR_SESSION_LIMIT) {
                 viewToggleButtonContainerDOM.innerHTML = `
                    <div class="flex flex-col items-end">
                        <button class="px-3 py-1 rounded text-sm font-medium bg-gray-400 text-white cursor-not-allowed" disabled><i class="fas fa-calendar-week mr-1"></i> ${uiTexts.showCalendarView[currentLanguage]}</button>
                        <p class="text-xs text-red-600 mt-1 text-right">${uiTexts.calendarLimitExceeded[currentLanguage](totalFilteredSessions)}</p>
                    </div>`;
            } else {
                viewToggleButtonContainerDOM.innerHTML = `<button id="toggleViewBtn" class="px-3 py-1 rounded text-sm font-medium bg-tt-dark-blue text-white hover:bg-tt-dark-blue-hover"><i class="fas fa-calendar-week mr-1"></i> ${uiTexts.showCalendarView[currentLanguage]}</button>`;
                viewToggleButtonContainerDOM.querySelector('#toggleViewBtn').addEventListener('click', toggleCalendarView);
            }
        }

        function calculateOverlaps(daySessions) {
            if (!daySessions || daySessions.length === 0) return;
            daySessions.forEach(s => { s.startMin = timeToMinutes(s.start) || 0; s.endMin = timeToMinutes(s.end) || 0; });
            daySessions.sort((a, b) => a.startMin - b.startMin);
            const groups = []; for (let i = 0; i < daySessions.length; i++) daySessions[i].processed = false;
            for (let i = 0; i < daySessions.length; i++) {
                if (daySessions[i].processed) continue;
                const currentGroup = []; const queue = [daySessions[i]]; daySessions[i].processed = true; let head = 0;
                while(head < queue.length) {
                    const session = queue[head++]; currentGroup.push(session);
                    for (let j = 0; j < daySessions.length; j++) { 
                        if (daySessions[j].processed) continue; 
                        if (session.startMin < daySessions[j].endMin && session.endMin > daySessions[j].startMin) { 
                            daySessions[j].processed = true; 
                            queue.push(daySessions[j]); 
                        }
                    }
                }
                groups.push(currentGroup);
            }
            groups.forEach(group => {
                group.sort((a, b) => a.startMin - b.startMin); const columns = [];
                group.forEach(event => {
                    let placed = false;
                    for (let colIndex = 0; colIndex < columns.length; colIndex++) { if (event.startMin >= columns[colIndex]) { columns[colIndex] = event.endMin; event.col = colIndex; placed = true; break; }}
                    if (!placed) { event.col = columns.length; columns.push(event.endMin); }
                });
                group.forEach(event => event.maxCols = columns.length);
            });
        }
        
        function getSessionData() {
            if (sessionDataCache) return sessionDataCache;
            let allSessions = filteredCourses.flatMap(c => c.sessions.map(s => ({...s, aine: `${c.id} - ${currentLanguage === 'et' ? c.name_et : (c.name_en || c.name_et)}`})));
            if (activeFilters.group) {
                const groupFilter = activeFilters.group.trim().toLowerCase();
                allSessions = allSessions.filter(s =>
                    s.ryhmad?.split(',').map(g => g.trim().toLowerCase()).includes(groupFilter)
                );
            }
            const sessionsByDate = new Map();
            allSessions.forEach(s => {
                if (!s.date) return;
                const startDate = parseDate(s.date); const endDate = s.end_date ? parseDate(s.end_date) : new Date(startDate);
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate < startDate) return;
                let currentDate = new Date(startDate); const recurrence = s.korduvus === 'üle nädala' ? 14 : 7;
                while(currentDate <= endDate) {
                    const dateKey = currentDate.toISOString().split('T')[0];
                    if (!sessionsByDate.has(dateKey)) sessionsByDate.set(dateKey, []);
                    sessionsByDate.get(dateKey).push({...s});
                    currentDate.setDate(currentDate.getDate() + recurrence);
                }
            });
            sessionsByDate.forEach(calculateOverlaps);
            sessionDataCache = sessionsByDate;
            return sessionsByDate;
        }
        
        function renderWeeklyView() {
            sessionDataCache = null; const sessionsByDate = getSessionData();
            const allFilteredSessions = filteredCourses.flatMap(c => c.sessions.map(s => ({...s, aine: `${c.id} - ${currentLanguage === 'et' ? c.name_et : (c.name_en || c.name_et)}` })));
            const unscheduledByCourse = new Map();
            allFilteredSessions.forEach(session => {
                if (!session.date) {
                    const courseKey = session.ainekood || session.aine;
                    if (!unscheduledByCourse.has(courseKey)) unscheduledByCourse.set(courseKey, { courseName: session.aine, courseId: session.ainekood, sessions: [] });
                    unscheduledByCourse.get(courseKey).sessions.push(session);
                }
            });
            let veebiopeHTML = '';
            if (unscheduledByCourse.size > 0) {
                veebiopeHTML = `<div class="mb-6 p-4 bg-gray-100 rounded-lg"><div class="flex items-start gap-4"><h3 class="text-lg font-bold text-tt-dark-blue pt-2 flex-shrink-0" style="min-width: 100px;">Veebiõpe</h3><div class="flex flex-wrap gap-4">`;
                unscheduledByCourse.forEach(courseData => {
                    const sessionGroups = new Map();
                    courseData.sessions.forEach(s => {
                        const type = s.tyyp || 'N/A';
                        if (!sessionGroups.has(type)) sessionGroups.set(type, new Set());
                        getCleanInstructorNames(s.oppejoud).forEach(name => sessionGroups.get(type).add(name));
                    });
                    sessionGroups.forEach((instructors, type) => {
                         veebiopeHTML += `<div class="bg-white p-3 rounded border-l-4 border-tt-dark-blue shadow-sm" style="min-width: 180px;"><p class="font-bold text-tt-dark-blue truncate">${courseData.courseName}</p><p class="text-sm mt-1">${type}</p><p class="text-sm text-gray-600">${[...instructors].join(', ')}</p></div>`;
                    });
                });
                veebiopeHTML += `</div></div></div>`;
            }
            let todayStatusHTML = '';
            const today = new Date();
            const todayDateString = today.toLocaleDateString(currentLanguage === 'et' ? 'et-EE' : 'en-GB', { day:'numeric', month:'long', year:'numeric'});
            today.setHours(0,0,0,0);
            if (today < SEMESTER_START) {
                const daysUntilStart = Math.ceil((SEMESTER_START - today) / (1000 * 60 * 60 * 24));
                todayStatusHTML = `<div class="text-center font-semibold text-tt-dark-blue p-2 bg-yellow-100 border border-yellow-300 rounded">${uiTexts.startsInDays[currentLanguage](todayDateString, daysUntilStart)}</div>`;
            } else if (today > SEMESTER_END) {
                todayStatusHTML = `<div class="text-center font-semibold text-tt-dark-blue p-2 bg-blue-100 border border-blue-300 rounded">${uiTexts.semesterComplete[currentLanguage](todayDateString)}</div>`;
            } else {
                const studyWeek = getStudyWeek(today);
                if(studyWeek) todayStatusHTML = `<div class="text-center font-semibold text-tt-dark-blue p-2 bg-gray-100 rounded">${uiTexts.todayIs[currentLanguage](todayDateString, studyWeek)}</div>`;
            }
            weeklyViewDOM.innerHTML = `<div class="mb-4">${todayStatusHTML}</div>${veebiopeHTML}<div class="flex justify-between items-center mb-4 gap-4"><div id="dateRangeDisplay" class="text-xl font-bold text-tt-dark-blue text-left flex-grow"></div><div class="flex items-center gap-2"><button id="prevMonthBtn" class="p-2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200" title="Eelmine kuu"><i class="fas fa-angle-double-left"></i></button><button id="prevWeekBtn" class="p-2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200" title="Eelmine nädal"><i class="fas fa-angle-left"></i></button><button id="todayBtn" class="px-3 py-1.5 rounded text-sm font-medium bg-tt-dark-blue text-white hover:bg-tt-dark-blue-hover">${uiTexts.today[currentLanguage]}</button><button id="nextWeekBtn" class="p-2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200" title="Järgmine nädal"><i class="fas fa-angle-right"></i></button><button id="nextMonthBtn" class="p-2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200" title="Järgmine kuu"><i class="fas fa-angle-double-right"></i></button></div></div><div id="calendarContent" class="calendar-grid-wrapper"></div>`;
            
            const calendarContent = document.getElementById('calendarContent'), dateRangeDisplay = document.getElementById('dateRangeDisplay');
            const updateCalendar = () => {
                const startDate = new Date(calendarDate);
                startDate.setDate(startDate.getDate() - (startDate.getDay() + 6) % 7);
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 6);
                const studyWeek = getStudyWeek(startDate);
                const weekTextEt = studyWeek ? ` (${studyWeek}. õppenädal)` : '', weekTextEn = studyWeek ? ` (Study Week ${studyWeek})` : '';
                let dateRangeString;
                if (currentLanguage === 'et') {
                    const formatEt = (d) => `${d.getDate()}. ${d.toLocaleDateString('et-EE', {month:'short'}).replace('.','')}`;
                    dateRangeString = `${formatEt(startDate)} - ${formatEt(endDate)} ${endDate.getFullYear()}${weekTextEt}`;
                } else {
                    const formatEn = (d) => d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
                    dateRangeString = `${formatEn(startDate)} - ${formatEn(endDate)}, ${endDate.getFullYear()}${weekTextEn}`;
                }
                dateRangeDisplay.textContent = dateRangeString;
                const dayNames = currentLanguage === 'et' ? ['E','T','K','N','R','L','P'] : ['M','T','W','T','F','S','S'];
                const totalHours = END_HOUR - START_HOUR;
                let hasAnySessionThisWeek = false;
                let gridHTML = `<div class="calendar-grid"><div class="time-ruler-header"></div>`;
                for (let i = 0; i < 7; i++) {
                    const dayDate = new Date(startDate); dayDate.setDate(dayDate.getDate() + i);
                    gridHTML += `<div class="grid-header-cell">${dayNames[i]} ${dayDate.getDate()}.${String(dayDate.getMonth()+1).padStart(2,'0')}</div>`;
                }
                gridHTML += `<div class="time-ruler-body" style="height:${totalHours * HOUR_HEIGHT_PX}px">`;
                for (let h = START_HOUR + 1; h <= END_HOUR; h++) gridHTML += `<div class="time-grid-ruler-hour" style="top:${(h-START_HOUR)*HOUR_HEIGHT_PX}px;">${String(h).padStart(2,'0')}:00</div>`;
                gridHTML += `</div>`;
                for (let i = 0; i < 7; i++) {
                    gridHTML += `<div class="grid-body-cell" style="height:${totalHours*HOUR_HEIGHT_PX}px">`;
                    const dayDate = new Date(startDate); dayDate.setDate(dayDate.getDate() + i);
                    const dateKey = dayDate.toISOString().split('T')[0];
                    const daySessions = sessionsByDate.get(dateKey) || [];
                    if (daySessions.length > 0) hasAnySessionThisWeek = true;
                    daySessions.forEach(session => {
                        const top = ((session.startMin - START_HOUR*60) / 60) * HOUR_HEIGHT_PX, height = Math.max(20, (session.endMin - session.startMin)/60 * HOUR_HEIGHT_PX - 2);
                        const width = `calc(${100 / (session.maxCols || 1)}% - 4px)`, left = `${(100 / (session.maxCols || 1)) * (session.col || 0)}%`;
                        let borderColor = '#e4067e';
                        if (activeFilters.group && session.ryhmadInfo) {
                            const status = session.ryhmadInfo.get(activeFilters.group);
                            if (status === 'kohustuslik') borderColor = '#e4067e'; else if (status === 'valikuline') borderColor = '#4dbed2';
                        }
                        const mandatoryGroups = [], electiveGroups = [];
                        if(session.ryhmadInfo) session.ryhmadInfo.forEach((status, group) => { if (status === 'kohustuslik') mandatoryGroups.push(group); else if (status === 'valikuline') electiveGroups.push(group); });
                        
                        const fullInstructorsForTooltip = session.oppejoud.split('|').join(', ');
                        const cleanInstructorsForDisplay = getCleanInstructorNames(session.oppejoud).join(', ');

                        let tooltipHTML = `<div class="tooltip-title">${session.aine}</div><div>${fullInstructorsForTooltip || 'N/A'}</div><div class="text-gray-300">${session.tyyp}</div><div class="text-gray-300">${session.start} - ${session.end} @ ${session.ruum || 'N/A'}</div>`;
                        if (mandatoryGroups.length > 0) tooltipHTML += `<div class="tooltip-section-title">${uiTexts.mandatoryForGroups[currentLanguage]}:</div><div>${mandatoryGroups.join(', ')}</div>`;
                        if (electiveGroups.length > 0) tooltipHTML += `<div class="tooltip-section-title">${uiTexts.electiveForGroups[currentLanguage]}:</div><div>${electiveGroups.join(', ')}</div>`;
                        
                        gridHTML += `<div class="session-card" data-tooltip="${encodeURIComponent(tooltipHTML)}" style="top: ${top}px; height: ${height}px; left: ${left}; width: ${width}; border-left-color: ${borderColor}">`;
                        gridHTML += `<div class='session-card-content'><div class='course-name truncate'>${session.aine || ''}</div><div class='session-details truncate'>${cleanInstructorsForDisplay || ''}</div><div class='session-details'>${session.start || ''} - ${session.end || ''}</div><div class='session-details truncate'><i class='fas fa-map-marker-alt fa-fw text-gray-400'></i> ${session.ruum || 'N/A'}</div></div></div>`;
                    });
                    gridHTML += `</div>`;
                }
                gridHTML += `</div>`;
                calendarContent.innerHTML = gridHTML;
                if (!hasAnySessionThisWeek) calendarContent.innerHTML += `<p class="text-center text-tt-grey-1 p-8">${uiTexts.noSessionsThisPeriod[currentLanguage]}</p>`;
            }
            document.getElementById('todayBtn').addEventListener('click', () => { calendarDate = new Date(); updateCalendar(); });
            document.getElementById('prevWeekBtn').addEventListener('click', () => { calendarDate.setDate(calendarDate.getDate() - 7); updateCalendar(); });
            document.getElementById('nextWeekBtn').addEventListener('click', () => { calendarDate.setDate(calendarDate.getDate() + 7); updateCalendar(); });
            document.getElementById('prevMonthBtn').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); updateCalendar(); });
            document.getElementById('nextMonthBtn').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); updateCalendar(); });
            updateCalendar();
        }
        
        function setupSearchableDropdown(inputId, listId, data, onSelect) {
            const input = document.getElementById(inputId), list = document.getElementById(listId);
            const populateList = (items) => { list.innerHTML = items.map(item => `<div class="searchable-dropdown-list-item" data-value="${item}">${item}</div>`).join(''); };
            input.addEventListener('input', () => { const term = input.value.toLowerCase(); populateList(data.filter(item => item.toLowerCase().includes(term))); list.classList.remove('hidden'); });
            input.addEventListener('focus', () => { if(!input.disabled) { if(input.value === '') populateList(data); list.classList.remove('hidden'); } });
            list.addEventListener('click', e => { if (e.target.matches('.searchable-dropdown-list-item')) { const value = e.target.dataset.value; input.value = value; onSelect(value); list.classList.add('hidden'); } });
            document.addEventListener('click', e => { if (!e.target.closest(`#${inputId}, #${listId}`)) list.classList.add('hidden'); });
        }
        
        function populateFilterOptions() {
            // --- Patch: Always include all faculties from tpg2teaduskond_map.json ---
            let mappedFaculties = [];
            try {
                // Synchronously fetch and parse tpg2teaduskond_map.json (already loaded elsewhere, but fallback here)
                mappedFaculties = Array.from(new Set(
                    (window.tpg2teaduskondData || [])
                        .map(obj => obj.teaduskond)
                        .filter(Boolean)
                ));
            } catch (e) { mappedFaculties = []; }

            // Build a set of all faculties from both course data and mapping file
            const allFacultiesSet = new Set();
            // Add from course data
            allSchoolNames.forEach((names, code) => {
                allFacultiesSet.add(names[currentLanguage] || names['et']);
            });
            // Add from mapping file
            mappedFaculties.forEach(fac => allFacultiesSet.add(fac));

            // Build dropdown data
            const schools = Array.from(allFacultiesSet).sort().map((name, idx) => ({
                code: name.replace(/\s+/g, '').toUpperCase(),
                name: name
            }));

            const populateSelect = (el, data, label) => { const c = el.value; el.innerHTML = `<option value="">${label}</option>`; data.forEach(i => i.code && i.name && el.add(new Option(i.name, i.code))); el.value = c; };
            populateSelect(schoolFilterDOM, schools, uiTexts.allSchools[currentLanguage]);
            
            const assForms = [...new Set(allCourses.map(c => currentLanguage === 'et' ? c.assessment_form_et : (c.assessment_form_en || c.assessment_form_et)).filter(Boolean))].sort();
            const assFormSelect = assessmentFormFilterDOM; const currentAss = assFormSelect.value;
            assFormSelect.innerHTML = `<option value="">${uiTexts.allAssessmentForms[currentLanguage]}</option>`;
            assForms.forEach(i => assFormSelect.add(new Option(i,i))); assFormSelect.value = currentAss;
            
            updateDependentFilters();
        }
        
        function updateDependentFilters() {
            const schoolCode = schoolFilterDOM.value;
            
            instituteFilterDOM.disabled = !schoolCode;
            
            const institutes = new Set();
            if (schoolCode) {
                (schoolToInstitutes.get(schoolCode) || []).forEach(inst => institutes.add(inst));
            }

            const currentInstitute = activeFilters.institute;
            instituteFilterDOM.innerHTML = `<option value="">${uiTexts.allInstitutes[currentLanguage]}</option>`;
            [...institutes].sort().forEach(i => instituteFilterDOM.add(new Option(i, i)));
            instituteFilterDOM.value = currentInstitute;
            
            groupFilterInput.value = activeFilters.group || '';
            let relevantGroups = [];
            if (schoolCode) {
                const facultyNameEstonian = (allSchoolNames.get(schoolCode) || {}).et || '';
                const normalizedKey = facultyNameEstonian.toUpperCase().replace(/\s+/g, '');
                relevantGroups = [...(facultyToGroupsMap.get(normalizedKey) || [])].sort();
            } else {
                relevantGroups = allUniqueGroups;
            }
            setupSearchableDropdown('groupFilterInput', 'groupFilterList', relevantGroups, value => {
                activeFilters.group = value; applyAllFiltersAndRender(false);
            });
        }

        function renderActiveFiltersDisplay() {
            activeFiltersDisplayDOM.innerHTML = ''; const pills = [];
            const createPill = (type, label, value) => pills.push(`<span class="filter-pill">${label}: ${value}<button class="filter-pill-remove" data-filtertype="${type}">×</button></span>`);
            if(activeFilters.searchTerm) createPill('searchTerm', Array.from(searchFieldSelectorDOM.options).find(o => o.value == activeFilters.searchFieldType)?.textContent || 'Otsing', `"${activeFilters.searchTerm}"`);
            if(activeFilters.school) createPill('school', uiTexts.schoolFilterLabel[currentLanguage], (allSchoolNames.get(activeFilters.school) || {})[currentLanguage] || activeFilters.school);
            if(activeFilters.institute) createPill('institute', uiTexts.instituteFilterLabel[currentLanguage], activeFilters.institute);
            if(activeFilters.group) createPill('group', uiTexts.groupFilterLabel[currentLanguage], activeFilters.group);
            if(activeFilters.assessmentForm) createPill('assessmentForm', uiTexts.assessmentFormFilterLabel[currentLanguage], activeFilters.assessmentForm);
            if(activeFilters.eap) createPill('eap', uiTexts.eapFilterLabel[currentLanguage], `${activeFilters.eap} EAP`);
            if(activeFilters.teachingLanguage) createPill('teachingLanguage', uiTexts.languageFilterLabel[currentLanguage], uiTexts[`lang${activeFilters.teachingLanguage === 'et' ? 'Et' : 'En'}Label`][currentLanguage]);
            if(pills.length > 0) {
                activeFiltersDisplayDOM.innerHTML = `<div class="flex flex-wrap items-center"><strong class="mr-2 body-text">${uiTexts.activeFiltersHeader[currentLanguage]}</strong>${pills.join('')}<button id="clearAllFiltersButton" class="text-sm text-tt-magenta hover:underline ml-2 body-text">${uiTexts.clearAllFiltersButton[currentLanguage]}</button></div>`;
                activeFiltersDisplayDOM.querySelectorAll('.filter-pill-remove').forEach(b => b.addEventListener('click', e => removeFilter(e.currentTarget.dataset.filtertype)));
                activeFiltersDisplayDOM.querySelector('#clearAllFiltersButton')?.addEventListener('click', clearAllFilters);
            }
        }

        function removeFilter(type) {
            activeFilters[type] = '';
            if (type === 'searchTerm') {
                document.getElementById('searchInput').value = '';
            } else if (type === 'group') {
                document.getElementById(`${type}FilterInput`).value = '';
            } else if (type === 'eap' || type === 'teachingLanguage') {
                document.querySelector(`input[name="${type}Filter"][value=""]`).checked = true;
            } else {
                const el = document.getElementById(`${type}Filter`);
                if (el) el.value = '';
            }

            if (type === 'school') {
                activeFilters.institute = '';
                document.getElementById('instituteFilter').value = '';
            }

            applyAllFiltersAndRender(false);
            updateDependentFilters();
        }

        function clearAllFilters() { 
            Object.keys(activeFilters).forEach(k => { activeFilters[k] = ''; });
            ['searchInput', 'schoolFilter', 'instituteFilter', 'assessmentFormFilter', 'groupFilterInput'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';}); 
            ['eapFilter','languageFilter'].forEach(name=>document.querySelector(`input[name="${name}"][value=""]`).checked=true);
            searchFieldSelectorDOM.value = 'all'; 
            applyAllFiltersAndRender(false); 
            updateDependentFilters();
        }
        
        function updateAllUITexts() {
            Object.keys(uiTexts).forEach(key => {
                const el = document.getElementById(key);
                if (el && typeof uiTexts[key] === 'object' && uiTexts[key][currentLanguage] && typeof uiTexts[key][currentLanguage] !== 'function') {
                    if (el.tagName === 'INPUT') el.placeholder = uiTexts[key][currentLanguage];
                    else el.textContent = uiTexts[key][currentLanguage];
                }
            });
            if (searchFieldSelectorDOM) {
                searchFieldSelectorDOM.options[0].textContent = uiTexts.searchField_all[currentLanguage];
                searchFieldSelectorDOM.options[1].textContent = uiTexts.searchField_title[currentLanguage];
                searchFieldSelectorDOM.options[2].textContent = uiTexts.searchField_course_id[currentLanguage];
                searchFieldSelectorDOM.options[3].textContent = uiTexts.searchField_keyword[currentLanguage];
                searchFieldSelectorDOM.options[4].textContent = uiTexts.searchField_instructor[currentLanguage];
            }
            if (document.getElementById('langIndicator')) document.getElementById('langIndicator').textContent = currentLanguage === 'et' ? 'EN' : 'ET';
            applyAllFiltersAndRender(false);
        }

        function setLanguage(lang) {
            currentLanguage = lang;
            document.documentElement.lang = lang;
            populateFilterOptions();
            updateAllUITexts();
        }

        function setupEventListeners() {
            document.getElementById('languageToggle').addEventListener('click', () => setLanguage(currentLanguage === 'et' ? 'en' : 'et'));
            document.getElementById('searchButton').addEventListener('click', () => { activeFilters.searchTerm = searchInputDOM.value; activeFilters.searchFieldType = searchFieldSelectorDOM.value; applyAllFiltersAndRender(); });
            document.getElementById('resetSearchButton').addEventListener('click', clearAllFilters);
            searchInputDOM.addEventListener('input', debounce(() => { activeFilters.searchTerm = searchInputDOM.value; activeFilters.searchFieldType = searchFieldSelectorDOM.value; applyAllFiltersAndRender(); }, 300));
            
            schoolFilterDOM.addEventListener('change', e => { 
                activeFilters.school = e.target.value; 
                activeFilters.institute = ''; 
                updateDependentFilters(); 
                applyAllFiltersAndRender(false); 
            });
            instituteFilterDOM.addEventListener('change', e => { 
                activeFilters.institute = e.target.value; 
                applyAllFiltersAndRender(false); 
            });

            assessmentFormFilterDOM.addEventListener('change', e => { activeFilters.assessmentForm = e.target.value; applyAllFiltersAndRender(); });
            
            groupFilterInput.addEventListener('input', (e) => {
                if (e.target.value === '' && activeFilters.group) { removeFilter('group'); }
            });

            eapFilterRadiosDOM.forEach(r => r.addEventListener('change', e => { activeFilters.eap = e.target.value; applyAllFiltersAndRender(); }));
            languageFilterRadiosDOM.forEach(r => r.addEventListener('change', e => { activeFilters.teachingLanguage = e.target.value; applyAllFiltersAndRender(); }));
            document.getElementById('filterToggleButton').addEventListener('click', () => filterPanelDOM.classList.toggle('filter-drawer-open'));
            document.getElementById('closeFilterButton').addEventListener('click', () => filterPanelDOM.classList.remove('filter-drawer-open'));
            window.onscroll = () => { scrollTopBtnDOM.style.display = (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) ? "flex" : "none"; };
            scrollTopBtnDOM.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

            weeklyViewDOM.addEventListener('mouseover', e => {
                const card = e.target.closest('.session-card');
                if (card && card.dataset.tooltip) {
                    customTooltipDOM.innerHTML = decodeURIComponent(card.dataset.tooltip);
                    customTooltipDOM.style.display = 'block';
                }
            });
            weeklyViewDOM.addEventListener('mouseout', () => { customTooltipDOM.style.display = 'none'; });
            weeklyViewDOM.addEventListener('mousemove', e => {
                if(customTooltipDOM.style.display === 'block') {
                    const top = e.clientY + 15; const left = e.clientX + 15;
                    const rightEdge = window.innerWidth - 20; const bottomEdge = window.innerHeight - 20;
                    customTooltipDOM.style.left = Math.min(left, rightEdge - customTooltipDOM.offsetWidth) + 'px';
                    customTooltipDOM.style.top = Math.min(top, bottomEdge - customTooltipDOM.offsetHeight) + 'px';
                }
            });
        }

        // --- CHANGE: Main app initialization now fetches the instructor map ---
        async function initializeApp() {
            try {
                const [coursesRes, courseGroupMapRes, groupFacultyMapRes, instructorMapRes] = await Promise.all([ 
                    fetch(DATA_URL_COURSES), 
                    fetch(DATA_URL_COURSE_GROUP_MAP),
                    fetch(DATA_URL_GROUP_FACULTY_MAP),
                    fetch(DATA_URL_INSTRUCTOR_MAP)
                ]);

                if (!coursesRes.ok || !courseGroupMapRes.ok || !groupFacultyMapRes.ok || !instructorMapRes.ok) {
                    throw new Error(`Failed to load one or more initial data files.`);
                }
                
                processInitialData(
                    await coursesRes.json(), 
                    await courseGroupMapRes.json(), 
                    await groupFacultyMapRes.json(),
                    await instructorMapRes.json()
                );
                
                setupEventListeners();
                setLanguage('et');
            } catch (error) {
                console.error("Initialization failed:", error);
                courseListContainerDOM.innerHTML = `<div class="p-4 bg-red-100 text-red-800 rounded-md col-span-full"><strong>Error: Could not load initial data.</strong><br>${error.message}</div>`;
            } finally {
                loadingIndicatorDOM.classList.add('hidden');
            }
        }
        
        document.addEventListener('DOMContentLoaded', initializeApp);