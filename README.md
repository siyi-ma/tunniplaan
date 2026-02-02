# TalTech Tunniplaan

> A modern, bilingual course timetable viewer for Tallinn University of Technology (TalTech)

[![Netlify Status](https://api.netlify.com/api/v1/badges/YOUR-BADGE-ID/deploy-status)](https://app.netlify.com/sites/YOUR-SITE/deploys)

[**🌐 Live Demo**](https://YOUR-NETLIFY-URL.netlify.app) | [**📖 Documentation**](./CLAUDE.md)

## Overview

TalTech Tunniplaan is a student-friendly course search and timetable visualization tool for Tallinn University of Technology. The application provides an intuitive interface to browse, filter, and view schedules for approximately **1,000 courses** across **395+ student groups**.

**Key Highlights**:
- 🌍 **Bilingual Support**: Estonian (et) and English (en) interface
- 🔍 **Advanced Filtering**: Multi-criteria search across courses, instructors, groups, and more
- 📅 **Calendar View**: Weekly timetable visualization with session details
- 🎨 **Session Status Indicators**: Visual distinction between online, hybrid, and offline courses
- ⚡ **Performance Optimized**: Client-side filtering with serverless backend for session data
- 📱 **Responsive Design**: Mobile-first approach using Tailwind CSS

## Features

### Search & Filtering
- **Full-text search** across course titles, codes, keywords, and instructors
- **Comma-separated search** for multiple terms
- **Field-specific search**: Filter by course name, code, keyword, or instructor
- **Multi-criteria filters**:
  - Faculty (Teaduskond)
  - Institute (Instituut)
  - Student Group (Rühm) with searchable dropdown
  - Assessment Form (Hindamisvorm)
  - EAP Credits (3 or 6)
  - Teaching Language (Estonian/English)

### View Modes
- **Card View** (Default): Grid layout with detailed course cards
- **Calendar View**: Weekly schedule with time slots (8:00-22:00)
  - Session limit: 4,000 events (performance optimization)
  - Color-coded by session status

### Session Status Types
- 🟣 **Online** (Pink border): Fully online courses
- 🔵 **Hybrid** (Blue border): Mixed online/offline delivery
- ⚪ **Offline** (Gray border): Traditional in-person courses

### UI/UX
- Sticky header with filter toggle
- Language switcher (ET/EN)
- Active filters display with clear indicators
- Scroll-to-top button
- Loading indicators
- Sync timestamp with official TalTech timetable

## Technology Stack

### Frontend
- **HTML5**: Semantic markup
- **CSS3**: Custom styles with TalTech brand colors
- **JavaScript (ES6+)**: Vanilla JS - no framework dependencies
- **Tailwind CSS**: Utility-first CSS framework (via CDN)
- **Font Awesome**: Icon library

### Backend
- **Netlify Functions**: Serverless Node.js functions
- **Node.js**: Runtime for serverless functions

### Data Management
- **Git LFS**: Large file storage for JSON data files
- **JSON**: Course and session data format

### Development Tools
- **http-server**: Local development server
- **VS Code**: Recommended IDE with configured tasks
- **Git**: Version control

### Deployment
- **Netlify**: Continuous deployment and hosting
- **Build Hooks**: Automated deployments for main and dev branches

## Project Structure

```
tunniplaan/
├── index.html                  # Main HTML entry point
├── main.js                     # Core application logic (~1330 lines)
├── main.css                    # Custom styles and TalTech branding
├── favicon.ico                 # Site favicon
│
├── netlify/
│   ├── functions/
│   │   └── getTimetable.js    # Serverless function for session filtering
│   └── netlify.toml           # Netlify configuration
│
├── sessions.json              # Individual session/event data (~42MB, Git LFS)
├── unified_courses.json       # Course metadata with grouped sessions (~6MB, Git LFS)
│
├── .vscode/
│   ├── tasks.json            # VS Code task configurations
│   └── settings.json         # VS Code settings
│
├── docs/                     # Development logs and documentation
│   ├── CLAUDE.md            # Project documentation for Claude Code
│   └── AI_agent_comm_guidelines.md
│
├── package.json             # NPM dependencies and scripts
├── package-lock.json        # NPM lock file
├── .gitattributes          # Git LFS configuration
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## Getting Started

### Prerequisites

- **Git** with **Git LFS** installed
- **Node.js** (v14 or higher) and **npm**
- **Python 3** (for local development server) OR **http-server** npm package

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/siyi-ma/tunniplaan.git
   cd tunniplaan
   ```

2. **Install Git LFS** (if not already installed):
   ```bash
   git lfs install
   ```

3. **Pull LFS files**:
   ```bash
   git lfs pull
   ```
   This downloads the large JSON files (`sessions.json` and `unified_courses.json`).

4. **Install dependencies**:
   ```bash
   npm install
   ```

### Development

#### Method 1: VS Code Tasks (Recommended)

Press **`Ctrl+Shift+B`** to start the local server (default build task).

Or use **`Ctrl+Shift+P`** → "Tasks: Run Task" → Select:
- **Run Localhost Server** - Starts Python HTTP server on `http://localhost:8000`

#### Method 2: Command Line

**Using Python**:
```bash
python -m http.server 8000
```

**Using npm**:
```bash
npm start
```

Then open **http://localhost:8000** in your browser.

### Testing Netlify Functions Locally

```bash
# Install Netlify CLI globally
npm install -g netlify-cli

# Run local development server with functions
netlify dev
```

This allows testing the `/netlify/functions/getTimetable` endpoint locally.

## Data Management

### Large Files with Git LFS

The project uses Git LFS to manage large JSON files:

- **`sessions.json`** (~42MB): Individual session events with timestamps and locations
- **`unified_courses.json`** (~6MB): Course metadata with grouped sessions

**Important Git LFS Commands**:
```bash
# Check LFS status
git lfs ls-files

# Pull LFS files
git lfs pull

# Track new large files
git lfs track "*.json"
```

### Data Update Process

Course data is updated weekly via an external scraping process. Commit messages follow the pattern:
```
Update YYYYMMDD sessions and unified courses: X groups and Y courses
```

**Note**: Ensure `sessions.json` remains under Netlify's 50MB function size limit.

## Deployment

### Netlify Continuous Deployment

The project uses Netlify for hosting with automatic deployments:

- **Production**: `main` branch
- **Development**: `dev` branch

### Manual Deployment Triggers

#### Via VS Code Tasks

Press **`Ctrl+Shift+P`** → "Tasks: Run Task" → Select:
- **Netlify: Deploy Main Branch** - Triggers production deployment
- **Netlify: Deploy Dev Branch** - Triggers development deployment

#### Via Command Line

**Production (main branch)**:
```bash
curl -X POST -d {} https://api.netlify.com/build_hooks/6980b6f3e6f1a66c892e33ab
```

**Development (dev branch)**:
```bash
curl -X POST -d {} https://api.netlify.com/build_hooks/6980b7cb2f57c96b40fd08ab
```

## Key Architecture

### State Management
Application state is managed via global variables in `main.js`:
- `allCourses` - Complete course dataset
- `filteredCourses` - Currently filtered courses
- `currentLanguage` - Active UI language ('et' or 'en')
- `isCalendarViewVisible` - Current view mode
- `activeFilters` - Applied filter state

### Bilingual System
UI text is centralized in the `uiTexts` object:
```javascript
const uiTexts = {
  searchButtonText: { et: 'Otsi', en: 'Search' },
  resetSearchButtonText: { et: 'Lähtesta', en: 'Reset' },
  // ... all UI strings
}
```

Language switching dynamically updates all text content.

### Performance Optimization
- **Client-side filtering**: Fast, responsive filtering for 1,000+ courses
- **Calendar session limit**: 4,000 events maximum to prevent browser slowdown
- **Serverless backend**: Netlify function filters the 42MB `sessions.json` file server-side, returning only requested session data

### Session Data Flow
```
User selects courses → Client requests sessions via Netlify function
                     → Function filters sessions.json by course IDs
                     → Returns filtered JSON (~100KB instead of 42MB)
                     → Client renders calendar view
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Test locally
5. Commit with descriptive messages: `git commit -m "Add: feature description"`
6. Push to your fork: `git push origin feature/your-feature`
7. Create a Pull Request

**Coding Guidelines**:
- Follow existing code style
- Update `uiTexts` for bilingual strings
- Test both Estonian and English interfaces
- Ensure Git LFS is used for large files
- Update documentation as needed

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Older browsers may experience degraded functionality due to ES6+ JavaScript features.

## License

ISC License (see [package.json](./package.json))

---

# 🚀 Migration Plan: Vanilla JS → Modern Framework

## Overview

This section outlines a phased approach to migrate the current vanilla JavaScript application to a modern frontend framework while maintaining functionality and improving maintainability, performance, and developer experience.

## Framework Recommendation

After evaluating React, Vue, and Svelte, **Vue 3** is recommended for this project due to:

1. **Gentle Learning Curve**: Similar template syntax to current HTML structure
2. **Progressive Adoption**: Can be integrated incrementally
3. **Excellent i18n Support**: Vue I18n for bilingual functionality
4. **Performance**: Similar to React/Svelte, with Composition API
5. **Ecosystem**: Rich plugin ecosystem (Vue Router, Pinia for state, VueUse utilities)
6. **Developer Experience**: Great tooling (Vite, Vue DevTools)

**Alternative Options**:
- **React + Next.js**: Best for SEO (SSR/SSG), larger ecosystem, but more boilerplate
- **Svelte + SvelteKit**: Smallest bundle size, compiled framework, but smaller ecosystem

---

## Migration Strategy: Phased Approach

### Phase 1: Project Setup & Infrastructure (Week 1-2)

#### Goals
- Set up modern build tooling
- Establish project structure
- Configure TypeScript (optional but recommended)

#### Tasks

**1.1 Initialize Vue 3 Project with Vite**
```bash
npm create vite@latest tunniplaan-vue -- --template vue-ts
cd tunniplaan-vue
npm install
```

**1.2 Install Dependencies**
```bash
# Core dependencies
npm install vue-router@4 pinia vue-i18n@9

# UI Framework
npm install -D tailwindcss@latest postcss autoprefixer
npx tailwindcss init -p

# Utilities
npm install @vueuse/core date-fns

# Development
npm install -D @types/node
```

**1.3 Configure Tailwind CSS**

Update `tailwind.config.js`:
```javascript
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'tt-dark-blue': '#003D5C',
        'tt-dark-blue-hover': '#002A40',
        'tt-magenta': '#E1006C',
        'tt-light-blue': '#00AAD2',
        'tt-grey-1': '#6D6E71',
      },
    },
  },
  plugins: [],
}
```

**1.4 Project Structure**
```
tunniplaan-vue/
├── public/
│   ├── favicon.ico
│   └── unified_courses.json  # Move from root
│
├── src/
│   ├── assets/
│   │   └── main.css          # Migrated custom styles
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppHeader.vue
│   │   │   ├── FilterPanel.vue
│   │   │   └── ScrollTopButton.vue
│   │   ├── courses/
│   │   │   ├── CourseCard.vue
│   │   │   ├── CourseGrid.vue
│   │   │   └── CourseSearch.vue
│   │   ├── calendar/
│   │   │   ├── CalendarView.vue
│   │   │   ├── CalendarWeek.vue
│   │   │   └── CalendarEvent.vue
│   │   └── shared/
│   │       ├── LoadingIndicator.vue
│   │       └── ActiveFilters.vue
│   │
│   ├── composables/
│   │   ├── useCourses.ts      # Course data logic
│   │   ├── useFilters.ts      # Filter logic
│   │   ├── useSearch.ts       # Search logic
│   │   └── useTimetable.ts    # Calendar logic
│   │
│   ├── stores/
│   │   ├── courses.ts         # Pinia store for courses
│   │   ├── filters.ts         # Pinia store for filters
│   │   └── ui.ts              # Pinia store for UI state
│   │
│   ├── types/
│   │   ├── course.ts          # Course interfaces
│   │   ├── session.ts         # Session interfaces
│   │   └── filter.ts          # Filter interfaces
│   │
│   ├── utils/
│   │   ├── api.ts             # Netlify function calls
│   │   ├── dateUtils.ts       # Date helpers
│   │   └── constants.ts       # App constants
│   │
│   ├── i18n/
│   │   ├── index.ts           # i18n setup
│   │   ├── et.json            # Estonian translations
│   │   └── en.json            # English translations
│   │
│   ├── App.vue                # Root component
│   ├── main.ts                # Entry point
│   └── router.ts              # Vue Router config
│
├── netlify/
│   └── functions/
│       └── getTimetable.js    # Existing serverless function
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

