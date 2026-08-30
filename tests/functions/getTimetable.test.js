const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { handler, handleRequest, _resetSemesterCache } = require('../../netlify/functions/getTimetable.js');

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

// Mimics the neon() tagged-template client: routes each query by its SQL text.
function makeFakeSql({ semesterRows, countRows, sessionRows, failWith } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (failWith) throw failWith;
    if (text.includes('is_active')) return semesterRows;
    if (text.includes('count(*)')) return countRows;
    return sessionRows;
  };
  return { sql, calls };
}

const SAMPLE_ROW = {
  course_id: 'ITX0020', date: '01.09.2026', start: '10:00', end: '11:30',
  type: 'loeng', room: 'U06-201', weeks: '1-16', comment: '',
  instructor: { name: 'Evelin Halling', title: 'vanemlektor' },
  groups: [{ group: 'EACB31', ainekv: 'kohustuslik' }], is_veebiope: false,
};

beforeEach(() => _resetSemesterCache());

test('no courses param returns 200 with empty array', async () => {
  const { sql } = makeFakeSql();
  const res = await handleRequest({ queryStringParameters: {} }, sql);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body), []);
  assert.strictEqual(res.headers['Cache-Control'], CACHE_CONTROL);
});

test('returns session rows as a bare array with cache headers', async () => {
  const { sql, calls } = makeFakeSql({
    semesterRows: [{ code: '26s' }],
    countRows: [{ count: 1 }],
    sessionRows: [SAMPLE_ROW],
  });
  const res = await handleRequest({ queryStringParameters: { courses: 'ITX0020,VAA0240' } }, sql);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body), [SAMPLE_ROW]);
  assert.strictEqual(res.headers['Cache-Control'], CACHE_CONTROL);
  // Both data queries are parameterized with the semester code and the id array.
  const dataCalls = calls.filter((c) => !c.text.includes('is_active'));
  assert.strictEqual(dataCalls.length, 2);
  for (const call of dataCalls) {
    assert.deepStrictEqual(call.values, ['26s', ['ITX0020', 'VAA0240']]);
  }
});

test('count above limit returns limit_exceeded envelope, not the rows', async () => {
  const { sql, calls } = makeFakeSql({
    semesterRows: [{ code: '26s' }],
    countRows: [{ count: 4001 }],
    sessionRows: [SAMPLE_ROW],
  });
  const res = await handleRequest({ queryStringParameters: { courses: 'ITX0020' } }, sql);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body), { error: 'limit_exceeded', count: 4001, limit: 4000 });
  // The row query must not have been issued.
  assert.strictEqual(calls.filter((c) => c.text.includes('to_char')).length, 0);
});

test('query failure returns 500 with error body', async () => {
  const { sql } = makeFakeSql({ failWith: new Error('connection refused') });
  const res = await handleRequest({ queryStringParameters: { courses: 'ITX0020' } }, sql);
  assert.strictEqual(res.statusCode, 500);
  assert.ok(JSON.parse(res.body).error);
});

test('missing active semester returns 500', async () => {
  const { sql } = makeFakeSql({ semesterRows: [] });
  const res = await handleRequest({ queryStringParameters: { courses: 'ITX0020' } }, sql);
  assert.strictEqual(res.statusCode, 500);
});

test('active semester lookup is cached across requests', async () => {
  const { sql, calls } = makeFakeSql({
    semesterRows: [{ code: '26s' }], countRows: [{ count: 0 }], sessionRows: [],
  });
  await handleRequest({ queryStringParameters: { courses: 'A' } }, sql);
  await handleRequest({ queryStringParameters: { courses: 'B' } }, sql);
  assert.strictEqual(calls.filter((c) => c.text.includes('is_active')).length, 1);
});

test('handler returns 500 envelope when NEON_DATABASE_URL is missing', async () => {
  delete process.env.NEON_DATABASE_URL;
  const res = await handler({ queryStringParameters: { courses: 'ITX0020' } });
  assert.strictEqual(res.statusCode, 500);
  assert.ok(JSON.parse(res.body).error);
});

