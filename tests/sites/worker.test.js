const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VERSION = 'a'.repeat(64);
const OUTFILE = path.join(os.tmpdir(), `tunniplaan-sites-worker-${process.pid}.cjs`);

let worker;

before(async () => {
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../../sites/worker/app.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: OUTFILE,
    logLevel: 'silent',
  });
  worker = require(OUTFILE);
});

beforeEach(() => worker._resetSqlCache());

function request(pathname, { method = 'GET', email = 'student@taltech.ee', search = '' } = {}) {
  const headers = {};
  if (email !== null) headers['oai-authenticated-user-email'] = email;
  return new Request(`https://tunniplaan.taltech.chatgpt.site${pathname}${search}`, {
    method,
    headers,
  });
}

async function call(pathname, options = {}) {
  const { env = {}, sql, ...rest } = options;
  const deps = {};
  if (sql) deps.sql = sql;
  if (options.createSql) deps.createSql = options.createSql;
  if (options.assetsFetch) deps.assetsFetch = options.assetsFetch;
  const response = await worker.handleFetch(request(pathname, rest), env, deps);
  let body = null;
  const text = await response.text();
  if (text) {
    try { body = JSON.parse(text); } catch (error) { body = text; }
  }
  return { response, body };
}

function timetableSql({ count = 1, rows = [], calls = [] } = {}) {
  const sql = async (strings) => {
    const text = strings.join('?');
    calls.push(text);
    if (text.includes('jsonb_agg')) return [{ version_match: true, sessions: rows }];
    if (text.includes('is_active') && text.includes('version_match')) {
      return [{ version_match: true, count }];
    }
    if (text.includes('is_active')) return [{ code: '26s' }];
    if (text.includes('count(*)')) return [{ count }];
    return rows;
  };
  return sql;
}

test('a data request without the identity header is 401 and does not query', async () => {
  let queried = false;
  const sql = async () => { queried = true; return []; };
  const { response, body } = await call('/api/getTimetable?courses=ITX0020', {
    email: null,
    sql,
  });
  assert.strictEqual(response.status, 401);
  assert.deepStrictEqual(body, { error: 'unauthenticated' });
  assert.strictEqual(response.headers.get('Cache-Control'), 'no-store');
  assert.strictEqual(queried, false);
});

test('an address outside the allowed domains is 403', async () => {
  let queried = false;
  const { response, body } = await call('/api/getDatasetManifest', {
    email: 'visitor@example.com',
    sql: async () => { queried = true; return []; },
  });
  assert.strictEqual(response.status, 403);
  assert.deepStrictEqual(body, { error: 'forbidden_domain' });
  assert.strictEqual(response.headers.get('Cache-Control'), 'no-store');
  assert.strictEqual(queried, false);
});

const refusingSql = async () => {
  throw new Error('query should not run');
};

test('the domain check is case-insensitive and defaults to taltech.ee', async () => {
  const { response, body } = await call('/api/getCourses?page=nope', {
    email: 'A@TalTech.EE',
    sql: refusingSql,
  });
  assert.strictEqual(response.status, 400);
  assert.deepStrictEqual(body, { error: 'bad_request' });
});

test('ALLOWED_EMAIL_DOMAINS widens or replaces the default', async () => {
  const opened = await call('/api/getCourses?page=nope', {
    email: 'a@example.com',
    env: { ALLOWED_EMAIL_DOMAINS: '*' },
    sql: refusingSql,
  });
  assert.strictEqual(opened.response.status, 400);

  const listed = await call('/api/getCourses?page=nope', {
    email: 'a@example.com',
    env: { ALLOWED_EMAIL_DOMAINS: 'example.com, taltech.ee' },
    sql: refusingSql,
  });
  assert.strictEqual(listed.response.status, 400);

  const blank = await call('/api/getCourses?page=nope', {
    email: 'a@example.com',
    env: { ALLOWED_EMAIL_DOMAINS: '   ' },
    sql: refusingSql,
  });
  assert.strictEqual(blank.response.status, 403);
  assert.deepStrictEqual(blank.body, { error: 'forbidden_domain' });
});

