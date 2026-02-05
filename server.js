const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8888;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const server = http.createServer(async (req, res) => {
    // Parse URL
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;

    // --- Backend API Mock (Replaces Netlify Function) ---
    if (pathname === '/.netlify/functions/getTimetable') {
        try {
            const requestedCoursesQuery = parsedUrl.query.courses;
            if (!requestedCoursesQuery) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify([]));
                return;
            }

            const requestedCourses = new Set(requestedCoursesQuery.split(','));
            const dataPath = path.join(process.cwd(), 'sessions.json');

            if (!fs.existsSync(dataPath)) {
                console.error('Error: sessions.json not found in project root.');
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'sessions.json not found' }));
                return;
            }

            const fileContent = await fs.promises.readFile(dataPath, 'utf-8');
            const allEvents = JSON.parse(fileContent);
            
            const filteredEvents = allEvents.filter(event => 
                requestedCourses.has(event.course_id)
            );

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(filteredEvents));
        } catch (err) {
            console.error('API Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
        return;
    }

    // --- Static File Server ---
    if (pathname === '/') pathname = '/index.html';
    
    // Security: Prevent directory traversal
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(process.cwd(), safePath);

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n--- Local Development Server ---`);
    console.log(`Server running at: http://localhost:${PORT}/`);
    console.log(`Backend API ready at: http://localhost:${PORT}/.netlify/functions/getTimetable`);
    console.log(`Press Ctrl+C to stop.\n`);
});