const { test } = require('node:test');
const assert = require('node:assert');
const { handler, handleRequest } = require('../../netlify/functions/getCourses.js');

const VERSION = 'a'.repeat(64);
const OTHER_VERSION = 'b'.repeat(64);

const IMMUTABLE = 'public, max-age=31536000, immutable';

// One real course, shaped exactly as a row comes back from the courses table:
// study_programmes is one JSONB value that must be split back into the two
// source fields, and eap is numeric.
function courseRow(overrides = {}) {
  return {
    id: 'ITX0020',
    name_et: 'Programmeerimine',
    name_en: 'Programming',
    eap: 6,
    assessment_form_et: 'eksam',
    keel_et: 'eesti keel',
    keel_en: 'estonian',
    school_code: 'I',
    school_name: 'Infotehnoloogia teaduskond',
    school_name_en: 'School of IT',
    institute_code: 'IAX',
    institute_name: 'Tarkvarateaduse instituut',
    institute_name_en: 'Department of Software Science',
    course_card_link: 'https://ois.taltech.ee/x',
    timetable_link: 'https://tunniplaan.taltech.ee/y',
    objectives_et: 'eesmärk',
    objectives_en: 'objective',
    learning_outcomes_et: 'väljund',
    learning_outcomes_en: 'outcome',
    description_short_et: 'lühikirjeldus',
    description_short_en: 'short description',
    groups: ['EACB31', 'VDLR31'],
    group_sessions: [{ group: 'EACB31', session_status: 'offline', keel: ['est'] }],
    study_programmes: {
      et: [{ kavaversioonikood: 'EAUI12/26', ainekv: 'valikuline' }],
      en: [{ kavaversioonikood: 'EAUI12/26', ainekv: 'elective' }],
    },
    ...overrides,
  };
}