test('routes the three dataset endpoints and rejects the rest', async () => {
  const manifest = await call('/api/getDatasetManifest', {
    sql: async () => [{
      dataset_version: VERSION,
      scraping_datetime: '24.08.2026 17:05',
      code: '26s',
      label: '2026/2027 sügis',
      name_et: 'sügis 2026',
      name_en: 'autumn 2026',
      start_date: '2026-08-31',
      end_date: '2027-01-15',
      week1_monday: '2026-08-31',
      course_count: 1,
      groups: [['IADB11', 'I']],
    }],
  });
  assert.strictEqual(manifest.response.status, 200);
  assert.strictEqual(manifest.body.dataset_version, VERSION);
  assert.strictEqual(manifest.body.groupToFacultyMap.IADB11, 'I');
  assert.strictEqual(manifest.response.headers.get('Cache-Control'), 'no-store');

  const courses = await call(`/api/getCourses?version=${VERSION}&page=0`, {
    sql: async () => { throw new Error('postgres://user:hunter2@db/neondb'); },
  });
  assert.strictEqual(courses.response.status, 500);
  assert.deepStrictEqual(courses.body, { error: 'courses_unavailable' });
  assert.strictEqual(courses.response.headers.get('Cache-Control'), 'no-store');
  assert.ok(!JSON.stringify(courses.body).includes('hunter2'));

  const missing = await call('/api/does-not-exist');
  assert.strictEqual(missing.response.status, 404);
  assert.deepStrictEqual(missing.body, { error: 'not_found' });

  const posted = await call('/api/getTimetable', { method: 'POST' });
  assert.strictEqual(posted.response.status, 405);
  assert.strictEqual(posted.response.headers.get('Allow'), 'GET');
  assert.deepStrictEqual(posted.body, { error: 'method_not_allowed' });
});

test('a malformed courses request is 400 before any query', async () => {
  let queried = false;
  const { response, body } = await call('/api/getCourses?version=nope&page=0', {
    sql: async () => { queried = true; return []; },
  });
  assert.strictEqual(response.status, 400);
  assert.deepStrictEqual(body, { error: 'bad_request' });
  assert.strictEqual(queried, false);
});

test('getTimetable limit_exceeded keeps its envelope and becomes private cache', async () => {
  const calls = [];
  const { response, body } = await call(`/api/getTimetable?version=${VERSION}&courses=ITX0020`, {
    env: { CALENDAR_SESSION_LIMIT: '10' },
    sql: timetableSql({ count: 11, calls }),
  });
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(body, { error: 'limit_exceeded', count: 11, limit: 10 });
  assert.strictEqual(response.headers.get('Cache-Control'), 'private, max-age=300');
  assert.ok(!calls.some((text) => text.includes('jsonb_agg')));
});

test('the session cap is read from the request env, not frozen on the isolate', async () => {
  const first = await call('/api/getTimetable?courses=ITX0020', {
    env: { CALENDAR_SESSION_LIMIT: '10' },
    sql: timetableSql({ count: 11 }),
  });
  assert.strictEqual(first.body.limit, 10);

  const second = await call('/api/getTimetable?courses=ITX0020', {
    env: { CALENDAR_SESSION_LIMIT: '50' },
    sql: timetableSql({ count: 11, rows: [{ course_id: 'ITX0020' }] }),
  });
  assert.ok(Array.isArray(second.body));
  assert.strictEqual(second.body[0].course_id, 'ITX0020');
  assert.strictEqual(
    second.response.headers.get('Cache-Control'),
    'private, max-age=300, stale-while-revalidate=3600',
  );
});

