const { test } = require('node:test');
const assert = require('node:assert');
const CourseData = require('../../course-data.js');

const VERSION = 'a'.repeat(64);
const NEW_VERSION = 'b'.repeat(64);

function course(id) {
  return { id, name_et: `Aine ${id}`, name_en: `Course ${id}` };
}

function manifest(overrides = {}) {
  return {
    dataset_version: VERSION,
    scraping_datetime: '24.08.2026 17:05',
    semester: { code: '26s', label: '2026/2027 sügis' },
    groupToFacultyMap: { IADB11: 'I', 'EAKB10_K (Saaremaa vald)': 'E' },
    course_count: 5,
    page_size: 2,
    total_pages: 3,
    ...overrides,
  };
}

function page(number, ids, version = VERSION, total = 3) {
  return {
    dataset_version: version,
    page: number,
    page_size: 2,
    total_pages: total,
    courses: ids.map(course),
  };
}

const DEFAULT_PAGES = {
  0: page(0, ['A1', 'A2']),
  1: page(1, ['B1', 'B2']),
  2: page(2, ['C1']),
};

// A fetch double that records calls, can delay individual pages, and can be
// told to answer differently on a second manifest fetch.
function makeFetch({ manifests, pages = DEFAULT_PAGES, fallback, delays = {}, failPages = {} } = {}) {
  const calls = [];
  let manifestCalls = 0;
  const manifestQueue = Array.isArray(manifests) ? manifests.slice() : [manifest()];

  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('getDatasetManifest')) {
      const next = manifestQueue.length > 1 ? manifestQueue.shift() : manifestQueue[0];
      manifestCalls++;
      if (next instanceof Error) throw next;
      return jsonResponse(next);
    }
    if (url.includes('unified_courses.json')) {
      if (!fallback) return { ok: false, status: 404, json: async () => ({}) };
      return jsonResponse(fallback);
    }
    const pageNumber = Number(new URL(url, 'http://x').searchParams.get('page'));
    if (delays[pageNumber]) await new Promise((r) => setTimeout(r, delays[pageNumber]));
    if (failPages[pageNumber]) {
      const { status, body } = failPages[pageNumber];
      return { ok: false, status, json: async () => body };
    }
    return jsonResponse(pages[pageNumber]);
  };

  return { fetchImpl, calls, manifestCallCount: () => manifestCalls };
}

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

// --- happy path ------------------------------------------------------------

test('assembles the envelope main.js already consumes', async () => {
  const { fetchImpl } = makeFetch();
  const data = await CourseData.loadCourseData({ fetchImpl });

  assert.deepStrictEqual(Object.keys(data).sort(), [
    'courses', 'dataset_version', 'groupToFacultyMap', 'scraping_datetime',
    'semester', 'source',
  ]);
  assert.strictEqual(data.courses.length, 5);
  assert.strictEqual(data.scraping_datetime, '24.08.2026 17:05');
  assert.strictEqual(data.semester.code, '26s');
  assert.strictEqual(data.dataset_version, VERSION);
  assert.strictEqual(data.source, 'api');
});

test('the manifest is fetched with no-store', async () => {
  // Its freshness is what invalidates every immutable page behind it, so a
  // browser cache hit here would pin the tab to a dead version.
  const { fetchImpl, calls } = makeFetch();
  await CourseData.loadCourseData({ fetchImpl });
  const manifestCall = calls.find((c) => c.url.includes('getDatasetManifest'));
  assert.strictEqual(manifestCall.options.cache, 'no-store');
});

test('pages arriving out of order still assemble in page order', async () => {
  // Page 0 is deliberately the slowest, so it resolves last.
  const { fetchImpl } = makeFetch({ delays: { 0: 30, 1: 10 } });
  const data = await CourseData.loadCourseData({ fetchImpl });
  assert.deepStrictEqual(data.courses.map((c) => c.id), ['A1', 'A2', 'B1', 'B2', 'C1']);
});

test('the group map is passed through untouched, suffixes and all', async () => {
  // main.js strips location suffixes when it builds facultyToGroupsMap. This
  // loader must not pre-strip them: 60 of the 430 real keys carry a suffix, and
  // stripping in two places would be two things to keep in step.
  const { fetchImpl } = makeFetch();
  const data = await CourseData.loadCourseData({ fetchImpl });
  assert.strictEqual(data.groupToFacultyMap['EAKB10_K (Saaremaa vald)'], 'E');
});

