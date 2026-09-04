// scripts/contract-test-gettimetable.js
// Replays the legacy file-based filter against the new Neon-backed handler for
// every course_id in sessions.json (in batches small enough to stay under the
// session limit) and requires deep-equal responses. Row order and JSON key
// order are not part of the contract, so both sides are canonicalized first.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { neon } = require('@neondatabase/serverless');
const { handleRequest, _resetSemesterCache } = require('../netlify/functions/getTimetable.js');
const { loadDotEnv, resolveSourceDir, humanHeaders } = require('./lib/script-support.js');

const MAX_BATCH_SESSIONS = 3500; // keep each batch under getTimetable's 4000 limit

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonicalize(value[k])]));
  }
  return value;
}

// One sortable string per event so the two sides compare order-independently.
function fingerprints(events) {
  return events.map((e) => JSON.stringify(canonicalize(e))).sort();
}

async function main() {
  loadDotEnv(path.resolve(__dirname, '..', '.env'));
  if (!process.env.NEON_DATABASE_URL) throw new Error('Set NEON_DATABASE_URL');
  const sql = neon(process.env.NEON_DATABASE_URL);

  const sourceDir = resolveSourceDir();
  const sessionsPath = path.join(sourceDir, 'sessions.json');
  if (!fs.existsSync(sessionsPath)) throw new Error(`${sessionsPath} does not exist`);
  // Spec 7.2.2: identify the artifact before trusting it.
  const stat = fs.statSync(sessionsPath);
  const digest = crypto.createHash('sha256')
    .update(fs.readFileSync(sessionsPath)).digest('hex');
  console.log(`Source: ${sourceDir}`);
  console.log(`  sessions.json: ${stat.size} bytes, `
    + `mtime ${stat.mtime.toISOString().slice(0, 19).replace('T', ' ')}, `
    + `sha256 ${digest.slice(0, 12)}…`);
  const allEvents = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'));
  const courseIds = [...new Set(allEvents.map((e) => e.course_id))].sort();
  console.log(`${allEvents.length} events, ${courseIds.length} distinct courses`);

  // A zero-course run would compare nothing against nothing and print
  // "CONTRACT OK". That is the failure mode a contract test must not have.
  if (allEvents.length === 0 || courseIds.length === 0) {
    throw new Error('the source file has no sessions; there is nothing to verify');
  }

  // The version covers both artifacts, so unified_courses.json is read too --
  // this test is about sessions, but the identifier is not.
  const unifiedPath = path.join(sourceDir, 'unified_courses.json');
  if (!fs.existsSync(unifiedPath)) throw new Error(`${unifiedPath} does not exist`);
  const datasetVersion = crypto.createHash('sha256')
    .update(fs.readFileSync(unifiedPath))
    .update(Buffer.from([0]))
    .update(fs.readFileSync(sessionsPath))
    .digest('hex');
  console.log(`  dataset_version: ${datasetVersion}`);

  // Group courses into batches whose total event count stays under the handler's
  // session limit, so every batch returns an array (not limit_exceeded). Data grows
  // denser over time, so size by session count rather than a fixed course count.
  const countByCourse = new Map();
  for (const e of allEvents) countByCourse.set(e.course_id, (countByCourse.get(e.course_id) || 0) + 1);
  const batches = [];
  let current = [];
  let currentCount = 0;
  for (const id of courseIds) {
    const n = countByCourse.get(id) || 0;
    if (current.length && currentCount + n > MAX_BATCH_SESSIONS) {
      batches.push(current);
      current = [];
      currentCount = 0;
    }
    current.push(id);
    currentCount += n;
  }
  if (current.length) batches.push(current);

  let compared = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchSet = new Set(batch);

    const legacy = allEvents.filter((e) => batchSet.has(e.course_id));

    _resetSemesterCache();
    // Versioned, like the new frontend. A 409 here would mean the database no
    // longer holds the dataset this source directory describes -- which is a
    // real failure of this test, not something to retry around.
    const res = await handleRequest({
      queryStringParameters: { courses: batch.join(','), version: datasetVersion },
    }, sql);
    if (res.statusCode === 409) {
      // Name both sides, like the course gate does. "Your version is wrong"
      // without saying what the database actually holds sends the operator
      // hunting for the answer the failing process already had.
      let active = '(unknown: the manifest could not be read)';
      try {
        // The manifest endpoint is gated, so this diagnostic has to arrive as a
        // verified visitor or it would report "(unknown)" for every mismatch.
        const manifest = await require('../netlify/functions/getDatasetManifest.js')
          .handler({ headers: humanHeaders() });
        active = JSON.parse(manifest.body).dataset_version || active;
      } catch (e) { /* the version mismatch is the story, not this */ }
      throw new Error(
        `batch ${i}: the database holds a different dataset than the source directory.\n`
        + `       source:   ${datasetVersion}\n`
        + `       database: ${active}\n`
        + '       Ingest these artifacts first (scraper: neon_ingest.py).');
    }
    assert.strictEqual(res.statusCode, 200, `batch ${i}: status ${res.statusCode} body ${res.body}`);
    assert.strictEqual(res.headers['Cache-Control'], 'public, max-age=31536000, immutable',
      `batch ${i}: a versioned session array must be immutable`);
    const fresh = JSON.parse(res.body);
    assert.ok(Array.isArray(fresh), `batch ${i}: expected array, got ${res.body.slice(0, 200)}`);

    const a = fingerprints(legacy);
    const b = fingerprints(fresh);
    assert.strictEqual(b.length, a.length, `batch ${i}: ${a.length} legacy vs ${b.length} neon events`);
    for (let j = 0; j < a.length; j++) {
      if (a[j] !== b[j]) {
        console.error('First mismatch in batch starting at course index ' + i);
        console.error('legacy:', a[j]);
        console.error('neon:  ', b[j]);
        process.exit(1);
      }
    }
    compared += a.length;
    process.stdout.write(`\r  compared ${compared}/${allEvents.length} events`);
  }
  console.log('\nCONTRACT OK: all responses deep-equal');
}

main().catch((err) => { console.error('\n' + (err.stack || err)); process.exit(1); });
