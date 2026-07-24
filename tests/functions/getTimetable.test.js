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