test('never runs more than four requests at once', async () => {
  let inFlight = 0;
  let peak = 0;
  const tracker = {
    start() { inFlight++; peak = Math.max(peak, inFlight); },
    finish() { inFlight--; },
  };
  const many = {};
  for (let i = 0; i < 12; i++) many[i] = page(i, [`P${i}`], VERSION, 12);
  const { fetchImpl } = makeFetch({
    manifests: [manifest({ course_count: 12, page_size: 1, total_pages: 12 })],
    pages: many,
    delays: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, 5])),
  });

  await CourseData.loadCourseData({ fetchImpl, tracker });
  assert.ok(peak <= CourseData.MAX_CONCURRENCY, `peak concurrency was ${peak}`);
  assert.ok(peak > 1, 'requests should overlap at all');
});

// --- refusing partial data -------------------------------------------------

test('a missing page fails the whole load', async () => {
  const { fetchImpl } = makeFetch({ pages: { 0: DEFAULT_PAGES[0], 1: DEFAULT_PAGES[1], 2: page(1, ['C1']) } });
  await assert.rejects(() => CourseData.loadCourseData({ fetchImpl }),
    /asked for page 2, got page 1/);
});

test('a duplicate course across pages fails the whole load', async () => {
  const { fetchImpl } = makeFetch({
    pages: { 0: DEFAULT_PAGES[0], 1: page(1, ['A1', 'B2']), 2: DEFAULT_PAGES[2] },
  });
  await assert.rejects(() => CourseData.loadCourseData({ fetchImpl }),
    /course A1 appears on more than one page/);
});

test('a course count different from the manifest fails the whole load', async () => {
  const { fetchImpl } = makeFetch({ pages: { ...DEFAULT_PAGES, 2: page(2, []) } });
  await assert.rejects(() => CourseData.loadCourseData({ fetchImpl }),
    /assembled 4 courses, manifest said 5/);
});

test('a manifest whose page count disagrees with its own arithmetic is refused', async () => {
  const { fetchImpl } = makeFetch({ manifests: [manifest({ total_pages: 9 })] });
  await assert.rejects(() => CourseData.loadCourseData({ fetchImpl }),
    /total_pages 9 disagrees/);
});

test('a malformed manifest version is refused before any page is fetched', async () => {
  const { fetchImpl, calls } = makeFetch({ manifests: [manifest({ dataset_version: 'nope' })] });
  await assert.rejects(() => CourseData.loadCourseData({ fetchImpl }),
    /dataset_version is not 64 hex/);
  assert.strictEqual(calls.filter((c) => c.url.includes('getCourses')).length, 0);
});

test('an empty dataset is an error, not an empty course list', async () => {
  const { fetchImpl } = makeFetch({
    manifests: [manifest({ course_count: 0, total_pages: 0 })],
  });
  await assert.rejects(() => CourseData.loadCourseData({ fetchImpl }), /dataset is empty/);
});

// --- the version race ------------------------------------------------------

test('one version race is retried from a fresh manifest', async () => {
  // An ingest lands between the manifest and page 2. The first attempt is
  // discarded entirely; the retry succeeds against the new version.
  let attempt = 0;
  const fetchImpl = async (url, options) => {
    if (url.includes('getDatasetManifest')) {
      attempt++;
      return jsonResponse(attempt === 1 ? manifest() : manifest({ dataset_version: NEW_VERSION }));
    }
    const pageNumber = Number(new URL(url, 'http://x').searchParams.get('page'));
    if (attempt === 1 && pageNumber === 2) {
      return { ok: false, status: 409, json: async () => ({ error: 'version_changed' }) };
    }
    return jsonResponse(page(pageNumber,
      DEFAULT_PAGES[pageNumber].courses.map((c) => c.id), NEW_VERSION));
  };

  const data = await CourseData.loadCourseData({ fetchImpl });
  assert.strictEqual(data.dataset_version, NEW_VERSION);
  assert.strictEqual(data.courses.length, 5);
  assert.strictEqual(attempt, 2, 'exactly one retry');
});

test('a second version race fails rather than looping', async () => {
  let manifestCalls = 0;
  const fetchImpl = async (url) => {
    if (url.includes('getDatasetManifest')) {
      manifestCalls++;
      return jsonResponse(manifest());
    }
    return { ok: false, status: 409, json: async () => ({ error: 'version_changed' }) };
  };
  await assert.rejects(() => CourseData.loadCourseData({ fetchImpl }), /409/);
  assert.strictEqual(manifestCalls, 2, 'two attempts, then stop');
});

test('a page carrying the wrong version is a race, not silently accepted', async () => {
  const { fetchImpl } = makeFetch({
    pages: { ...DEFAULT_PAGES, 1: page(1, ['B1', 'B2'], NEW_VERSION) },
  });
  await assert.rejects(() => CourseData.loadCourseData({ fetchImpl }),
    /carries version b+, manifest said a+/);
});

// --- fallback --------------------------------------------------------------

