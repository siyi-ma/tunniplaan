// scripts/contract-test-getcourses.js
//
// The gate that proves the whole Phase 2 read path is faithful: the browser can
// reassemble, from the manifest plus every course page, an envelope identical to
// the unified_courses.json it used to download whole.
//
//   node scripts/contract-test-getcourses.js [--source-dir PATH]
//
// Needs NEON_DATABASE_URL (webapp_ro). The source directory resolves as
// --source-dir > TUNNIPLAAN_DATA_DIR > nothing, per specification 7.2.2 -- there
// is deliberately no repository-root fallback, because Phase 1 removed
// sessions.json from this repo and a silent fallback is how a contract test
// passes against the wrong data.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PAGE_BYTE_CEILING = 4.5 * 1024 * 1024;

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    // An exported variable wins over the file, as everywhere else in Phase 2.
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

function argValue(name) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  if (i !== -1) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : undefined;
}

function fail(message) {
  console.error(`CONTRACT FAILED: ${message}`);
  process.exit(1);
}

function resolveSourceDir() {
  const candidates = [
    [argValue('source-dir'), '--source-dir'],
    [process.env.TUNNIPLAAN_DATA_DIR, 'TUNNIPLAAN_DATA_DIR'],
  ];
  for (const [value, origin] of candidates) {
    if (!value) continue;
    if (!fs.existsSync(value) || !fs.statSync(value).isDirectory()) {
      fail(`${origin} points at ${value}, which is not a directory`);
    }
    return path.resolve(value);
  }
  fail('no source directory. Pass --source-dir or set TUNNIPLAAN_DATA_DIR. '
     + 'There is no repository-root fallback on purpose.');
}

// Key order and course order are presentation, not content, so both are
// canonicalised. Values and types are NOT touched: coercing them is how a
// contract test quietly stops testing the contract.
//
// The one deliberate exception is null: the ingest writes NULL for a key that was
// absent in the source, and no SQL column can distinguish "absent" from "null" on
// the way back. So a null is treated as an absent key -- on BOTH sides, which
// keeps it symmetric. A source field holding a real value against a null from the
// API still mismatches, because only one side loses the key.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === null || value[key] === undefined) continue;
      out[key] = canonical(value[key]);
    }
    return out;
  }
  return value;
}

