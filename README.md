# TalTech Tunniplaan (Course Timetable Viewer)

A web application for viewing and searching TalTech (Tallinn University of Technology) course timetables. Browse ~1000 courses across ~395 student groups with bilingual support (Estonian/English).

**Live Site**: Hosted on Netlify
**Data Update Frequency**: Weekly

## Features

- 🔍 **Advanced Search** - Search by course code, title, instructor, or keywords
- 🏛️ **Multi-Filter System** - Filter by faculty, institute, group, credits (EAP), assessment form, teaching language
- 📅 **Calendar View** - Weekly timetable view with session details
- 🌐 **Bilingual UI** - Switch between Estonian and English
- 🎨 **Session Types** - Visual indicators for online, hybrid, and offline courses
- 📱 **Responsive Design** - Works on desktop and mobile devices

## Quick Start

### Prerequisites

- Python 3.x (for local development server)
- Git with Git LFS installed (for data files)

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd tunniplaan
   ```

2. **Pull data files** (required for Git LFS)
   ```bash
   git lfs install
   git lfs pull
   ```

3. **Start local server**

   **Option 1: VS Code (Recommended)**
   - Open project in VS Code
   - Press **`Ctrl+Shift+B`**
   - Opens `http://localhost:8000` automatically

   **Option 2: Command Line**
   ```bash
   python -m http.server 8000
   ```
   - Open `http://localhost:8000` in your browser

   **Option 3: Node.js Custom Server (Supports Calendar View)**
   If you cannot use Netlify CLI or need full Calendar View functionality locally:
   ```bash
   node server.js
   ```
   - Open `http://localhost:8888` in your browser

## Development

### VS Code Tasks

We've configured convenient keyboard shortcuts in [.vscode/tasks.json](.vscode/tasks.json):

| Task | Shortcut | Description |
|------|----------|-------------|
| **Run Localhost Server** | `Ctrl+Shift+B` | Start local dev server on port 8000 |
| Netlify: Deploy Main | Run Task menu | Deploy to production (main branch) |
| Netlify: Deploy Dev | Run Task menu | Deploy to development (dev branch) |

**How to use**:
1. **Start localhost**: Press `Ctrl+Shift+B` (fastest!)
2. **Deploy to Netlify**:
   - Press `Ctrl+Shift+P`
   - Type "Run Task"
   - Select deployment task

### Project Structure

```
tunniplaan/
├── index.html              # Main HTML file
├── main.js                 # Application logic
├── server.js               # Local Node.js server (mocks Netlify functions)
├── main.css                # Custom styles
├── unified_courses.json    # Course metadata (~6MB, Git LFS)
├── sessions.json           # Session data (~42MB, Git LFS)
├── netlify/
│   └── functions/
│       └── getTimetable.js # Serverless function for calendar view
├── .vscode/
│   └── tasks.json          # VS Code tasks configuration
└── docs/                   # Development documentation
```

### Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Styling**: Tailwind CSS (CDN), custom CSS
- **Backend**: Netlify serverless functions (Node.js)
- **Hosting**: Netlify
- **Data Management**: Git LFS for large JSON files

### Data Files

Two main data files (tracked with Git LFS):
- **`unified_courses.json`** (~6MB) - Course metadata with grouped sessions
- **`sessions.json`** (~42MB) - Individual session/event data

**Important**: Always use Git LFS when working with these files.

## Deployment

### Automatic Deployments

- **Production**: Push to `main` branch
- **Development**: Push to `dev` branch

### Manual Deployments (via Build Hooks)

**VS Code** (Recommended):
1. Press `Ctrl+Shift+P`
2. Type "Run Task"
3. Select "Netlify: Deploy Main Branch" or "Netlify: Deploy Dev Branch"

**Command Line**:
```bash
# Production
curl -X POST -d {} https://api.netlify.com/build_hooks/6980b6f3e6f1a66c892e33ab

# Development
curl -X POST -d {} https://api.netlify.com/build_hooks/6980b7cb2f57c96b40fd08ab
```

## Data Updates

Course data is updated weekly via an external scraping process. After updates:
1. New JSON files are committed with Git LFS
2. Commit message format: `Update YYYYMMDD session and unified courses: X groups and Y courses`
3. Automatic deployment to Netlify

## Features in Detail

### Search Functionality

- Search by course code (e.g., "ITI0102")
- Search by title (Estonian or English)
- Search by instructor name
- Comma-separated terms for multiple searches
- Real-time filtering

### Filter System

Filter courses by:
- **Faculty (School)**: 6 faculties/schools
- **Institute**: Department/institute within faculty
- **Student Group**: ~395 groups
- **EAP Credits**: 1-24 credits
- **Assessment Form**: Exam, test, etc.
- **Teaching Language**: Estonian, English, etc.

### Calendar View

- Weekly timetable display
- Time slots: 8:00 AM - 10:00 PM
- Session limit: 4000 events (performance optimization)
- Color-coded by session type:
  - **Pink border**: Online courses
  - **Blue border**: Hybrid courses
  - **Gray border**: Offline (in-person) courses

### Bilingual Support

Toggle between Estonian and English:
- All UI elements translated
- Course information shown in selected language
- URL parameters preserved when switching

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers

## Contributing

1. Create a feature branch from `dev`
2. Make your changes
3. Test locally with `Ctrl+Shift+B`
4. Commit and push
5. Deploy to dev for testing: `Ctrl+Shift+P` → "Netlify: Deploy Dev Branch"
6. Create pull request to `dev`

## Documentation

- [CLAUDE.md](CLAUDE.md) - Technical guide for AI-assisted development
- [docs/](docs/) - Development logs and session summaries
- [docs/AI_agent_comm_guidelines.md](docs/AI_agent_comm_guidelines.md) - AI collaboration guidelines

## License

Educational project for TalTech community.

## Contact

For questions or issues, please open a GitHub issue.

---

**Last Updated**: February 2, 2026
