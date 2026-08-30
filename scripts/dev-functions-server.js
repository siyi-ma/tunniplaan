// scripts/dev-functions-server.js
//
// A local server for the Task 9 gate: serves the repository root as static
// files and dispatches /.netlify/functions/<name> to that module's exported
// handler.
//
//   node scripts/dev-functions-server.js [--port 8000]
//
// `npx netlify dev` cannot run here (npx is blocked by group policy and
// netlify-cli is not installed), and `npm run dev` is static-only — it would
// serve the page but 404 every function, so endpoint assertions would pass
// vacuously rather than fail. Hence this.
//
// THIS IS NOT NETLIFY. It does not reproduce Netlify's routing, redirects,
// payload-limit enforcement, or edge caching. It proves handler behaviour, not
// platform behaviour. The 4.5 MiB ceiling stays asserted on serialized bytes in
// the Task 6 contract test, and real CDN behaviour is confirmed on the dev
// branch deploy in Task 11.
//
// Verification tooling, not shipped code. Node built-ins only.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(ROOT, 'netlify', 'functions');
const FUNCTION_PREFIX = '/.netlify/functions/';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

function argValue(name, fallback) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return fallback;
}

// Only the fields the handlers actually read. Inventing more would let a
// handler start depending on something Netlify does not supply.
function buildEvent(parsed) {
  return {
    queryStringParameters: parsed.query && Object.keys(parsed.query).length
      ? parsed.query : {},
  };
}

async function dispatchFunction(name, parsed, response) {
  const modulePath = path.join(FUNCTIONS_DIR, `${name}.js`);
  // 404 for an unknown name, so a typo in a check fails loudly instead of
  // silently exercising nothing.
  if (!name || name.includes('/') || !fs.existsSync(modulePath)) {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'no such function', name }));
    return;
  }
  let result;
  try {
    const fn = require(modulePath);
    result = await fn.handler(buildEvent(parsed));
  } catch (error) {
    console.error(`[functions] ${name} threw:`, error && error.message);
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'handler threw' }));
    return;
  }
  // Verbatim: the gate asserts Cache-Control and Content-Type, so nothing here
  // may add, drop, normalise or override a header.
  response.writeHead(result.statusCode, result.headers || {});
  response.end(result.body === undefined ? '' : result.body);
}

function serveStatic(pathname, response) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(ROOT, relative);
  // Refuse anything that escapes the repository root.
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',   // local dev: never serve a stale asset
    });
    response.end(data);
  });
}

function main() {
  loadDotEnv(path.join(ROOT, '.env'));
  if (!process.env.NEON_DATABASE_URL) {
    console.error('NEON_DATABASE_URL is not set; function requests will return 500.');
  }
  const port = Number(argValue('port', '8000'));

  const server = http.createServer((request, response) => {
    const parsed = url.parse(request.url, true);
    if (parsed.pathname.startsWith(FUNCTION_PREFIX)) {
      dispatchFunction(parsed.pathname.slice(FUNCTION_PREFIX.length), parsed, response);
      return;
    }
    serveStatic(parsed.pathname, response);
  });

  server.listen(port, () => {
    console.log(`dev-functions-server on http://localhost:${port}`);
    console.log(`  static:    ${ROOT}`);
    console.log(`  functions: ${FUNCTION_PREFIX}<name>  ->  netlify/functions/<name>.js`);
    console.log('  NOT Netlify: no routing, redirects, payload limits or edge caching.');
  });
}

if (require.main === module) main();
module.exports = { buildEvent };