**1.5 Git Setup**
```bash
# Keep Git LFS configuration
cp ../tunniplaan/.gitattributes .
git lfs install
git lfs track "*.json"

# Copy data files
cp ../tunniplaan/sessions.json ./netlify/functions/
```

---

### Phase 2: Core Migration (Week 3-6)

#### Goals
- Migrate state management to Pinia
- Convert main logic to Vue components
- Implement routing (if multi-page needed)

#### Tasks

**2.1 Define TypeScript Types**

`src/types/course.ts`:
```typescript
export interface GroupSession {
  group: string;
  session_status: 'online' | 'hybrid' | 'offline';
  instructors: string[];
  keel: string[];
  assessment_form: string[];
}

export interface Course {
  id: string;
  name_et: string;
  name_en: string;
  eap: number;
  school: string;
  institute: string;
  group_sessions: GroupSession[];
}

export interface CoursesData {
  courses: Course[];
  scraping_datetime: string;
}
```

**2.2 Create Pinia Stores**

`src/stores/courses.ts`:
```typescript
import { defineStore } from 'pinia'
import type { Course, CoursesData } from '@/types/course'

export const useCoursesStore = defineStore('courses', {
  state: () => ({
    allCourses: [] as Course[],
    filteredCourses: [] as Course[],
    loading: false,
    error: null as string | null,
    syncDateTime: ''
  }),

  getters: {
    courseCount: (state) => state.filteredCourses.length,
    onlineCount: (state) => state.filteredCourses.filter(c =>
      c.group_sessions.some(gs => gs.session_status === 'online')
    ).length,
    hybridCount: (state) => state.filteredCourses.filter(c =>
      c.group_sessions.some(gs => gs.session_status === 'hybrid')
    ).length,
    offlineCount: (state) => state.filteredCourses.filter(c =>
      c.group_sessions.some(gs => gs.session_status === 'offline')
    ).length,
  },

  actions: {
    async fetchCourses() {
      this.loading = true
      this.error = null
      try {
        const response = await fetch('/unified_courses.json')
        const data: CoursesData = await response.json()
        this.allCourses = data.courses
        this.filteredCourses = data.courses
        this.syncDateTime = data.scraping_datetime
      } catch (err) {
        this.error = 'Failed to load courses'
        console.error(err)
      } finally {
        this.loading = false
      }
    },

    updateFilteredCourses(courses: Course[]) {
      this.filteredCourses = courses
    }
  }
})
```