test('a versioned timetable success is private and immutable', async () => {
  const { response, body } = await call(`/api/getTimetable?version=${VERSION}&courses=ITX0020`, {
    sql: timetableSql({ count: 1, rows: [{ course_id: 'ITX0020' }] }),
  });
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(body, [{ course_id: 'ITX0020' }]);
  assert.strictEqual(response.headers.get('Cache-Control'), 'private, max-age=31536000, immutable');
});

test('a stale timetable version is the 409 envelope and is not cached', async () => {
  const { response, body } = await call(`/api/getTimetable?version=${VERSION}&courses=ITX0020`, {
    sql: async () => [{ version_match: false, count: 0 }],
  });
  assert.strictEqual(response.status, 409);
  assert.deepStrictEqual(body, { error: 'version_changed' });
  assert.strictEqual(response.headers.get('Cache-Control'), 'no-store');
});

test('a missing database url is a 500 envelope and does not leak', async () => {
  const { response, body } = await call('/api/getDatasetManifest', {
    env: {},
  });
  assert.strictEqual(response.status, 500);
  assert.deepStrictEqual(body, { error: 'manifest_unavailable' });
  assert.ok(!JSON.stringify(body).includes('NEON_DATABASE_URL'));
});

test('the sql client is rebuilt when the request env url changes', async () => {
  const created = [];
  const createSql = (url) => {
    created.push(url);
    return async () => [{
      dataset_version: VERSION,
      scraping_datetime: '24.08.2026 17:05',
      code: '26s',
      label: 'x',
      name_et: 'x',
      name_en: 'x',
      start_date: '2026-08-31',
      end_date: '2027-01-15',
      week1_monday: '2026-08-31',
      course_count: 1,
      groups: [],
    }];
  };
  await worker.handleFetch(
    request('/api/getDatasetManifest'),
    { NEON_DATABASE_URL: 'postgres://one' },
    { createSql },
  );
  await worker.handleFetch(
    request('/api/getDatasetManifest'),
    { NEON_DATABASE_URL: 'postgres://one' },
    { createSql },
  );
  await worker.handleFetch(
    request('/api/getDatasetManifest'),
    { NEON_DATABASE_URL: 'postgres://two' },
    { createSql },
  );
  assert.deepStrictEqual(created, ['postgres://one', 'postgres://two']);
});

test('static files are served from ASSETS without the identity header', async () => {
  let seen = null;
  const { response, body } = await call('/main.js', {
    email: null,
    assetsFetch: async (incoming) => {
      seen = new URL(incoming.url).pathname;
      return new Response('console.log(1)', { status: 200, headers: { 'Content-Type': 'text/javascript' } });
    },
  });
  assert.strictEqual(seen, '/main.js');
  assert.strictEqual(response.status, 200);
  assert.strictEqual(body, 'console.log(1)');
});

test('a static miss without an ASSETS binding is 404', async () => {
  const { response } = await call('/favicon.ico', { email: null });
  assert.strictEqual(response.status, 404);
});

test('the worker bundle does not import node builtins or the Netlify signer', async () => {
  const bundlePath = path.join(os.tmpdir(), `tunniplaan-sites-bundle-${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../../sites/worker/index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile: bundlePath,
    conditions: ['worker', 'browser', 'import', 'default'],
    mainFields: ['browser', 'module', 'main'],
    legalComments: 'none',
    logLevel: 'silent',
  });
  const text = fs.readFileSync(bundlePath, 'utf8');
  for (const forbidden of [
    'node:crypto',
    'node:buffer',
    'tunniplaan-human-verification',
    'tt_human_verified',
    'unified_courses.json',
  ]) {
    assert.ok(!text.includes(forbidden), `bundle contains ${forbidden}`);
  }
  const bundled = await import(require('node:url').pathToFileURL(bundlePath).href);
  const response = await bundled.default.fetch(
    new Request('https://tunniplaan.taltech.chatgpt.site/api/getTimetable?courses=ITX0020'),
    {},
  );
  assert.strictEqual(response.status, 401);
  assert.deepStrictEqual(await response.json(), { error: 'unauthenticated' });
});