// The single statement returns the version and total count alongside every row,
// so the check and the page cannot come from two different snapshots.
function pageRow(course, { version = VERSION, total = 1 } = {}) {
  return { dataset_version: version, course_count: total, course };
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

async function get(query, rows, options) {
  const { sql, calls } = makeFakeSql(rows, options);
  const response = await handleRequest({ queryStringParameters: query }, sql);
  return { response, calls, body: JSON.parse(response.body) };
}

// --- success ---------------------------------------------------------------

test('returns the spec 9.2 envelope', async () => {
  const { response, body } = await get(
    { version: VERSION, page: '0' },
    [pageRow(courseRow(), { total: 1030 })],
  );

  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(body.dataset_version, VERSION);
  assert.strictEqual(body.page, 0);
  assert.strictEqual(body.page_size, 200);
  assert.strictEqual(body.total_pages, 6);
  assert.strictEqual(body.courses.length, 1);
  assert.deepStrictEqual(Object.keys(body), [
    'dataset_version', 'page', 'page_size', 'total_pages', 'courses',
  ]);
});

test('a 200 is immutable for a year', async () => {
  // The URL is content-addressed: version is a hash of the source artifacts and
  // page boundaries are deterministic, so these bytes can never change.
  const { response } = await get({ version: VERSION, page: '0' }, [pageRow(courseRow())]);
  assert.strictEqual(response.headers['Cache-Control'], IMMUTABLE);
  assert.strictEqual(response.headers['Content-Type'], 'application/json');
});

test('every course key from the source file is returned, and nothing else', async () => {
  // The 25 keys of a course object in unified_courses.json. main.js reads these
  // names directly, so an addition or omission here is a breaking change.
  const SOURCE_KEYS = [
    'id', 'name_et', 'name_en', 'eap', 'assessment_form_et', 'keel_et', 'keel_en',
    'school_code', 'school_name', 'school_name_en',
    'institute_code', 'institute_name', 'institute_name_en',
    'course_card_link', 'timetable_link',
    'objectives_et', 'objectives_en',
    'learning_outcomes_et', 'learning_outcomes_en',
    'description_short_et', 'description_short_en',
    'groups', 'group_sessions',
    'study_programmes_et', 'study_programmes_en',
  ];
  const { body } = await get({ version: VERSION, page: '0' }, [pageRow(courseRow())]);
  const course = body.courses[0];

  assert.deepStrictEqual(Object.keys(course).sort(), [...SOURCE_KEYS].sort());
  assert.ok(!('study_programmes' in course), 'the combined JSONB column must not leak out');
  assert.ok(!('semester_code' in course), 'storage-only columns must not leak out');
});

test('study_programmes splits back into the two source fields', async () => {
  const { body } = await get({ version: VERSION, page: '0' }, [pageRow(courseRow())]);
  const course = body.courses[0];
  assert.deepStrictEqual(course.study_programmes_et,
    [{ kavaversioonikood: 'EAUI12/26', ainekv: 'valikuline' }]);
  assert.deepStrictEqual(course.study_programmes_en,
    [{ kavaversioonikood: 'EAUI12/26', ainekv: 'elective' }]);
});

test('eap is a JSON number, not the string Postgres returns for numeric', async () => {
  for (const [stored, expected] of [['6', 6], ['3.0', 3], [4.5, 4.5], ['4.50', 4.5]]) {
    const { body } = await get({ version: VERSION, page: '0' },
      [pageRow(courseRow({ eap: stored }))]);
    assert.strictEqual(body.courses[0].eap, expected, String(stored));
    assert.strictEqual(typeof body.courses[0].eap, 'number');
  }
});

test('a null eap stays null rather than becoming zero', async () => {
  const { body } = await get({ version: VERSION, page: '0' },
    [pageRow(courseRow({ eap: null }))]);
  assert.strictEqual(body.courses[0].eap, null);
});

test('null and empty scalars and JSONB survive unchanged', async () => {
  const sparse = courseRow({
    name_en: null,
    school_name_en: null,
    objectives_et: '',
    groups: [],
    group_sessions: null,
    study_programmes: null,
  });
  const { body } = await get({ version: VERSION, page: '0' }, [pageRow(sparse)]);
  const course = body.courses[0];
  assert.strictEqual(course.name_en, null);
  assert.strictEqual(course.school_name_en, null);
  assert.strictEqual(course.objectives_et, '');
  assert.deepStrictEqual(course.groups, []);
  assert.strictEqual(course.group_sessions, null);
  assert.strictEqual(course.study_programmes_et, null);
  assert.strictEqual(course.study_programmes_en, null);
});

test('courses keep the order the query returned them in', async () => {
  const rows = ['AAA0001', 'MMM0002', 'ZZZ0003'].map(
    (id) => pageRow(courseRow({ id }), { total: 3 }));
  const { body } = await get({ version: VERSION, page: '0' }, rows);
  assert.deepStrictEqual(body.courses.map((c) => c.id), ['AAA0001', 'MMM0002', 'ZZZ0003']);
});

test('the query orders by id and pages with limit and offset', async () => {
  const { calls } = await get({ version: VERSION, page: '2' }, [pageRow(courseRow())]);
  assert.strictEqual(calls.length, 1, 'one statement, or the check and the page can differ');
  const text = calls[0].text;
  assert.match(text, /ORDER BY/i, 'page boundaries must be deterministic');
  assert.match(text, /LIMIT/i);
  assert.match(text, /OFFSET/i);
  assert.ok(!text.includes(';'));
  // The requested version must be part of the predicate, not checked separately.
  assert.ok(calls[0].values.includes(VERSION), 'the version must be bound into the query');
  assert.ok(calls[0].values.includes(400), 'offset = page * page_size');
  // The storage-only column is stripped in SQL as well as in the projection, so
  // the redundancy stays deliberate rather than becoming accidental.
  assert.match(text, /semester_code/, 'the storage-only column must be stripped');
});

test('the last partial page is returned in full', async () => {
  const rows = Array.from({ length: 30 }, (_, i) =>
    pageRow(courseRow({ id: `C${i}` }), { total: 1030 }));
  const { response, body } = await get({ version: VERSION, page: '5' }, rows);
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(body.page, 5);
  assert.strictEqual(body.courses.length, 30);
});

// --- rejection -------------------------------------------------------------

const BAD_REQUESTS = [
  ['no parameters at all', undefined],
  ['missing version', { page: '0' }],
  ['missing page', { version: VERSION }],
  ['empty version', { version: '', page: '0' }],
  ['short version', { version: 'a'.repeat(63), page: '0' }],
  ['long version', { version: 'a'.repeat(65), page: '0' }],
  ['uppercase version', { version: 'A'.repeat(64), page: '0' }],
  ['non-hex version', { version: 'g'.repeat(64), page: '0' }],
  ['negative page', { version: VERSION, page: '-1' }],
  ['non-numeric page', { version: VERSION, page: 'first' }],
  ['fractional page', { version: VERSION, page: '1.5' }],
  ['empty page', { version: VERSION, page: '' }],
];

for (const [name, query] of BAD_REQUESTS) {
  test(`400 for ${name}`, async () => {
    const { response, body } = await get(query, [pageRow(courseRow())]);
    assert.strictEqual(response.statusCode, 400);
    assert.strictEqual(body.error, 'bad_request');
    assert.strictEqual(response.headers['Cache-Control'], 'no-store');
  });
}

test('a malformed request never reaches the database', async () => {
  const { calls } = await get({ page: '0' }, [pageRow(courseRow())]);
  assert.strictEqual(calls.length, 0);
});

test('409 when the requested version is no longer active', async () => {
  // An ingest has happened since the client read the manifest. The client must
  // discard its pages and start again from a fresh manifest.
  const { response, body } = await get({ version: OTHER_VERSION, page: '0' }, []);
  assert.strictEqual(response.statusCode, 409);
  assert.deepStrictEqual(body, { error: 'version_changed' });
});

test('a 409 is never cached', async () => {
  // A cached 409 would outlive the ingest that resolved it and pin the client
  // into a permanent version-mismatch loop.
  const { response } = await get({ version: OTHER_VERSION, page: '0' }, []);
  assert.strictEqual(response.headers['Cache-Control'], 'no-store');
});

test('404 for a page past the end of the dataset', async () => {
  const { response, body } = await get({ version: VERSION, page: '6' },
    [{ dataset_version: VERSION, course_count: 1030, course: null }]);
  assert.strictEqual(response.statusCode, 404);
  assert.strictEqual(body.error, 'page_not_found');
  assert.strictEqual(response.headers['Cache-Control'], 'no-store');
});

test('page 0 of an empty dataset is a 404, not an empty 200', async () => {
  // total_pages is 0, so the range 0 <= page < total_pages is empty.
  const { response, body } = await get({ version: VERSION, page: '0' },
    [{ dataset_version: VERSION, course_count: 0, course: null }]);
  assert.strictEqual(response.statusCode, 404);
  assert.strictEqual(body.error, 'page_not_found');
});

test('500 on a query failure, without leaking the error', async () => {
  const secret = new Error('connection to postgresql://u:hunter2@host failed');
  const { response, body } = await get({ version: VERSION, page: '0' }, [], { failWith: secret });
  assert.strictEqual(response.statusCode, 500);
  assert.deepStrictEqual(body, { error: 'courses_unavailable' });
  assert.strictEqual(response.headers['Cache-Control'], 'no-store');
  assert.ok(!response.body.includes('hunter2'));
});

test('a missing NEON_DATABASE_URL returns 500 rather than throwing', async () => {
  const saved = process.env.NEON_DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
  require('../../netlify/functions/lib/dataset.js')._resetSql();
  try {
    const response = await handler({ queryStringParameters: { version: VERSION, page: '0' } });
    assert.strictEqual(response.statusCode, 500);
    assert.strictEqual(JSON.parse(response.body).error, 'courses_unavailable');
    assert.strictEqual(response.headers['Cache-Control'], 'no-store');
  } finally {
    if (saved === undefined) delete process.env.NEON_DATABASE_URL;
    else process.env.NEON_DATABASE_URL = saved;
  }
});

// --- payload safety --------------------------------------------------------

test('a full 200-course page stays well below the 4.5 MiB ceiling', async () => {
  // Netlify's platform limit is 6 MB; the project ceiling is 4.5 MiB. Against
  // the real dataset the largest page is about 1.05 MiB, so a fixture page of
  // realistically sized courses must have ample headroom.
  const bulky = () => courseRow({
    objectives_et: 'x'.repeat(1200),
    objectives_en: 'x'.repeat(1200),
    learning_outcomes_et: 'x'.repeat(1800),
    learning_outcomes_en: 'x'.repeat(1800),
    description_short_et: 'x'.repeat(900),
    description_short_en: 'x'.repeat(900),
    groups: Array.from({ length: 40 }, (_, i) => `GRP${i}`),
    group_sessions: Array.from({ length: 40 }, (_, i) => ({
      group: `GRP${i}`, session_status: 'offline', keel: ['est'],
      instructors: [{ name: 'Some Lecturer', title: 'lektor' }],
    })),
  });
  const rows = Array.from({ length: 200 }, (_, i) =>
    pageRow(bulky(), { total: 1030 }));

  const { response } = await get({ version: VERSION, page: '0' }, rows);
  const bytes = Buffer.byteLength(response.body, 'utf8');
  const CEILING = 4.5 * 1024 * 1024;
  assert.strictEqual(response.statusCode, 200);
  assert.ok(bytes < CEILING, `page is ${bytes} bytes, ceiling is ${CEILING}`);
});

// --- oversized page indices ------------------------------------------------

test('an absurd page index is 404, not a 500 from a bigint overflow', async () => {
  // page * 200 can exceed int8 or become Infinity, which Postgres rejects with
  // "invalid input syntax for type bigint". That is a wrong status on
  // attacker-controlled input, and a needless database round trip per request.
  const cases = [
    '46116860184273879',        // page * 200 > int8 max
    '100000000000000000000',    // serialises as 2e+22
    '9'.repeat(400),            // page * 200 === Infinity
  ];
  for (const page of cases) {
    const { response, body, calls } = await get({ version: VERSION, page },
      [pageRow(courseRow(), { total: 1030 })]);
    assert.strictEqual(response.statusCode, 404, page.slice(0, 24));
    assert.strictEqual(body.error, 'page_not_found');
    assert.strictEqual(response.headers['Cache-Control'], 'no-store');
    assert.strictEqual(calls.length, 0, 'an impossible page must not reach the database');
  }
});

test('the largest addressable page is still queried normally', async () => {
  const maxPage = String(Math.floor(Number.MAX_SAFE_INTEGER / 200));
  const { response, calls } = await get({ version: VERSION, page: maxPage },
    [{ dataset_version: VERSION, course_count: 1030, course: null }]);
  assert.strictEqual(calls.length, 1, 'a representable page is a normal range question');
  assert.strictEqual(response.statusCode, 404);
});
