// main.js - FINAL VERSION
// This script is fully optimized to work with the final data structure and includes all new features.

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    renderCourseCardLegend();
});

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
const filterToggleButton = document.getElementById('filterToggleButton');
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
const DATA_URL_UNIFIED_COURSES = './unified_courses.json';
let schoolToInstitutes = new Map(), facultyToGroupsMap = new Map();
let allUniqueGroups = [], allSchoolNames = new Map();
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

// --- Faculty Info Mapping for Frontend ---
const FACULTY_INFO = {
    M: { et: 'Majandusteaduskond', en: 'School of Business and Governance' },
    L: { et: 'Loodusteaduskond', en: 'School of Science' },
    E: { et: 'Inseneriteaduskond', en: 'School of Engineering' },
    I: { et: 'Infotehnoloogia teaduskond', en: 'School of Information Technologies' },
    V: { et: 'Eesti Mereakadeemia', en: 'Estonian Maritime Academy' },
    DOK: { et: 'Doktoriope', en: 'Doctoral Studies' }
};

// --- Utility Functions ---
// --- Course Card Legend Statistics ---
function renderCourseCardLegend() {
    const legendDOM = document.getElementById('courseCardLegend');
    if (!legendDOM) return;
    // Count statistics from allCourses
    let online = 0, hybrid = 0, offline = 0;
    allCourses.forEach(c => {
        if (c.session_status === 'online') online++;
        else if (c.session_status === 'hybrid') hybrid++;
        else if (c.session_status === 'offline') offline++;
    });
    legendDOM.style.display = 'block';
    legendDOM.innerHTML = `
        <div class="legend-row" style="display:flex; gap:16px; align-items:center;">
            <span class="legend-color-box border-tt-magenta">Online: <strong>${online}</strong></span>
            <span class="legend-color-box border-tt-light-blue">Hybrid: <strong>${hybrid}</strong></span>
            <span class="legend-color-box border-tt-grey-1">Offline: <strong>${offline}</strong></span>
        </div>
    `;
}
const debounce = (func, delay) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func.apply(this, a), delay); }; };
const timeToMinutes = (timeStr) => { if (!timeStr?.includes(':')) return 0; const [h, m] = timeStr.split(':').map(Number); return h * 60 + m; };
const parseDate = (dateStr) => { const [d, m, y] = dateStr.split('.'); return new Date(y, m - 1, d); };
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
function postProcessUnifiedData(groupToFacultyLookup = {}) {
    allSchoolNames.clear();
    schoolToInstitutes.clear();
    facultyToGroupsMap.clear();
    const uniqueGroups = new Set();

    // Build facultyToGroupsMap ONLY from groupToFacultyMap
    const groupToFacultyMap = window.groupToFacultyMap || {};
    Object.values(groupToFacultyMap).forEach(facultyCode => {
        if (!facultyToGroupsMap.has(facultyCode)) {
            facultyToGroupsMap.set(facultyCode, new Set());
        }
    });
    Object.entries(groupToFacultyMap).forEach(([group, facultyCode]) => {
        if (facultyToGroupsMap.has(facultyCode)) {
            facultyToGroupsMap.get(facultyCode).add(group);
        }
    });

    // Build other maps as before
    allCourses.forEach(course => {
        if (course.groups && course.groups.length > 0) {
            course.groups.forEach(group => uniqueGroups.add(group));
        }
        if (course.school_code && course.school_name) {
            allSchoolNames.set(course.school_code, { et: course.school_name, en: course.school_name_en || course.school_name });
            if (!schoolToInstitutes.has(course.school_code)) {
                schoolToInstitutes.set(course.school_code, new Set());
            }
            if (course.institute_name) {
                schoolToInstitutes.get(course.school_code).add(course.institute_name);
            }
        }
    });
    allUniqueGroups = [...uniqueGroups].sort();
}

function mergeTimetableData(filteredTimetableData) {
    allCourses.forEach(course => course.sessions = []);
    const sessionsByCourse = new Map();
    filteredTimetableData.forEach(session => {
        if (!sessionsByCourse.has(session.course_id)) {
            sessionsByCourse.set(session.course_id, []);
        }
        sessionsByCourse.get(session.course_id).push(session);
    });
    allCourses.forEach(course => {
        const courseSessions = sessionsByCourse.get(course.id);
        if (courseSessions) course.sessions = courseSessions;
    });
}