// --- Versioned requests (spec 9.3) -----------------------------------------
// The calendar must stay on the dataset version the tab loaded. Sessions from a
// newer ingest merged into older course objects is the exact mixture the whole
// version-pinning design exists to prevent.

const VERSION = 'a'.repeat(64);
const IMMUTABLE = 'public, max-age=31536000, immutable';

// Routes by the shape of the statement rather than by call order, so a test
// cannot pass because the queries happened to run in the expected sequence.
function makeVersionedSql({ countRow, rowsRow, failWith } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (failWith) throw failWith;
    if (text.includes('jsonb_agg')) return [rowsRow];
    return [countRow];
  };
  return { sql, calls };
}

async function getVersioned(query, options) {
  const { sql, calls } = makeVersionedSql(options);
  const response = await handleRequest({ queryStringParameters: query }, sql);
  return { response, calls, body: JSON.parse(response.body) };
}

test('a versioned request returns the session array with immutable caching', async () => {
  const { response, body } = await getVersioned(
    { version: VERSION, courses: 'ITX0020' },
    {
      countRow: { version_match: true, count: 1 },
      rowsRow: { version_match: true, sessions: [SAMPLE_ROW] },
    },
  );
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(body, [SAMPLE_ROW]);
  assert.strictEqual(response.headers['Cache-Control'], IMMUTABLE);
});

test('a versioned empty result is a normal 200, not a 409', async () => {
  const { response, body } = await getVersioned(
    { version: VERSION, courses: 'NOPE0000' },
    {
      countRow: { version_match: true, count: 0 },
      rowsRow: { version_match: true, sessions: [] },
    },
  );
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(body, []);
});

test('a stale version is 409 and never queries session rows', async () => {
  const { response, body, calls } = await getVersioned(
    { version: VERSION, courses: 'ITX0020' },
    { countRow: { version_match: false, count: 0 } },
  );
  assert.strictEqual(response.statusCode, 409);
  assert.deepStrictEqual(body, { error: 'version_changed' });
  assert.strictEqual(response.headers['Cache-Control'], 'no-store');
  assert.strictEqual(calls.length, 1, 'the row query must not run');
  assert.ok(!calls[0].text.includes('jsonb_agg'), 'the one query run was the count');
});

test('an ingest between the count and the row query is a 409, not a false empty success', async () => {
  // The row statement carries its own version check from its own snapshot, so a
  // dataset replaced in between cannot come back as a plausible empty array.
  const { response, body } = await getVersioned(
    { version: VERSION, courses: 'ITX0020' },
    {
      countRow: { version_match: true, count: 3 },
      rowsRow: { version_match: false, sessions: [] },
    },
  );
  assert.strictEqual(response.statusCode, 409);
  assert.deepStrictEqual(body, { error: 'version_changed' });
});

