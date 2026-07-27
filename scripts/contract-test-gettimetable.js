// scripts/contract-test-gettimetable.js
// Replays the legacy file-based filter against the new Neon-backed handler for
// every course_id in sessions.json (in batches small enough to stay under the
// session limit) and requires deep-equal responses. Row order and JSON key
// order are not part of the contract, so both sides are canonicalized first.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { neon } = require('@neondatabase/serverless');
const { handleRequest, _resetSemesterCache } = require('../netlify/functions/getTimetable.js');

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
  if (!process.env.NEON_DATABASE_URL) throw new Error('Set NEON_DATABASE_URL');
  const sql = neon(process.env.NEON_DATABASE_URL);

  const root = path.resolve(__dirname, '..');
  const allEvents = JSON.parse(fs.readFileSync(path.join(root, 'sessions.json'), 'utf-8'));
  const courseIds = [...new Set(allEvents.map((e) => e.course_id))].sort();
  console.log(`${allEvents.length} events, ${courseIds.length} distinct courses`);

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
    const res = await handleRequest({ queryStringParameters: { courses: batch.join(',') } }, sql);
    assert.strictEqual(res.statusCode, 200, `batch ${i}: status ${res.statusCode} body ${res.body}`);
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