// --- Filtering and Rendering Logic ---
function applyAllFiltersAndRender(resetView = true) {
    if (resetView) { isCalendarViewVisible = false; calendarDate = new Date(SEMESTER_START); }
    
    filteredCourses = allCourses.filter(course => {
        if (activeFilters.school === 'DOKTOR') {
            if (!course.groups || !course.groups.includes('DOKTOR')) return false;
        } else if (activeFilters.school && course.school_code !== activeFilters.school) {
            return false;
        }

        if (activeFilters.institute && course.institute_name !== activeFilters.institute) return false;
        if (activeFilters.eap && course.eap != activeFilters.eap) return false;
        if (activeFilters.assessmentForm && (course.assessment_form_et !== activeFilters.assessmentForm)) return false;
        if (activeFilters.teachingLanguage && course[`keel_${activeFilters.teachingLanguage}`] !== "1") return false;
        if (activeFilters.group && !(course.groups || []).includes(activeFilters.group)) return false;
        
        const rawSearchTerm = (activeFilters.searchTerm || '').toLowerCase();
        if (rawSearchTerm) {
            const searchTerms = rawSearchTerm.split(',').map(t => t.trim()).filter(Boolean);
            if (searchTerms.length > 0) {
                const searchField = activeFilters.searchFieldType;
                const instructorsStr = (course.instructors || []).map(i => i.name).filter(Boolean).join(' ').toLowerCase();
                const keywordsStr = `${(course.keywords_et || []).join(' ')} ${course.description_short_et || ''} ${course.learning_outcomes_et || ''} ${course.assessment_form_et || ''}`.toLowerCase();
                const titleStr = `${course.name_et||''} ${course.name_en||''}`.toLowerCase();
                const courseIdStr = `${course.id||''}`.toLowerCase();
                let matchFound = false;
                switch (searchField) {
                    case 'title': matchFound = searchTerms.some(term => titleStr.includes(term)); break;
                    case 'course_id': matchFound = searchTerms.some(term => courseIdStr.includes(term)); break;
                    case 'keyword': matchFound = searchTerms.some(term => keywordsStr.includes(term)); break;
                    case 'instructor':
                        const instructorArr = (course.instructors || []).map(i => i.name.toLowerCase());
                        matchFound = searchTerms.some(term => instructorArr.some(instr => instr.includes(term) || term.split(' ').every(word => instr.includes(word))));
                        break;
                    case 'all':
                    default:
                        const combinedStr = `${courseIdStr} ${titleStr} ${keywordsStr} ${instructorsStr}`.toLowerCase();
                        matchFound = searchTerms.some(term => combinedStr.includes(term));
                        break;
                }
                if (!matchFound) return false;
            }
        }
        return true;
    });
    // Reorder: online first, then hybrid, then offline, then others
    filteredCourses.sort((a, b) => {
        const statusOrder = { online: 0, hybrid: 1, offline: 2 };
        const aOrder = statusOrder[a.session_status] !== undefined ? statusOrder[a.session_status] : 3;
        const bOrder = statusOrder[b.session_status] !== undefined ? statusOrder[b.session_status] : 3;
        return aOrder - bOrder;
    });
    totalFilteredSessions = 0; 
    renderHeaderStatsBar();
    render();
}

function renderHeaderStatsBar() {
    const headerBarDOM = document.getElementById('headerStatsBar');
    if (!headerBarDOM) return;
    // Count statistics from filteredCourses
    let online = 0, hybrid = 0, offline = 0;
    filteredCourses.forEach(c => {
        if (c.session_status === 'online') online++;
        else if (c.session_status === 'hybrid') hybrid++;
        else if (c.session_status === 'offline') offline++;
    });
    headerBarDOM.innerHTML = `
  <div class="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 w-full mb-4">
    <div class="flex flex-row gap-2 md:gap-4 items-center justify-start md:w-1/3">
      <span class="legend-color-box border-tt-magenta px-2">Online: <span>${online}</span></span>
      <span class="legend-color-box border-tt-light-blue px-2">Hybrid: <span>${hybrid}</span></span>
      <span class="legend-color-box border-tt-grey-1 px-2">Offline: <span>${offline}</span></span>
    </div>
    <div class="flex flex-row items-center justify-center md:w-1/3 w-full">
      <span id="resultsCounter" class="text-tt-dark-blue font-semibold text-center w-full">${uiTexts.resultsFound[currentLanguage](filteredCourses.length)}</span>
    </div>
    <div class="flex flex-row items-center justify-end md:w-1/3 w-full">
      <div id="viewToggleButtonContainer" class="flex items-center"></div>
    </div>
  </div>
`;
}