`src/stores/filters.ts`:
```typescript
import { defineStore } from 'pinia'

export const useFiltersStore = defineStore('filters', {
  state: () => ({
    searchTerm: '',
    searchField: 'all' as 'all' | 'title' | 'course_id' | 'keyword' | 'instructor',
    selectedSchool: '',
    selectedInstitute: '',
    selectedGroup: '',
    selectedAssessmentForm: '',
    selectedEAP: '',
    selectedLanguage: ''
  }),

  getters: {
    hasActiveFilters: (state) => {
      return !!(state.searchTerm || state.selectedSchool || state.selectedInstitute ||
                state.selectedGroup || state.selectedAssessmentForm ||
                state.selectedEAP || state.selectedLanguage)
    },

    activeFiltersList(state) {
      const filters = []
      if (state.searchTerm) filters.push({ key: 'search', value: state.searchTerm })
      if (state.selectedSchool) filters.push({ key: 'school', value: state.selectedSchool })
      // ... add other filters
      return filters
    }
  },

  actions: {
    resetFilters() {
      this.searchTerm = ''
      this.searchField = 'all'
      this.selectedSchool = ''
      this.selectedInstitute = ''
      this.selectedGroup = ''
      this.selectedAssessmentForm = ''
      this.selectedEAP = ''
      this.selectedLanguage = ''
    }
  }
})
```