const STATIC = {
  semester: { code: '26s', label: 'static' },
  courses: [course('S1')],
  groupToFacultyMap: { IADB11: 'I' },
  scraping_datetime: '01.08.2026 10:00',
};

test('the static fallback is used only when explicitly enabled', async () => {
  const { fetchImpl } = makeFetch({ manifests: [new Error('network down')], fallback: STATIC });
  await assert.rejects(() => CourseData.loadCourseData({ fetchImpl }), /network down/);

  const second = makeFetch({ manifests: [new Error('network down')], fallback: STATIC });
  const data = await CourseData.loadCourseData({
    fetchImpl: second.fetchImpl, allowFallback: true,
  });
  assert.strictEqual(data.source, 'fallback');
  assert.strictEqual(data.courses.length, 1);
});

test('fallback data carries no dataset version', async () => {
  // Which is what tells the caller to disable the calendar: a versionless tab
  // must not ask for sessions that belong to a newer dataset.
  const { fetchImpl } = makeFetch({ manifests: [new Error('down')], fallback: STATIC });
  const data = await CourseData.loadCourseData({ fetchImpl, allowFallback: true });
  assert.strictEqual(data.dataset_version, null);
  assert.strictEqual(data.scraping_datetime, '01.08.2026 10:00');
});

test('the fallback sync date is the static file own date, never the manifest', async () => {
  // Showing the manifest's newer timestamp over older static cards would be a
  // lie about what the user is looking at.
  const { fetchImpl } = makeFetch({
    manifests: [manifest({ course_count: 99 })],   // manifest loads, pages fail
    pages: {},
    failPages: { 0: { status: 500, body: { error: 'courses_unavailable' } } },
    fallback: STATIC,
  });
  const data = await CourseData.loadCourseData({ fetchImpl, allowFallback: true });
  assert.strictEqual(data.source, 'fallback');
  assert.strictEqual(data.scraping_datetime, STATIC.scraping_datetime);
  assert.notStrictEqual(data.scraping_datetime, '24.08.2026 17:05');
});

// --- freshness -------------------------------------------------------------

test('a freshness check reports a genuinely new version', async () => {
  const { fetchImpl } = makeFetch({ manifests: [manifest({ dataset_version: NEW_VERSION })] });
  const checker = CourseData.createFreshnessChecker({ fetchImpl, intervalMs: 0 });
  assert.strictEqual(await checker.check(VERSION), NEW_VERSION);
});

test('the same version reports nothing', async () => {
  const { fetchImpl } = makeFetch();
  const checker = CourseData.createFreshnessChecker({ fetchImpl, intervalMs: 0 });
  assert.strictEqual(await checker.check(VERSION), null);
});

test('checks are throttled to once per interval', async () => {
  let clock = 0;
  const { fetchImpl, manifestCallCount } = makeFetch({
    manifests: [manifest({ dataset_version: NEW_VERSION })],
  });
  const checker = CourseData.createFreshnessChecker({
    fetchImpl, now: () => clock, intervalMs: 5 * 60 * 1000,
  });

  assert.strictEqual(await checker.check(VERSION), NEW_VERSION);
  clock += 60 * 1000;
  assert.strictEqual(await checker.check(VERSION), null, 'too soon');
  assert.strictEqual(manifestCallCount(), 1, 'no second request inside the window');
  clock += 5 * 60 * 1000;
  assert.strictEqual(await checker.check(VERSION), NEW_VERSION);
  assert.strictEqual(manifestCallCount(), 2);
});

test('a dismissed version stays dismissed', async () => {
  const { fetchImpl } = makeFetch({ manifests: [manifest({ dataset_version: NEW_VERSION })] });
  const checker = CourseData.createFreshnessChecker({ fetchImpl, intervalMs: 0 });
  assert.strictEqual(await checker.check(VERSION), NEW_VERSION);
  checker.dismiss(NEW_VERSION);
  assert.strictEqual(await checker.check(VERSION), null);
  assert.ok(checker.isDismissed(NEW_VERSION));
});

test('a failed freshness check is silent', async () => {
  // The tab is working fine; a background check that could not reach the
  // network is not news the user needs.
  const { fetchImpl } = makeFetch({ manifests: [new Error('offline')] });
  const checker = CourseData.createFreshnessChecker({ fetchImpl, intervalMs: 0 });
  assert.strictEqual(await checker.check(VERSION), null);
});

test('the checker never triggers a reload itself', () => {
  // The module must expose no way to navigate. The reload is the user's action.
  const source = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '..', '..', 'course-data.js'), 'utf-8');
  assert.ok(!/location\s*\.\s*reload/.test(source), 'course-data.js must not reload the page');
  assert.ok(!/setInterval/.test(source), 'no timer may drive a reload');
});