test('a malformed version is 400 and queries nothing', async () => {
  for (const version of ['', 'nope', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
    const { response, body, calls } = await getVersioned(
      { version, courses: 'ITX0020' },
      { countRow: { version_match: true, count: 0 } },
    );
    assert.strictEqual(response.statusCode, 400, JSON.stringify(version));
    assert.strictEqual(body.error, 'bad_request');
    assert.strictEqual(response.headers['Cache-Control'], 'no-store');
    assert.strictEqual(calls.length, 0);
  }
});

test('a versioned limit_exceeded is short-lived, not immutable', async () => {
  // Its content depends on CALENDAR_SESSION_LIMIT, an environment variable that
  // can change without the dataset version changing, so it is not
  // content-addressed and must never be cached as if it were.
  const { response, body } = await getVersioned(
    { version: VERSION, courses: 'BIG0001' },
    { countRow: { version_match: true, count: 99999 } },
  );
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(body.error, 'limit_exceeded');
  assert.strictEqual(response.headers['Cache-Control'], 'public, max-age=300');
  assert.notStrictEqual(response.headers['Cache-Control'], IMMUTABLE);
});

test('a versioned request binds the version into both statements', async () => {
  const { calls } = await getVersioned(
    { version: VERSION, courses: 'ITX0020' },
    {
      countRow: { version_match: true, count: 1 },
      rowsRow: { version_match: true, sessions: [SAMPLE_ROW] },
    },
  );
  assert.strictEqual(calls.length, 2);
  for (const call of calls) {
    assert.ok(call.values.includes(VERSION), 'each statement checks the version itself');
    assert.match(call.text, /dataset_version/);
  }
});

test('a versioned request never uses the warm-lambda semester cache', async () => {
  // getTimetable caches the active semester code for five minutes. Serving a
  // versioned request from that cache could answer for a semester that is no
  // longer active, under a version the client trusts.
  const first = await getVersioned({ version: VERSION, courses: 'ITX0020' }, {
    countRow: { version_match: true, count: 1 },
    rowsRow: { version_match: true, sessions: [SAMPLE_ROW] },
  });
  const second = await getVersioned({ version: VERSION, courses: 'ITX0020' }, {
    countRow: { version_match: false, count: 0 },
  });
  assert.strictEqual(first.response.statusCode, 200);
  assert.strictEqual(second.response.statusCode, 409,
    'the second request must re-resolve the semester, not reuse a cached code');
  for (const call of first.calls) {
    assert.ok(!/SELECT code FROM semesters WHERE is_active = true LIMIT 1/.test(call.text));
  }
});

test('an unversioned request keeps the old behaviour and the old cache policy', async () => {
  // The deployed frontend still sends no version during rollout.
  const { sql } = makeFakeSql({
    semesterRows: [{ code: '26s' }],
    countRows: [{ count: 1 }],
    sessionRows: [SAMPLE_ROW],
  });
  _resetSemesterCache();
  const response = await handleRequest(
    { queryStringParameters: { courses: 'ITX0020' } }, sql);
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(response.body), [SAMPLE_ROW]);
  assert.strictEqual(response.headers['Cache-Control'], CACHE_CONTROL);
});

test('a 500 is never cached, on either path', async () => {
  // Spec 9.3 and acceptance criterion 6b: every 400/409/500 carries no-store.
  // These two returned no headers at all, so a 500 had neither a cache policy
  // nor a content type.
  const boom = new Error('connection to postgresql://u:hunter2@host failed');

  const versioned = await getVersioned(
    { version: VERSION, courses: 'ITX0020' }, { failWith: boom });
  assert.strictEqual(versioned.response.statusCode, 500);
  assert.strictEqual(versioned.response.headers['Cache-Control'], 'no-store');
  assert.strictEqual(versioned.response.headers['Content-Type'], 'application/json');
  assert.ok(!versioned.response.body.includes('hunter2'));

  const { sql } = makeFakeSql({ failWith: boom });
  _resetSemesterCache();
  const legacy = await handleRequest(
    { queryStringParameters: { courses: 'ITX0020' } }, sql);
  assert.strictEqual(legacy.statusCode, 500);
  assert.strictEqual(legacy.headers['Cache-Control'], 'no-store');
});

test('a versioned request with no courses is still version-checked', async () => {
  // The legacy shortcut returns 200 [] before any query. A client that sent a
  // version asked for a pinned answer, so a stale one must not come back as an
  // empty array cached for a year.
  const { response, body } = await getVersioned(
    { version: VERSION }, { countRow: { version_match: false, count: 0 } });
  assert.strictEqual(response.statusCode, 409);
  assert.deepStrictEqual(body, { error: 'version_changed' });
  assert.strictEqual(response.headers['Cache-Control'], 'no-store');
});

test('an unversioned request with no courses keeps the legacy shortcut', async () => {
  const { sql, calls } = makeFakeSql({});
  const response = await handleRequest({ queryStringParameters: {} }, sql);
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(response.body), []);
  assert.strictEqual(response.headers['Cache-Control'], CACHE_CONTROL);
  assert.strictEqual(calls.length, 0);
});