**2.3 Create Composables for Business Logic**

`src/composables/useFilters.ts`:
```typescript
import { computed } from 'vue'
import { useCoursesStore } from '@/stores/courses'
import { useFiltersStore } from '@/stores/filters'
import type { Course } from '@/types/course'

export function useFilters() {
  const coursesStore = useCoursesStore()
  const filtersStore = useFiltersStore()

  const applyFilters = () => {
    let filtered = coursesStore.allCourses

    // Search filter
    if (filtersStore.searchTerm) {
      const terms = filtersStore.searchTerm.split(',').map(t => t.trim().toLowerCase())
      filtered = filtered.filter(course => {
        return terms.every(term => {
          switch (filtersStore.searchField) {
            case 'title':
              return course.name_et.toLowerCase().includes(term) ||
                     course.name_en.toLowerCase().includes(term)
            case 'course_id':
              return course.id.toLowerCase().includes(term)
            // ... implement other cases
            default: // 'all'
              return course.name_et.toLowerCase().includes(term) ||
                     course.name_en.toLowerCase().includes(term) ||
                     course.id.toLowerCase().includes(term)
          }
        })
      })
    }

    // School filter
    if (filtersStore.selectedSchool) {
      filtered = filtered.filter(c => c.school === filtersStore.selectedSchool)
    }

    // Institute filter
    if (filtersStore.selectedInstitute) {
      filtered = filtered.filter(c => c.institute === filtersStore.selectedInstitute)
    }

    // EAP filter
    if (filtersStore.selectedEAP) {
      filtered = filtered.filter(c => c.eap === Number(filtersStore.selectedEAP))
    }

    // Language filter
    if (filtersStore.selectedLanguage) {
      filtered = filtered.filter(c =>
        c.group_sessions.some(gs => gs.keel.includes(filtersStore.selectedLanguage))
      )
    }

    coursesStore.updateFilteredCourses(filtered)
  }

  return {
    applyFilters
  }
}
```