function updateURLParameters() {
    const params = new URLSearchParams();
    if (activeFilters.school) params.set('faculty', activeFilters.school);
    if (activeFilters.institute) {
        const relevantCourse = allCourses.find(c => c.institute_name === activeFilters.institute);
        if (relevantCourse) {
            params.set('institutecode', relevantCourse.institute_code);
        }
    }
    if (activeFilters.group) params.set('group', activeFilters.group);
    
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    history.replaceState({}, '', newUrl);
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
    const instructors = (course.instructors || []).map(i => i.name).filter(Boolean).join(', ');

    // Use first character of institute_code to get school name from FACULTY_INFO
    let schoolInstituteHTML = '';
    if (course.institute_code && typeof course.institute_code === 'string') {
        const schoolCode = course.institute_code[0];
        const facultyObj = FACULTY_INFO[schoolCode];
        const schoolName = facultyObj ? facultyObj[currentLanguage] : course.school_name || schoolCode;
        const displayString = `${schoolName} | ${course.institute_code}`;
        schoolInstituteHTML = `<span class="bg-gray-200 text-gray-700 px-2 py-0.5 rounded">${displayString}</span>`;
    }
    
    const studyPrograms = currentLanguage === 'et' ? course.study_programmes_et : course.study_programmes_en;
    let studyProgramsHTML = '';
    if (studyPrograms && studyPrograms.length > 0) {
        const title = currentLanguage === 'et' ? 'Õppekavad' : 'Study Programmes';
        const programListItems = studyPrograms.map(p => `<li>${p.kavaversioonikood} (${p.ainekv})</li>`).join('');
        studyProgramsHTML = `
            <h4 class="font-semibold tt-dark-blue mt-4 mb-1 headline">${title}</h4>
            <ul class="list-disc list-inside body-text">${programListItems}</ul>
        `;
    }

    let langTag = '';
    if (course.keel_et === "1" && course.keel_en === "1") langTag = 'ET+EN';
    else if (course.keel_et === "1") langTag = 'ET'; else if (course.keel_en === "1") langTag = 'EN';
    const timetableLinkHTML = course.timetable_link ? `<a href="${course.timetable_link}" target="_blank" rel="noopener noreferrer" class="text-tt-magenta hover:underline text-sm font-normal"><i class="fas fa-calendar-alt fa-fw"></i> Tunniplaan</a>` : '';
    
    let borderClass = 'border-tt-grey-1';
    if (course.session_status === 'online') borderClass = 'border-tt-magenta session-card-online';
    else if (course.session_status === 'hybrid') borderClass = 'border-tt-light-blue session-card-hybrid';
    else if (course.session_status === 'offline') borderClass = 'border-tt-grey-1 session-card-offline';
    return `<div class="bg-white rounded-lg shadow-md border ${borderClass} overflow-hidden flex flex-col h-full">
                <div class="p-4 flex-grow">
                    <div class="flex justify-between items-start mb-1">
                        <h2 class="text-lg proxima-nova-bold uppercase flex-grow pr-2"><a href="${course.course_card_link || '#'}" target="_blank" class="text-tt-magenta hover:underline">${course.id || ''} - ${name}</a></h2>
                        <div class="text-right flex-shrink-0">${timetableLinkHTML}</div>
                    </div>
                    ${nameOtherLang && name.toLowerCase() !== nameOtherLang.toLowerCase() ? `<h3 class="text-md text-gray-700 font-semibold mb-2">${nameOtherLang}</h3>` : ''}
                    ${instructors ? `<p class="text-sm text-gray-600 mb-2"><i class="fas fa-chalkboard-teacher fa-fw text-gray-400"></i> ${instructors}</p>` : ''}
                    <div class="mb-3 flex flex-wrap gap-2 items-center text-xs font-semibold">
                        ${schoolInstituteHTML}
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
                    <p><strong>${uiTexts.assessment[currentLanguage]}:</strong> ${currentLanguage === 'et' ? course.assessment_form_et : (course.assessment_form_en || 'N/A')}</p>
                    ${course.session_status ? `
                        <div class="mt-3 mb-2">
                            <strong>${currentLanguage === 'et' ? 'Sessiooni staatus' : 'Session Status'}:</strong>
                            <span class="session-status-tag session-status-${course.session_status}">
                                ${course.session_status === 'online' ? (currentLanguage === 'et' ? 'Veebipõhine' : 'Online') :
                                  course.session_status === 'offline' ? (currentLanguage === 'et' ? 'Kohapeal' : 'Offline') :
                                  (currentLanguage === 'et' ? 'Hübriid' : 'Hybrid')}
                            </span>
                            ${course.session_details ? `
                                <div class="session-details-list mt-1">
                                    ${course.session_details.online_weeks ? `<div><strong>${currentLanguage === 'et' ? 'Veebiõpe nädalad' : 'Online weeks'}:</strong> ${course.session_details.online_weeks}</div>` : ''}
                                    ${course.session_details.offline_weeks ? `<div><strong>${currentLanguage === 'et' ? 'Kontaktõpe nädalad' : 'Offline weeks'}:</strong> ${course.session_details.offline_weeks}</div>` : ''}
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                    ${course.comment ? `<div class="mt-2"><strong>${currentLanguage === 'et' ? 'Kommentaar' : 'Comment'}:</strong> ${course.comment}</div>` : ''}
                    ${studyProgramsHTML}
                </div>
            </div>`;
}

function renderCardView(courses) {
    // Remove direct reference to resultsCounterDOM, as resultsCounter is now inside headerStatsBar
    const resultsCounterEl = document.getElementById('resultsCounter');
    if (resultsCounterEl) {
        resultsCounterEl.textContent = uiTexts.resultsFound[currentLanguage](courses.length);
    }
    if (courses.length === 0) {
        courseListContainerDOM.innerHTML = `<p class="text-center text-tt-grey-1 col-span-full">${uiTexts.noCoursesFound[currentLanguage]}</p>`;
        return;
    }
    // Group and sort courses by session_status and course code
    const statusOrder = ['online', 'hybrid', 'offline'];
    const grouped = { online: [], hybrid: [], offline: [] };
    courses.forEach(course => {
        const status = course.session_status || 'offline';
        if (grouped[status]) grouped[status].push(course);
        else grouped['offline'].push(course); // fallback
    });
    // Sort each group by course code
    statusOrder.forEach(status => {
        grouped[status].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    });
    // Render grouped cards without headings
    let html = '';
    statusOrder.forEach(status => {
        if (grouped[status].length > 0) {
            html += grouped[status].map(createCourseCardHTML).join('');
        }
    });
    courseListContainerDOM.innerHTML = html;
    document.querySelectorAll('.expand-button').forEach(button => {
        if (button.dataset.listener) return;
        button.addEventListener('click', () => {
            const cardRoot = button.closest('.flex-col'), content = cardRoot.querySelector('.expandable-content'), desc = cardRoot.querySelector('.course-description');
            if (!content || !desc) return;
            const icon = button.querySelector('i'), span = button.querySelector('span'), isHidden = content.classList.contains('hidden');
            content.classList.toggle('hidden');
            desc.classList.toggle('max-h-20', !isHidden);
            button.setAttribute('aria-expanded', isHidden);
            icon.className = isHidden ? 'fas fa-minus' : 'fas fa-plus';
            span.textContent = isHidden ? ` ${uiTexts.showLess[currentLanguage]}` : ` ${uiTexts.showMore[currentLanguage]}`;
        });
        button.dataset.listener = 'true';
    });
}

async function toggleCalendarView() {
    document.getElementById('loadingText').textContent = uiTexts.loadingCalendarText[currentLanguage];
    loadingIndicatorDOM.classList.remove('hidden');
    try {
        const courseIds = filteredCourses.map(course => course.id).join(',');
        if (!courseIds) {
            totalFilteredSessions = 0;
            throw new Error("No courses selected.");
        }
        const response = await fetch(`/.netlify/functions/getTimetable?courses=${courseIds}`);
        if (!response.ok) throw new Error(`Server returned status ${response.status}`);
        const filteredTimetableData = await response.json();
        totalFilteredSessions = filteredTimetableData.length;
        if (totalFilteredSessions > CALENDAR_SESSION_LIMIT) {
            updateViewToggleButton(); 
            throw new Error("Calendar limit exceeded after fetching.");
        }
        mergeTimetableData(filteredTimetableData);
    } catch(error) {
        console.error("Failed to load calendar data:", error);
    } finally {
        loadingIndicatorDOM.classList.add('hidden');
    }
    isCalendarViewVisible = true;
    calendarDate = new Date(SEMESTER_START);
    applyAllFiltersAndRender(false);
}

function updateViewToggleButton() {
    // Use headerStatsBar as the container for the button
    const headerBarDOM = document.getElementById('headerStatsBar');
    if (!headerBarDOM) return;
    let buttonHTML = '';
    if (isCalendarViewVisible) {
        buttonHTML = `<button id="toggleViewBtn" class="px-3 py-1 rounded text-sm font-medium bg-tt-magenta text-white hover:bg-opacity-80"><i class="fas fa-arrow-left mr-1"></i> ${uiTexts.backToCourses[currentLanguage]}</button>`;
    } else if (totalFilteredSessions > CALENDAR_SESSION_LIMIT) {
        buttonHTML = `<div class="flex flex-col items-end"><button class="px-3 py-1 rounded text-sm font-medium bg-gray-400 text-white cursor-not-allowed" disabled><i class="fas fa-calendar-week mr-1"></i> ${uiTexts.showCalendarView[currentLanguage]}</button><p class="text-xs text-red-600 mt-1 text-right">${uiTexts.calendarLimitExceeded[currentLanguage](totalFilteredSessions)}</p></div>`;
    } else {
        buttonHTML = `<button id="toggleViewBtn" class="px-3 py-1 rounded text-sm font-medium bg-tt-dark-blue text-white hover:bg-tt-dark-blue-hover"><i class="fas fa-calendar-week mr-1"></i> ${uiTexts.showCalendarView[currentLanguage]}</button>`;
    }
    // Find the button container inside headerStatsBar and update it
    const buttonContainer = headerBarDOM.querySelector('#viewToggleButtonContainer');
    if (buttonContainer) {
        buttonContainer.innerHTML = buttonHTML;
        const toggleBtn = buttonContainer.querySelector('#toggleViewBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', isCalendarViewVisible ? () => { isCalendarViewVisible = false; render(); } : toggleCalendarView);
        }
    }
}

