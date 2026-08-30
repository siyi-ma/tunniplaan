const { test } = require('node:test');
const assert = require('node:assert');
const {
  handler,
  handleRequest,
  PAGE_SIZE,
} = require('../../netlify/functions/getDatasetManifest.js');

const VERSION = 'a'.repeat(64);

// One row, because the manifest is assembled by one SQL statement: splitting it
// across reads could straddle an ingest commit and mix two dataset versions.
function manifestRow(overrides = {}) {
  return {
    dataset_version: VERSION,
    scraping_datetime: '24.08.2026 17:05',
    code: '26s',
    label: '2026/2027 sügis',
    name_et: 'sügis 2026',
    name_en: 'autumn 2026',
    start_date: '2026-08-27',
    end_date: '2027-01-15',
    week1_monday: '2026-08-31',
    course_count: 1030,
    groups: [['IADB11', 'I'], ['VDLR31', 'V']],
    ...overrides,
  };
}

function makeFakeSql(rows, { failWith } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join('?'), values });
    if (failWith) throw failWith;
    return rows;
  };
  return { sql, calls };
}

async function get(rows, options) {
  const { sql, calls } = makeFakeSql(rows, options);
  const response = await handleRequest({}, sql);
  return { response, calls, body: JSON.parse(response.body) };
}

test('returns the spec 9.1 envelope', async () => {
  const { response, body } = await get([manifestRow()]);

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(body, {
    dataset_version: VERSION,
    scraping_datetime: '24.08.2026 17:05',
    semester: {
      label: '2026/2027 sügis',
      code: '26s',
      name_et: 'sügis 2026',
      name_en: 'autumn 2026',
      start_date: '2026-08-27',
      end_date: '2027-01-15',
      week1_monday: '2026-08-31',
    },
    groupToFacultyMap: { IADB11: 'I', VDLR31: 'V' },
    course_count: 1030,
    page_size: 200,
    total_pages: 6,
  });
});

test('the manifest is never cached', async () => {
  // Freshness of this response IS the invalidation mechanism for every
  // immutable versioned URL behind it. A cached manifest pins clients to a
  // dead version for as long as it lives.
  const { response } = await get([manifestRow()]);
  assert.strictEqual(response.headers['Cache-Control'], 'no-store');
  assert.strictEqual(response.headers['Content-Type'], 'application/json');
});

test('the whole manifest comes from a single query', async () => {
  const { calls } = await get([manifestRow()]);
  assert.strictEqual(calls.length, 1, 'more than one read can straddle an ingest commit');
});

test('does not reuse the legacy five-minute semester cache', async () => {
  // getTimetable caches the active semester code in a warm lambda. If the
  // manifest did the same it could report a version that no longer exists.
  const first = await get([manifestRow()]);
  const second = await get([manifestRow({ dataset_version: 'b'.repeat(64) })]);
  assert.strictEqual(first.body.dataset_version, VERSION);
  assert.strictEqual(second.body.dataset_version, 'b'.repeat(64));
  assert.strictEqual(second.calls.length, 1, 'the second request must still query');
});

test('page count is derived from the course count and the fixed page size', async () => {
  assert.strictEqual(PAGE_SIZE, 200);
  const cases = [
    [0, 0], [1, 1], [199, 1], [200, 1], [201, 2], [1030, 6], [1200, 6], [1201, 7],
  ];
  for (const [course_count, expected] of cases) {
    const { body } = await get([manifestRow({ course_count })]);
    assert.strictEqual(body.total_pages, expected, `${course_count} courses`);
  }
});

test('counts are numbers, not the strings Postgres returns for bigint', async () => {
  const { body } = await get([manifestRow({ course_count: '1030' })]);
  assert.strictEqual(body.course_count, 1030);
  assert.strictEqual(typeof body.course_count, 'number');
  assert.strictEqual(typeof body.total_pages, 'number');
});

test('dates are ISO strings, whatever the driver hands back', async () => {
  const { body } = await get([manifestRow({
    start_date: new Date(Date.UTC(2026, 7, 27)),
    end_date: '2027-01-15T00:00:00.000Z',
  })]);
  assert.strictEqual(body.semester.start_date, '2026-08-27');
  assert.strictEqual(body.semester.end_date, '2027-01-15');
});

test('an empty group map is returned as an empty object', async () => {
  for (const groups of [[], null]) {
    const { body } = await get([manifestRow({ groups })]);
    assert.deepStrictEqual(body.groupToFacultyMap, {});
  }
});

test('a duplicate group code with conflicting faculties is an error, not a silent overwrite', async () => {
  // (semester_code, code) is the groups primary key, so this means the database
  // invariant is broken. Folding it silently would hand the browser a group
  // filter that quietly disagrees with the data.
  const { response, body } = await get([manifestRow({
    groups: [['IADB11', 'I'], ['IADB11', 'V']],
  })]);
  assert.strictEqual(response.statusCode, 500);
  assert.strictEqual(body.error, 'manifest_unavailable');
  assert.strictEqual(response.headers['Cache-Control'], 'no-store');
});

test('a duplicate group code agreeing with itself is tolerated', async () => {
  const { response, body } = await get([manifestRow({
    groups: [['IADB11', 'I'], ['IADB11', 'I']],
  })]);
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(body.groupToFacultyMap, { IADB11: 'I' });
});

test('no active dataset returns 503 dataset_unavailable', async () => {
  const { response, body } = await get([]);
  assert.strictEqual(response.statusCode, 503);
  assert.deepStrictEqual(body, { error: 'dataset_unavailable' });
  assert.strictEqual(response.headers['Cache-Control'], 'no-store');
});

test('an active semester with no dataset_version is also dataset_unavailable', async () => {
  // The state after Phase 1: rows exist, but nothing has been ingested with a
  // version yet. Serving a null version would let clients pin to "null".
  for (const dataset_version of [null, '', undefined]) {
    const { response, body } = await get([manifestRow({ dataset_version })]);
    assert.strictEqual(response.statusCode, 503, String(dataset_version));
    assert.strictEqual(body.error, 'dataset_unavailable');
  }
});

test('a malformed dataset_version is refused rather than served', async () => {
  const { response, body } = await get([manifestRow({ dataset_version: 'NOT-HEX' })]);
  assert.strictEqual(response.statusCode, 503);
  assert.strictEqual(body.error, 'dataset_unavailable');
});

test('a query failure returns 500 without leaking the error', async () => {
  const secret = new Error('connection to postgresql://u:hunter2@host failed');
  const { response, body } = await get([], { failWith: secret });
  assert.strictEqual(response.statusCode, 500);
  assert.deepStrictEqual(body, { error: 'manifest_unavailable' });
  assert.strictEqual(response.headers['Cache-Control'], 'no-store');
  assert.ok(!response.body.includes('hunter2'), 'the response must not carry the DSN');
});

test('a missing NEON_DATABASE_URL returns 500 rather than throwing', async () => {
  const saved = process.env.NEON_DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
  try {
    const response = await handler({});
    assert.strictEqual(response.statusCode, 500);
    assert.deepStrictEqual(JSON.parse(response.body), { error: 'manifest_unavailable' });
    assert.strictEqual(response.headers['Cache-Control'], 'no-store');
  } finally {
    if (saved === undefined) delete process.env.NEON_DATABASE_URL;
    else process.env.NEON_DATABASE_URL = saved;
  }
});