**2.4 Set Up i18n**

`src/i18n/index.ts`:
```typescript
import { createI18n } from 'vue-i18n'
import et from './et.json'
import en from './en.json'

const i18n = createI18n({
  legacy: false,
  locale: 'et',
  fallbackLocale: 'en',
  messages: {
    et,
    en
  }
})

export default i18n
```

`src/i18n/et.json`:
```json
{
  "search": {
    "placeholder": "Sisesta otsisõna või -sõnad...",
    "button": "Otsi",
    "reset": "Lähtesta",
    "label": "Otsisõna (eralda komaga)"
  },
  "filters": {
    "title": "Filtrid",
    "school": "Teaduskond",
    "institute": "Instituut",
    "group": "Rühm",
    "assessmentForm": "Hindamisvorm",
    "eap": "EAP",
    "language": "Õppekeel"
  }
}
```

**2.5 Create Vue Components**

`src/components/layout/AppHeader.vue`:
```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { locale, t } = useI18n()

const toggleLanguage = () => {
  locale.value = locale.value === 'et' ? 'en' : 'et'
}

const emit = defineEmits<{
  toggleFilter: []
}>()
</script>

<template>
  <header class="sticky top-0 z-50 bg-tt-dark-blue text-white p-2 shadow-md">
    <div class="container mx-auto flex items-center justify-between">
      <div class="flex items-center">
        <button
          @click="emit('toggleFilter')"
          class="mr-4 p-2 text-white hover:bg-tt-dark-blue-hover rounded"
          aria-label="Ava filtrid"
        >
          <i class="fas fa-bars fa-lg"></i>
        </button>
        <h1 class="text-2xl font-bold uppercase">
          {{ t('app.title') }}
        </h1>
      </div>
      <button
        @click="toggleLanguage"
        class="p-2 bg-tt-magenta hover:bg-opacity-80 rounded"
        aria-label="Switch language"
      >
        <i class="fas fa-globe"></i>
        <span class="ml-1">{{ locale === 'et' ? 'EN' : 'ET' }}</span>
      </button>
    </div>
  </header>
</template>
```

`src/components/courses/CourseCard.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Course } from '@/types/course'

const props = defineProps<{
  course: Course
}>()

const { locale } = useI18n()

const courseName = computed(() =>
  locale.value === 'et' ? props.course.name_et : props.course.name_en
)

const sessionStatusColor = (status: string) => {
  switch (status) {
    case 'online': return 'border-tt-magenta'
    case 'hybrid': return 'border-tt-light-blue'
    default: return 'border-tt-grey-1'
  }
}
</script>

<template>
  <div class="bg-white rounded-lg shadow-md p-4 border-l-4"
       :class="sessionStatusColor(course.group_sessions[0]?.session_status)">
    <h3 class="text-lg font-bold text-tt-dark-blue mb-2">
      {{ courseName }}
    </h3>
    <p class="text-sm text-gray-600">{{ course.id }} • {{ course.eap }} EAP</p>

    <!-- Add more course details -->
  </div>
</template>
```