function calculateOverlaps(daySessions) {
    if (!daySessions || daySessions.length === 0) return;
    daySessions.forEach(s => { s.startMin = timeToMinutes(s.start) || 0; s.endMin = timeToMinutes(s.end) || 0; });
    daySessions.sort((a, b) => a.startMin - b.startMin);
    daySessions.forEach(s => s.processed = false);
    const groups = [];
    for (const session of daySessions) {
        if (session.processed) continue;
        const currentGroup = []; const queue = [session]; session.processed = true; let head = 0;
        while(head < queue.length) {
            const currentSession = queue[head++];
            currentGroup.push(currentSession);
            for (const otherSession of daySessions) {
                if (!otherSession.processed && currentSession.startMin < otherSession.endMin && currentSession.endMin > otherSession.startMin) {
                    otherSession.processed = true; queue.push(otherSession);
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
    let allSessions = filteredCourses.flatMap(c => (c.sessions || []).map(s => ({...s, aine: `${c.id} - ${currentLanguage === 'et' ? c.name_et : (c.name_en || c.name_et)}`})));
    if (activeFilters.group) {
        const groupFilter = activeFilters.group.toLowerCase();
        allSessions = allSessions.filter(s => (s.groups || []).some(g => g.group && g.group.toLowerCase() === groupFilter));
    }
    // Deduplicate sessions by unique key: course_id, date, start, end, room
    const sessionKey = s => `${s.course_id || s.id}_${s.date}_${s.start}_${s.end}_${s.room}`;
    const uniqueSessionMap = new Map();
    allSessions.forEach(s => {
        if (!s.date) return;
        const key = sessionKey(s);
        if (!uniqueSessionMap.has(key)) {
            uniqueSessionMap.set(key, {...s});
        } else {
            // Merge groups for duplicate sessions
            const existing = uniqueSessionMap.get(key);
            if (Array.isArray(existing.groups) && Array.isArray(s.groups)) {
                // Merge group objects by group name
                const allGroups = [...existing.groups, ...s.groups];
                // Remove duplicates by group name and status
                const groupMap = new Map();
                allGroups.forEach(g => {
                    if (g && g.group) {
                        groupMap.set(g.group + '_' + g.status, g);
                    }
                });
                existing.groups = Array.from(groupMap.values());
            }
        }
    });
    const sessionsByDate = new Map();
    uniqueSessionMap.forEach(s => {
        const sessionDate = parseDate(s.date);
        if (isNaN(sessionDate.getTime())) return;
        const dateKey = sessionDate.toISOString().split('T')[0];
        if (!sessionsByDate.has(dateKey)) sessionsByDate.set(dateKey, []);
        sessionsByDate.get(dateKey).push({...s});
    });
    sessionsByDate.forEach(calculateOverlaps);
    sessionDataCache = sessionsByDate;
    return sessionsByDate;
}

function renderWeeklyView() {
        // --- Tooltip HTML generator ---
        function buildSessionTooltipHTML({ name, instructors, type, start, end, room, mandatoryGroups, electiveGroups, comment, showTimeAndRoom }) {
            let tooltipHTML = `<div class="tooltip-title">${name}</div>`;
            tooltipHTML += `<div>${instructors}</div>`;
            tooltipHTML += `<div class="text-gray-300">${type || ''}</div>`;
            if (showTimeAndRoom) {
                // Format time as '12:00 - 13:00'
                const timeStr = (start && end) ? `${start} - ${end}` : '';
                if (timeStr) tooltipHTML += `<div><strong>Time:</strong> ${timeStr}</div>`;
                if (room) tooltipHTML += `<div><strong>Room:</strong> ${room}</div>`;
            }
            if (comment) {
                tooltipHTML += `<div class="text-gray-400">${comment}</div>`;
            }
            // Bilingual group labels
            const mandatoryLabel = currentLanguage === 'et' ? 'Kohustuslik rühmadele:' : 'Mandatory for groups:';
            const electiveLabel = currentLanguage === 'et' ? 'Valikuline rühmadele:' : 'Elective for groups:';
            if (mandatoryGroups && mandatoryGroups.length > 0) {
                tooltipHTML += `<div class="tooltip-section-title">${mandatoryLabel}</div><ul class="tooltip-group-list">`;
                mandatoryGroups.forEach(g => { tooltipHTML += `<li>${g}</li>`; });
                tooltipHTML += `</ul>`;
            }
            if (electiveGroups && electiveGroups.length > 0) {
                tooltipHTML += `<div class="tooltip-section-title">${electiveLabel}</div><ul class="tooltip-group-list">`;
                electiveGroups.forEach(g => { tooltipHTML += `<li>${g}</li>`; });
                tooltipHTML += `</ul>`;
            }
            return tooltipHTML;
        }
    sessionDataCache = null;
    const sessionsByDate = getSessionData();
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

    weeklyViewDOM.innerHTML = `<div class="mb-4">${todayStatusHTML}</div><div class="flex justify-between items-center mb-4 gap-4"><div id="dateRangeDisplay" class="text-xl font-bold text-tt-dark-blue text-left flex-grow"></div><div class="flex items-center gap-2"><button id="prevMonthBtn" class="p-2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200" title="Eelmine kuu"><i class="fas fa-angle-double-left"></i></button><button id="prevWeekBtn" class="p-2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200" title="Eelmine nädal"><i class="fas fa-angle-left"></i></button><button id="todayBtn" class="px-3 py-1.5 rounded text-sm font-medium bg-tt-dark-blue text-white hover:bg-tt-dark-blue-hover">${uiTexts.today[currentLanguage]}</button><button id="nextWeekBtn" class="p-2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200" title="Järgmine nädal"><i class="fas fa-angle-right"></i></button><button id="nextMonthBtn" class="p-2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200" title="Järgmine kuu"><i class="fas fa-angle-double-right"></i></button></div></div><div id="veebiopeSection"></div><div id="calendarContent" class="calendar-grid-wrapper"></div>`;

    const calendarContent = document.getElementById('calendarContent');
    const veebiopeSection = document.getElementById('veebiopeSection');
    const dateRangeDisplay = document.getElementById('dateRangeDisplay');

    const updateCalendar = () => {
        const startDate = new Date(calendarDate);
        startDate.setDate(startDate.getDate() - (startDate.getDay() + 6) % 7);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        const studyWeek = getStudyWeek(startDate);
        const weekTextEt = studyWeek ? ` (${studyWeek}. õppenädal)` : '', weekTextEn = studyWeek ? ` (Study Week ${studyWeek})` : '';
        dateRangeDisplay.textContent = currentLanguage === 'et' ? `${startDate.getDate()}. ${startDate.toLocaleDateString('et-EE', {month:'short'}).replace('.','')} - ${endDate.getDate()}. ${endDate.toLocaleDateString('et-EE', {month:'short'}).replace('.','')} ${endDate.getFullYear()}${weekTextEt}` : `${startDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} - ${endDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}, ${endDate.getFullYear()}${weekTextEn}`;
        const dayNames = currentLanguage === 'et' ? ['E','T','K','N','R','L','P'] : ['M','T','W','T','F','S','S'];
        const totalHours = END_HOUR - START_HOUR;
        let hasAnySessionThisWeek = false;

        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            weekDates.push(d.toISOString().split('T')[0]);
        }
        // Collect all online sessions (is_veebiope ===True) BEFORE date filtering
        let allSessions = filteredCourses.flatMap(c => (c.sessions || []).map(s => ({
            ...s,
            aine: `${c.id} - ${currentLanguage === 'et' ? c.name_et : (c.name_en || c.name_et)}`
        })));
        console.log('[Online filter] activeFilters.group:', activeFilters.group);
        let veebiopeSessions = allSessions.filter(session => {
            if (session.is_veebiope !== true) return false;
            if (!activeFilters.group) return true;
            const groupsArr = session.groups || [];
            const onlyGroup = groupsArr.length === 1 && groupsArr[0].group && groupsArr[0].group.toLowerCase() === activeFilters.group.toLowerCase();
            if (!onlyGroup) {
                console.log('[Online filter] SKIP: not only group', activeFilters.group, 'in', groupsArr.map(x => x.group));
            } else {
                console.log('[Online filter] ONLY GROUP MATCH:', activeFilters.group, 'in', groupsArr.map(x => x.group));
            }
            return onlyGroup;
        });
        console.log('[Online filter] veebiopeSessions after filter:', veebiopeSessions.map(s => ({aine: s.aine, groups: s.groups ? s.groups.map(g => g.group) : []})));
        console.log('Online sessions found for calendar view:', veebiopeSessions);

        // Remove is_veebiope sessions from the main calendar grid
        weekDates.forEach(dateKey => {
            let daySessions = sessionsByDate.get(dateKey) || [];
            sessionsByDate.set(dateKey, daySessions.filter(session => session.is_veebiope !== true));
        });

        // Render online (is_veebiope) section
        if (veebiopeSessions.length > 0) {
            // Use flex row: header left, cards right
            let veebiopeHTML = `<div class="veebiope-row" style="display:flex; align-items:flex-start; gap:16px;">`;
            veebiopeHTML += `<div class="veebiope-header" style="font-weight:bold; font-size:1.1em; margin-right:16px; min-width:120px;">Online Sessions</div>`;
            veebiopeHTML += `<div class="veebiope-list" style="display:flex; flex-wrap:wrap; gap:16px;">`;
            veebiopeSessions.forEach(session => {
                const name = session.aine || '';
                const instructors = Array.isArray(session.instructor) ? session.instructor.map(i => i.name).filter(Boolean).join(' | ') : (session.instructor?.name || '');
                const commentText = session.comment ? `<div style='font-size:0.95em; color:#888;'>${session.comment}</div>` : '';
                let mandatoryGroups = (session.groups || []).filter(g => g.ainekv === 'kohustuslik').map(g => g.group);
                let electiveGroups = (session.groups || []).filter(g => g.ainekv === 'valikuline').map(g => g.group);
                let tooltipHTML = buildSessionTooltipHTML({
                    name,
                    instructors,
                    type: session.type,
                    start: session.start,
                    end: session.end,
                    room: session.room,
                    mandatoryGroups,
                    electiveGroups,
                    comment: session.comment,
                    showTimeAndRoom: false // online session, do not show time/room
                });
                tooltipHTML += `<div style='margin-top:0.5em;'>`;
                tooltipHTML += `<div><strong>Time:</strong> ${session.start || ''} - ${session.end || ''}</div>`;
                tooltipHTML += `<div><strong>Room:</strong> ${session.room || 'N/A'}</div>`;
                tooltipHTML += `</div>`;
                veebiopeHTML += `<div class="veebiope-card" data-tooltip="${encodeURIComponent(tooltipHTML)}" style="background:#fff; border-left:4px solid #4dbed2; box-shadow:0 1px 4px #eee; padding:12px 16px; min-width:220px; max-width:320px; margin-bottom:8px;">
                    <div style="font-weight:bold;">${name}</div>
                    <div style="font-size:0.95em; color:#444;">${session.type || ''}</div>
                    <div style="font-size:0.95em; color:#444;">${instructors}</div>
                    ${commentText}
                </div>`;
            });
            veebiopeHTML += `</div></div>`;
            veebiopeSection.innerHTML = veebiopeHTML;

            // Tooltip hover logic for .veebiope-card
            const tooltipDiv = customTooltipDOM;
            veebiopeSection.querySelectorAll('.veebiope-card').forEach(card => {
                card.addEventListener('mouseenter', function(e) {
                    const tooltipHTML = decodeURIComponent(card.getAttribute('data-tooltip'));
                    tooltipDiv.innerHTML = tooltipHTML;
                    tooltipDiv.style.display = 'block';
                    const rect = card.getBoundingClientRect();
                    tooltipDiv.style.position = 'fixed';
                    tooltipDiv.style.left = `${rect.right + 10}px`;
                    tooltipDiv.style.top = `${rect.top}px`;
                    tooltipDiv.style.zIndex = 9999;
                });
                card.addEventListener('mouseleave', function(e) {
                    tooltipDiv.style.display = 'none';
                });
            });
        } else {
            veebiopeSection.innerHTML = '';
        }

        // --- Main calendar grid ---
        let gridHTML = `<div class="calendar-grid"><div class="time-ruler-header"></div>`;
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(startDate); dayDate.setDate(dayDate.getDate() + i);
            gridHTML += `<div class="grid-header-cell">${dayNames[i]} ${dayDate.getDate()}.${String(dayDate.getMonth()+1).padStart(2,'0')}</div>`;
        }
        gridHTML += `<div class="time-ruler-body" style="height:${totalHours * HOUR_HEIGHT_PX}px">`;
        for (let h = START_HOUR ; h <= END_HOUR; h++) gridHTML += `<div class="time-grid-ruler-hour" style="top:${(h-START_HOUR)*HOUR_HEIGHT_PX}px;">${String(h).padStart(2,'0')}:00</div>`;
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
                if (activeFilters.group && session.groups) {
                    const groupInfo = session.groups.find(g => g.group === activeFilters.group);
                    if (groupInfo) {
                        console.log('groupInfo:', groupInfo); // Add this line
                        if (groupInfo.ainekv === 'valikuline') borderColor = '#4dbed2';
                        else if (groupInfo.ainekv === 'kohustuslik') borderColor = '#e4067e';
                    }
                }
                const getInstructorDisplayName = (instr) => {
                    if (!instr || !instr.name) return 'N/A';
                    if (Array.isArray(instr)) return instr.map(i => i.name).filter(Boolean).join(', ');
                    return instr.name;
                };
                const mandatoryGroups = (session.groups || []).filter(g => g.ainekv === 'kohustuslik').map(g => g.group);
                const electiveGroups = (session.groups || []).filter(g => g.ainekv === 'valikuline').map(g => g.group);
                const displayInstructors = getInstructorDisplayName(session.instructor);
                let tooltipHTML = buildSessionTooltipHTML({
                    name: session.aine || '',
                    instructors: displayInstructors,
                    type: session.type,
                    start: session.start,
                    end: session.end,
                    room: session.room,
                    mandatoryGroups,
                    electiveGroups,
                    comment: session.comment,
                    showTimeAndRoom: true // calendar session, show time/room
                });
                gridHTML += `<div class="session-card" data-tooltip="${encodeURIComponent(tooltipHTML)}" style="top: ${top}px; height: ${height}px; left: ${left}; width: ${width}; border-left-color: ${borderColor}"><div class='session-card-content'><div class='course-name truncate'>${session.aine || ''}</div><div class='session-details truncate'>${displayInstructors}</div><div class='session-details'>${session.start || ''} - ${session.end || ''}</div><div class='session-details truncate'><i class='fas fa-map-marker-alt fa-fw text-gray-400'></i> ${session.room || 'N/A'}</div></div></div>`;
                // Add weeks and comment to session card
                let commentText = session.comment ? `<div class='session-details' style='color:#888;'>${session.comment}</div>` : '';
                gridHTML += `<div class="session-card" data-tooltip="${encodeURIComponent(tooltipHTML)}" style="top: ${top}px; height: ${height}px; left: ${left}; width: ${width}; border-left-color: ${borderColor}"><div class='session-card-content'><div class='course-name truncate'>${session.aine || ''}</div><div class='session-details truncate'>${displayInstructors}</div><div class='session-details'>${session.start || ''} - ${session.end || ''}</div><div class='session-details truncate'><i class='fas fa-map-marker-alt fa-fw text-gray-400'></i> ${session.room || 'N/A'}</div>${commentText}</div></div>`;
            });
            gridHTML += `</div>`;
        }
        gridHTML += `</div>`;
        calendarContent.innerHTML = gridHTML;
        if (!hasAnySessionThisWeek) calendarContent.innerHTML += `<p class="text-center text-tt-grey-1 p-8">${uiTexts.noSessionsThisPeriod[currentLanguage]}</p>`;
    };
    document.getElementById('todayBtn').addEventListener('click', () => { calendarDate = new Date(); updateCalendar(); });
    document.getElementById('prevWeekBtn').addEventListener('click', () => { calendarDate.setDate(calendarDate.getDate() - 7); updateCalendar(); });
    document.getElementById('nextWeekBtn').addEventListener('click', () => { calendarDate.setDate(calendarDate.getDate() + 7); updateCalendar(); });
    document.getElementById('prevMonthBtn').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); updateCalendar(); });
    document.getElementById('nextMonthBtn').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); updateCalendar(); });
    updateCalendar();
}
        facultyToGroupsMap = new Map();