// Bounded: names the first differing path and shows short values, never dumps a
// megabyte of JSON into a terminal.
function firstDifference(expected, actual, trail = '') {
  const short = (v) => {
    const text = JSON.stringify(v);
    if (text === undefined) return String(v);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  };
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return `${trail}: expected ${short(expected)}, got ${short(actual)}`;
    }
    if (expected.length !== actual.length) {
      return `${trail}: expected ${expected.length} items, got ${actual.length}`;
    }
    for (let i = 0; i < expected.length; i++) {
      const diff = firstDifference(expected[i], actual[i], `${trail}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of [...keys].sort()) {
      if (!(key in expected)) return `${trail}.${key}: unexpected, got ${short(actual[key])}`;
      if (!(key in actual)) return `${trail}.${key}: missing, expected ${short(expected[key])}`;
      const diff = firstDifference(expected[key], actual[key], `${trail}.${key}`);
      if (diff) return diff;
    }
    return null;
  }
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    return `${trail}: expected ${short(expected)}, got ${short(actual)}`;
  }
  return null;
}

function assertEqual(label, expected, actual) {
  const diff = firstDifference(canonical(expected), canonical(actual));
  if (diff) fail(`${label} differs at ${diff || '(root)'}`);
}

async function main() {
  loadDotEnv(path.resolve(__dirname, '..', '.env'));
  if (!process.env.NEON_DATABASE_URL) {
    fail('NEON_DATABASE_URL is not set (webapp_ro connection string)');
  }

  const sourceDir = resolveSourceDir();
  const unifiedPath = path.join(sourceDir, 'unified_courses.json');
  const sessionsPath = path.join(sourceDir, 'sessions.json');
  for (const file of [unifiedPath, sessionsPath]) {
    if (!fs.existsSync(file)) fail(`${file} does not exist`);
  }
  console.log(`Source: ${sourceDir}`);

  // The version covers both artifacts, so it cannot be derived from course
  // metadata alone -- sessions.json has to be read even though this test is
  // about courses.
  const unifiedBytes = fs.readFileSync(unifiedPath);
  const sessionsBytes = fs.readFileSync(sessionsPath);
  const expectedVersion = crypto.createHash('sha256')
    .update(unifiedBytes).update(Buffer.from([0])).update(sessionsBytes)
    .digest('hex');
  const unified = JSON.parse(unifiedBytes.toString('utf-8'));

  const sourceCourses = unified.courses || [];
  const sourceGroups = unified.groupToFacultyMap || {};
  if (sourceCourses.length === 0) fail('the source file has no courses');
  if (Object.keys(sourceGroups).length === 0) fail('the source file has no groups');

  const manifestFn = require('../netlify/functions/getDatasetManifest.js');
  const coursesFn = require('../netlify/functions/getCourses.js');

  const manifestResponse = await manifestFn.handler({});
  if (manifestResponse.statusCode !== 200) {
    fail(`manifest returned ${manifestResponse.statusCode}: ${manifestResponse.body}`);
  }
  const manifest = JSON.parse(manifestResponse.body);

  if (manifest.dataset_version !== expectedVersion) {
    fail('the database holds a different dataset than the source directory.\n'
       + `       source:   ${expectedVersion}\n`
       + `       database: ${manifest.dataset_version}\n`
       + '       Ingest these artifacts first (scraper: neon_ingest.py).');
  }
  if (manifest.course_count !== sourceCourses.length) {
    fail(`manifest course_count ${manifest.course_count}, source has ${sourceCourses.length}`);
  }

  // --- the three parts of the envelope that come from the manifest ---------
  assertEqual('semester', unified.semester, manifest.semester);
  assertEqual('groupToFacultyMap', sourceGroups, manifest.groupToFacultyMap);
  assertEqual('scraping_datetime', unified.scraping_datetime, manifest.scraping_datetime);

  // --- and the courses, reassembled page by page ---------------------------
  const apiCourses = [];
  let maxPageBytes = 0;
  for (let page = 0; page < manifest.total_pages; page++) {
    const response = await coursesFn.handler({
      queryStringParameters: { version: manifest.dataset_version, page: String(page) },
    });
    if (response.statusCode !== 200) {
      fail(`page ${page} returned ${response.statusCode}: ${response.body}`);
    }
    const bytes = Buffer.byteLength(response.body, 'utf-8');
    maxPageBytes = Math.max(maxPageBytes, bytes);
    if (bytes >= PAGE_BYTE_CEILING) {
      fail(`page ${page} is ${bytes} bytes, at or over the ${PAGE_BYTE_CEILING} ceiling`);
    }
    if (response.headers['Cache-Control'] !== 'public, max-age=31536000, immutable') {
      fail(`page ${page} is not immutable: ${response.headers['Cache-Control']}`);
    }
    const body = JSON.parse(response.body);
    if (body.dataset_version !== manifest.dataset_version) {
      fail(`page ${page} carries version ${body.dataset_version}, manifest says `
         + `${manifest.dataset_version}`);
    }
    if (body.total_pages !== manifest.total_pages) {
      fail(`page ${page} reports ${body.total_pages} total pages, manifest says `
         + `${manifest.total_pages}`);
    }
    apiCourses.push(...body.courses);
  }

  if (apiCourses.length !== sourceCourses.length) {
    fail(`assembled ${apiCourses.length} courses, source has ${sourceCourses.length}`);
  }
  const uniqueIds = new Set(apiCourses.map((c) => c.id));
  if (uniqueIds.size !== apiCourses.length) {
    fail(`page boundaries overlap: ${apiCourses.length} courses, ${uniqueIds.size} unique ids`);
  }

  // Course order is canonicalised by sorting both sides on id; everything else
  // about each course is compared as-is.
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const expectedCourses = [...sourceCourses].sort(byId);
  const actualCourses = [...apiCourses].sort(byId);
  for (let i = 0; i < expectedCourses.length; i++) {
    const diff = firstDifference(canonical(expectedCourses[i]), canonical(actualCourses[i]),
      `course ${expectedCourses[i].id}`);
    if (diff) fail(diff);
  }

  // Visible rather than silent: how much the null/absent rule actually absorbed.
  let absorbed = 0;
  for (let i = 0; i < expectedCourses.length; i++) {
    for (const key of Object.keys(actualCourses[i])) {
      if (actualCourses[i][key] === null && !(key in expectedCourses[i])) absorbed++;
    }
  }

  console.log(`Reassembled envelope matches the source file.`);
  console.log(`  null-for-absent normalisations absorbed: ${absorbed}`);
  console.log(`COURSE CONTRACT OK version=${manifest.dataset_version} `
    + `courses=${apiCourses.length} groups=${Object.keys(manifest.groupToFacultyMap).length} `
    + `pages=${manifest.total_pages} max_page_bytes=${maxPageBytes}`);
}

main().catch((error) => {
  console.error('CONTRACT FAILED:', error && error.message ? error.message : error);
  process.exit(1);
});