---

### Phase 3: Advanced Features (Week 7-8)

#### Tasks

**3.1 Calendar View Migration**

Create `src/composables/useTimetable.ts`:
```typescript
import { ref } from 'vue'
import type { Course } from '@/types/course'

const CALENDAR_SESSION_LIMIT = 4000

export function useTimetable() {
  const sessions = ref([])
  const loading = ref(false)

  const fetchSessions = async (courseIds: string[]) => {
    if (courseIds.length === 0) return

    loading.value = true
    try {
      const response = await fetch(
        `/.netlify/functions/getTimetable?courses=${courseIds.join(',')}`
      )
      const data = await response.json()

      if (data.length > CALENDAR_SESSION_LIMIT) {
        console.warn(`Session limit exceeded: ${data.length} > ${CALENDAR_SESSION_LIMIT}`)
        sessions.value = data.slice(0, CALENDAR_SESSION_LIMIT)
      } else {
        sessions.value = data
      }
    } catch (error) {
      console.error('Failed to fetch timetable:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    sessions,
    loading,
    fetchSessions
  }
}
```

**3.2 Searchable Dropdown Component**

`src/components/shared/SearchableDropdown.vue`:
```vue
<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  options: string[]
  modelValue: string
  placeholder: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const searchTerm = ref('')
const isOpen = ref(false)

const filteredOptions = computed(() => {
  if (!searchTerm.value) return props.options
  return props.options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
})
</script>

<template>
  <div class="searchable-dropdown">
    <input
      v-model="searchTerm"
      @focus="isOpen = true"
      @blur="isOpen = false"
      type="search"
      :placeholder="placeholder"
      class="mt-1 block w-full p-2 border rounded-md shadow-sm text-sm"
    />
    <div v-if="isOpen" class="searchable-dropdown-list">
      <div
        v-for="option in filteredOptions"
        :key="option"
        @mousedown="emit('update:modelValue', option)"
        class="dropdown-item"
      >
        {{ option }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.searchable-dropdown-list {
  position: absolute;
  background: white;
  border: 1px solid #ccc;
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
}

.dropdown-item {
  padding: 8px;
  cursor: pointer;
}

.dropdown-item:hover {
  background-color: #f0f0f0;
}
</style>
```

**3.3 Add Animations**

Install animation library:
```bash
npm install @vueuse/motion
```

Use in components:
```vue
<script setup>
import { useMotion } from '@vueuse/motion'
</script>

<template>
  <div v-motion-fade-visible>
    <!-- Content -->
  </div>
</template>
```

---

### Phase 4: Testing & Optimization (Week 9-10)

#### Tasks

**4.1 Set Up Testing**

```bash
npm install -D vitest @vue/test-utils jsdom
npm install -D @vitest/ui
```

`vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
})
```

**Example Test**:
`src/composables/__tests__/useFilters.spec.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFilters } from '../useFilters'
import { useFiltersStore } from '@/stores/filters'

describe('useFilters', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('filters courses by search term', () => {
    const filtersStore = useFiltersStore()
    const { applyFilters } = useFilters()

    filtersStore.searchTerm = 'algorithm'
    applyFilters()

    // Add assertions
  })
})
```

**4.2 Performance Optimization**

- **Lazy loading routes**:
```typescript
const routes = [
  {
    path: '/',
    component: () => import('./views/Home.vue')
  }
]
```

- **Virtual scrolling for large lists**:
```bash
npm install vue-virtual-scroller
```

**4.3 Bundle Analysis**

```bash
npm install -D rollup-plugin-visualizer
```

Add to `vite.config.ts`:
```typescript
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    vue(),
    visualizer({ open: true })
  ]
})
```

---

### Phase 5: Deployment & Migration (Week 11-12)

#### Tasks

**5.1 Update Netlify Configuration**

`netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[functions]
  included_files = ["sessions.json"]
```

**5.2 Environment Variables**

`.env.production`:
```
VITE_API_URL=/.netlify/functions
VITE_APP_TITLE=TalTech Tunniplaan
```