function setupSearchableDropdown(inputId, listId, data, onSelect) {
    const input = document.getElementById(inputId), list = document.getElementById(listId);
    const populateList = (items) => { list.innerHTML = items.map(item => `<div class="searchable-dropdown-list-item" data-value="${item}">${item}</div>`).join(''); };
    input.addEventListener('input', () => { const term = input.value.toLowerCase(); populateList(data.filter(item => item.toLowerCase().includes(term))); list.classList.remove('hidden'); });
    input.addEventListener('focus', () => { if(!input.disabled) { if(input.value === '') populateList(data); list.classList.remove('hidden'); } });
    list.addEventListener('click', e => { if (e.target.matches('.searchable-dropdown-list-item')) { const value = e.target.dataset.value; input.value = value; onSelect(value); list.classList.add('hidden'); } });
    document.addEventListener('click', e => { if (!e.target.closest(`#${inputId}, #${listId}`)) list.classList.add('hidden'); });
}

function populateFilterOptions() {
    function toTitleCase(str) { return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
    const schools = Array.from(allSchoolNames.entries()).map(([code, names]) => ({ code, name: toTitleCase(names[currentLanguage] || names['et']) }));
    schools.sort((a, b) => a.name.localeCompare(b.name));
    const populateSelect = (el, data, label) => {
        const c = el.value;
        el.innerHTML = `<option value="">${label}</option>`;
        data.forEach(i => i.code && i.name && el.add(new Option(i.name, i.code)));
        el.value = c;
    };
    populateSelect(schoolFilterDOM, schools, uiTexts.allSchools[currentLanguage]);
    const assForms = [...new Set(allCourses.map(c => c.assessment_form_et).filter(Boolean))].sort();
    const assFormSelect = assessmentFormFilterDOM; const currentAss = assFormSelect.value;
    assFormSelect.innerHTML = `<option value="">${uiTexts.allAssessmentForms[currentLanguage]}</option>`;
    assForms.forEach(i => assFormSelect.add(new Option(i,i))); assFormSelect.value = currentAss;
    updateDependentFilters();
}

function updateDependentFilters() {
    const schoolCode = schoolFilterDOM.value;
    instituteFilterDOM.disabled = !schoolCode;
    let institutes = new Set();
    let relevantGroups = [];
    if (schoolCode) {
        // Only include institutes whose code starts with the faculty code
        allCourses.forEach(course => {
            if (course.institute_code && course.institute_code.startsWith(schoolCode) && course.institute_name) {
                institutes.add(course.institute_name);
            }
        });
        // Only include groups that are mapped to the selected faculty and actually exist in courses of that faculty
        const validGroups = new Set();
        allCourses.forEach(course => {
            if (course.school_code === schoolCode && Array.isArray(course.groups)) {
                course.groups.forEach(group => {
                    if (facultyToGroupsMap.has(schoolCode) && facultyToGroupsMap.get(schoolCode).has(group)) {
                        validGroups.add(group);
                    }
                });
            }
        });
        relevantGroups = [...validGroups].sort();
    } else {
        // If no faculty selected, show all institutes and all groups
        allCourses.forEach(course => {
            if (course.institute_name) {
                institutes.add(course.institute_name);
            }
        });
        relevantGroups = allUniqueGroups;
    }
    const currentInstitute = activeFilters.institute;
    instituteFilterDOM.innerHTML = `<option value="">${uiTexts.allInstitutes[currentLanguage]}</option>`;
    [...institutes].sort().forEach(i => instituteFilterDOM.add(new Option(i, i)));
    instituteFilterDOM.value = currentInstitute;
    groupFilterInput.value = activeFilters.group || '';
    setupSearchableDropdown('groupFilterInput', 'groupFilterList', relevantGroups, value => {
        activeFilters.group = value; 
        applyAllFiltersAndRender(false);
        updateURLParameters();
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
    if (type === 'searchTerm') document.getElementById('searchInput').value = '';
    else if (type === 'group') document.getElementById(`${type}FilterInput`).value = '';
    else if (type === 'eap' || type === 'teachingLanguage') document.querySelector(`input[name="${type}Filter"][value=""]`).checked = true;
    else { const el = document.getElementById(`${type}Filter`); if (el) el.value = ''; }
    if (type === 'school') { activeFilters.institute = ''; document.getElementById('instituteFilter').value = ''; }
    applyAllFiltersAndRender(false);
    updateDependentFilters();
    updateURLParameters();
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
        if (el && uiTexts[key][currentLanguage] && typeof uiTexts[key][currentLanguage] !== 'function') {
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
    document.getElementById('langIndicator').textContent = currentLanguage === 'et' ? 'ET' : 'EN';
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
    document.getElementById('resetSearchButton').addEventListener('click', () => {
        history.replaceState({}, '', window.location.pathname);
        clearAllFilters();
    });
    searchInputDOM.addEventListener('input', debounce(() => { activeFilters.searchTerm = searchInputDOM.value; activeFilters.searchFieldType = searchFieldSelectorDOM.value; applyAllFiltersAndRender(); }, 300));
    
    schoolFilterDOM.addEventListener('change', e => { 
        activeFilters.school = e.target.value; 
        activeFilters.institute = ''; 
        activeFilters.group = '';
        updateDependentFilters(); 
        applyAllFiltersAndRender(false); 
        updateURLParameters();
    });
    instituteFilterDOM.addEventListener('change', e => { 
        activeFilters.institute = e.target.value; 
        applyAllFiltersAndRender(false); 
        updateURLParameters();
    });

    assessmentFormFilterDOM.addEventListener('change', e => { activeFilters.assessmentForm = e.target.value; applyAllFiltersAndRender(); });
    groupFilterInput.addEventListener('input', (e) => { if (e.target.value === '' && activeFilters.group) { removeFilter('group'); } });
    eapFilterRadiosDOM.forEach(r => r.addEventListener('change', e => { activeFilters.eap = e.target.value; applyAllFiltersAndRender(); }));
    languageFilterRadiosDOM.forEach(r => r.addEventListener('change', e => { activeFilters.teachingLanguage = e.target.value; applyAllFiltersAndRender(); }));
    
    filterToggleButton.addEventListener('click', () => filterPanelDOM.classList.toggle('filter-drawer-open'));
    document.getElementById('closeFilterButton').addEventListener('click', () => filterPanelDOM.classList.remove('filter-drawer-open'));
    
    document.addEventListener('click', function(event) {
        const isClickInsidePanel = filterPanelDOM.contains(event.target);
        const isClickOnToggleButton = filterToggleButton.contains(event.target);
        if (!isClickInsidePanel && !isClickOnToggleButton && filterPanelDOM.classList.contains('filter-drawer-open')) {
            filterPanelDOM.classList.remove('filter-drawer-open');
        }
    });

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
            const top = e.clientY + 15, left = e.clientX + 15;
            const rightEdge = window.innerWidth - 20, bottomEdge = window.innerHeight - 20;
            customTooltipDOM.style.left = Math.min(left, rightEdge - customTooltipDOM.offsetWidth) + 'px';
            customTooltipDOM.style.top = Math.min(top, bottomEdge - customTooltipDOM.offsetHeight) + 'px';
        }
    });
}

// --- Main app initialization ---
async function initializeApp() {
    try {
        const coursesRes = await fetch(DATA_URL_UNIFIED_COURSES);
        if (!coursesRes.ok) throw new Error(`Failed to load initial data file.`);
        const responseData = await coursesRes.json();
        allCourses = responseData.courses || [];
        window.groupToFacultyMap = responseData.groupToFacultyMap || {};
        postProcessUnifiedData();
        const params = new URLSearchParams(window.location.search);
        activeFilters.school = params.get('faculty') || '';
        const instituteCodeFromURL = params.get('institutecode') || '';
        activeFilters.group = params.get('group') || '';
        if (instituteCodeFromURL) {
            const relevantCourse = allCourses.find(c => c.institute_code === instituteCodeFromURL);
            if (relevantCourse) activeFilters.institute = relevantCourse.institute_name;
        }
        if (activeFilters.school) schoolFilterDOM.value = activeFilters.school;
        setupEventListeners();
        setLanguage('et');
        if (activeFilters.institute) instituteFilterDOM.value = activeFilters.institute;
        if (activeFilters.group) groupFilterInput.value = activeFilters.group;
        if (activeFilters.school || activeFilters.institute || activeFilters.group) {
            applyAllFiltersAndRender(false);
        }
    } catch (error) {
        console.error("Initialization failed:", error);
        courseListContainerDOM.innerHTML = `<div class="p-4 bg-red-100 text-red-800 rounded-md col-span-full"><strong>Error: Could not load initial data.</strong><br>${error.message}</div>`;
    } finally {
        loadingIndicatorDOM.classList.add('hidden');
    }
}