**5.3 Deployment Strategy**

1. **Deploy to separate Netlify site** (test environment)
2. **Run parallel with existing site** for comparison
3. **Conduct user testing** with stakeholders
4. **Fix issues** based on feedback
5. **Switch DNS/domain** to new site (or replace on same Netlify site)
6. **Archive old vanilla JS codebase** in separate branch

**Deploy Command**:
```bash
npm run build
netlify deploy --prod
```

---

## Migration Checklist

### Pre-Migration
- [ ] Audit current features and create comprehensive feature list
- [ ] Set up new Vue 3 + Vite project
- [ ] Configure TypeScript, Tailwind, ESLint
- [ ] Define data types and interfaces

### Core Migration
- [ ] Migrate state management to Pinia stores
- [ ] Convert HTML to Vue SFC components
- [ ] Migrate bilingual system to Vue I18n
- [ ] Convert filtering logic to composables
- [ ] Migrate search functionality
- [ ] Convert calendar view

### Advanced Features
- [ ] Implement routing (if needed)
- [ ] Add animations and transitions
- [ ] Optimize performance (lazy loading, code splitting)
- [ ] Implement error boundaries

### Testing & QA
- [ ] Write unit tests for composables
- [ ] Write component tests
- [ ] Manual testing on all browsers
- [ ] Mobile responsiveness testing
- [ ] Accessibility audit (WCAG 2.1)

### Deployment
- [ ] Set up CI/CD pipeline
- [ ] Configure environment variables
- [ ] Deploy to staging environment
- [ ] User acceptance testing
- [ ] Production deployment
- [ ] Monitor for errors (Sentry, LogRocket)

---

## Benefits of Migration

### Developer Experience
- ✅ **Type Safety**: TypeScript catches errors at compile time
- ✅ **Modular Code**: Components and composables are reusable
- ✅ **Better Tooling**: Vue DevTools, Vite HMR, ESLint
- ✅ **Easier Testing**: Vitest integration with Vue Test Utils

### Performance
- ✅ **Faster Development**: Vite's instant HMR
- ✅ **Optimized Builds**: Tree-shaking, code splitting
- ✅ **Smaller Bundles**: Modern build tools

### Maintainability
- ✅ **Clear Structure**: Organized by feature/domain
- ✅ **Scalability**: Easy to add new features
- ✅ **Collaboration**: Standard conventions for team development

### User Experience
- ✅ **Smoother Animations**: Built-in transition system
- ✅ **Better Mobile Performance**: Optimized rendering
- ✅ **Progressive Enhancement**: Can add PWA features later

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Breaking Changes** | Thorough testing, parallel deployment, rollback plan |
| **Learning Curve** | Training sessions, pair programming, documentation |
| **Data Migration Issues** | Keep existing JSON structure, test with real data |
| **Performance Regressions** | Benchmark before/after, optimize critical paths |
| **Git LFS Compatibility** | Test LFS with new build process, verify Netlify integration |

---

## Estimated Timeline

- **Phase 1**: 2 weeks - Setup & Infrastructure
- **Phase 2**: 4 weeks - Core Migration
- **Phase 3**: 2 weeks - Advanced Features
- **Phase 4**: 2 weeks - Testing & Optimization
- **Phase 5**: 2 weeks - Deployment & Migration

**Total**: ~12 weeks (3 months) for full migration

**Minimal Viable Migration**: 6-8 weeks (focus on Phases 1-2, 5)

---

## Alternative: Incremental Migration

Instead of full rewrite, consider **micro-frontend approach**:

1. Keep existing app running
2. Build new features in Vue 3
3. Embed Vue components into vanilla JS app via Web Components
4. Gradually replace old code with new components

This reduces risk and allows for continuous delivery.

---

## Conclusion

Migrating to Vue 3 will significantly improve the codebase's maintainability, developer experience, and scalability. The phased approach minimizes risk while delivering incremental value. The investment in modern tooling and architecture will pay dividends for future development and feature additions.

**Recommended Next Steps**:
1. Review this migration plan with stakeholders
2. Set up a proof-of-concept with Phase 1
3. Migrate one critical feature (e.g., course search) as a pilot
4. Evaluate results and adjust timeline accordingly

---

**Questions or feedback?** Open an issue or contact the development team.
