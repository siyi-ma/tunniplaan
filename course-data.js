// course-data.js
//
// Loads the course dataset from the Phase 2 API and reassembles the envelope
// main.js has always consumed: { semester, courses, groupToFacultyMap,
// scraping_datetime }, plus the dataset version the tab is pinned to.
//
// One page load sees exactly one dataset. The manifest names a version, every
// page request carries it, and any disagreement discards the whole attempt
// rather than rendering a mixture. A partial course list is worse than a load
// error: it looks like a complete timetable that quietly lacks courses.
//
// No framework, no bundler. Attaches to window in the browser and exports for
// `node --test`; `fetch` is injectable so the tests need no network.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CourseData = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MANIFEST_URL = '/.netlify/functions/getDatasetManifest';
  const COURSES_URL = '/.netlify/functions/getCourses';
  const STATIC_FALLBACK_URL = './unified_courses.json';

  // Four at a time. Enough to hide latency across six pages, few enough not to
  // stampede a 0.25 CU database from every tab that opens at 08:00.
  const MAX_CONCURRENCY = 4;

  // At most one manifest check per five minutes per tab, and only when the tab
  // becomes visible. Never on a timer.
  const FRESHNESS_INTERVAL_MS = 5 * 60 * 1000;

  const VERSION_PATTERN = /^[0-9a-f]{64}$/;

  class DatasetError extends Error {
    constructor(message, kind) {
      super(message);
      this.name = 'DatasetError';
      this.kind = kind || 'load_failed';
    }
  }

  function defaultFetch() {
    if (typeof fetch === 'function') return fetch;
    throw new DatasetError('no fetch implementation available', 'no_fetch');
  }

  function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') {
      throw new DatasetError('manifest is not an object');
    }
    if (!VERSION_PATTERN.test(manifest.dataset_version || '')) {
      throw new DatasetError(`manifest dataset_version is not 64 hex: ${manifest.dataset_version}`);
    }
    for (const field of ['course_count', 'page_size', 'total_pages']) {
      if (typeof manifest[field] !== 'number' || !Number.isFinite(manifest[field])) {
        throw new DatasetError(`manifest ${field} is not a number: ${manifest[field]}`);
      }
    }
    // total_pages 0 is a legal manifest meaning an empty dataset. It is not
    // something to page through -- page 0 would correctly 404.
    if (manifest.total_pages === 0 || manifest.course_count === 0) {
      throw new DatasetError('the dataset is empty', 'empty_dataset');
    }
    const expectedPages = Math.ceil(manifest.course_count / manifest.page_size);
    if (expectedPages !== manifest.total_pages) {
      throw new DatasetError(
        `manifest total_pages ${manifest.total_pages} disagrees with `
        + `ceil(${manifest.course_count} / ${manifest.page_size}) = ${expectedPages}`);
    }
    return manifest;
  }

  async function fetchJson(fetchImpl, url, options) {
    const response = await fetchImpl(url, options);
    if (!response.ok) {
      let body = null;
      try { body = await response.json(); } catch (e) { /* not JSON; status is enough */ }
      const error = new DatasetError(
        `${url} returned ${response.status}`,
        body && body.error ? body.error : `http_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  // Runs at most `limit` jobs concurrently. Written out rather than pulled in:
  // a dependency for twenty lines would be its own kind of cost.
  //
  // On the first rejection every worker stops pulling new items, and the whole
  // group is awaited before the error propagates. Without both halves,
  // Promise.all would reject on the first failure while the siblings kept
  // issuing fetches, and a retry would start on top of requests still in
  // flight -- overshooting the concurrency limit precisely when the database is
  // already having a bad time.
  async function mapWithConcurrency(items, limit, worker, onStart) {
    const results = new Array(items.length);
    let next = 0;
    let failure = null;
    async function run() {
      while (next < items.length && !failure) {
        const index = next++;
        if (onStart) onStart();
        try {
          results[index] = await worker(items[index], index);
        } catch (error) {
          if (!failure) failure = error;   // keep the first, it caused the rest
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    if (failure) throw failure;
    return results;
  }

  async function fetchAllPages(fetchImpl, manifest, tracker) {
    const pageNumbers = Array.from({ length: manifest.total_pages }, (_, i) => i);
    return mapWithConcurrency(pageNumbers, MAX_CONCURRENCY, async (page) => {
      const url = `${COURSES_URL}?version=${encodeURIComponent(manifest.dataset_version)}`
        + `&page=${page}`;
      let body;
      try {
        body = await fetchJson(fetchImpl, url);
      } finally {
        if (tracker) tracker.finish();
      }
      // A page with no version at all is malformed, not a race. Calling it a
      // race would burn the single retry -- another manifest and another full
      // set of pages — on a response that will be just as malformed next time.
      if (!VERSION_PATTERN.test(body.dataset_version || '')) {
        throw new DatasetError(
          `page ${page} has no usable dataset_version: ${body.dataset_version}`);
      }
      if (body.dataset_version !== manifest.dataset_version) {
        throw new DatasetError(
          `page ${page} carries version ${body.dataset_version}, manifest said `
          + `${manifest.dataset_version}`, 'version_changed');
      }
      if (body.page !== page) {
        throw new DatasetError(`asked for page ${page}, got page ${body.page}`);
      }
      if (!Array.isArray(body.courses)) {
        throw new DatasetError(`page ${page} has no courses array`);
      }
      return body;
    }, tracker ? () => tracker.start() : null);
  }

  function assemble(manifest, pages) {
    const seenPages = new Set();
    const courses = [];
    const seenIds = new Set();
    for (const page of pages) {
      if (seenPages.has(page.page)) {
        throw new DatasetError(`page ${page.page} was returned twice`);
      }
      seenPages.add(page.page);
      for (const course of page.courses) {
        // A string or a null in the array would otherwise assemble into the
        // course list and only fail much later, in a render.
        if (!course || typeof course !== 'object' || typeof course.id !== 'string'
            || !course.id) {
          throw new DatasetError(
            `page ${page.page} contains an entry that is not a course: `
            + `${JSON.stringify(course)}`);
        }
        if (seenIds.has(course.id)) {
          throw new DatasetError(`course ${course.id} appears on more than one page`);
        }
        seenIds.add(course.id);
        courses.push(course);
      }
    }
    for (let page = 0; page < manifest.total_pages; page++) {
      if (!seenPages.has(page)) throw new DatasetError(`page ${page} is missing`);
    }
    if (courses.length !== manifest.course_count) {
      throw new DatasetError(
        `assembled ${courses.length} courses, manifest said ${manifest.course_count}`);
    }
    return {
      semester: manifest.semester,
      courses,
      groupToFacultyMap: manifest.groupToFacultyMap || {},
      scraping_datetime: manifest.scraping_datetime,
      dataset_version: manifest.dataset_version,
      source: 'api',
    };
  }

  async function loadFromApi(fetchImpl, tracker) {
    let manifestBody;
    try {
      manifestBody = await fetchJson(fetchImpl, MANIFEST_URL, { cache: 'no-store' });
    } catch (error) {
      // Not reaching the manifest at all -- a 404 because the function is not
      // deployed, a 503 because no dataset is active, a dead network -- is the
      // unavailability the fallback exists for. A manifest that arrives and is
      // wrong is not, and validateManifest below keeps its own error kind.
      error.kind = 'api_unavailable';
      throw error;
    }
    const manifest = validateManifest(manifestBody);
    const pages = await fetchAllPages(fetchImpl, manifest, tracker);
    return assemble(manifest, pages);
  }

  /**
   * Load the dataset. Exactly one retry on a version race: an ingest landing
   * mid-load is normal, two in a row while one tab loads six pages is not, and
   * retrying forever would be a loop rather than a recovery.
   */
  // Spec 11 scopes the fallback to "when the manifest/course API is
  // unavailable". A consistency failure -- a count mismatch, a duplicate course,
  // an empty dataset -- means the API answered and the answer was wrong. Serving
  // an old file instead would hide a broken ingest behind stale-but-plausible
  // data, which is the failure mode this whole phase exists to prevent.
  function isUnavailable(error) {
    if (!error) return false;
    if (error.kind === 'api_unavailable' || error.kind === 'no_fetch') return true;
    if (typeof error.status === 'number') return error.status >= 500;
    // A raw throw from fetch itself: no status, no kind. That is the network.
    return error.kind === undefined && !(error instanceof DatasetError);
  }

  async function loadCourseData(options) {
    const settings = options || {};
    const fetchImpl = settings.fetchImpl || defaultFetch();
    const tracker = settings.tracker || null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await loadFromApi(fetchImpl, tracker);
      } catch (error) {
        const isRace = error.kind === 'version_changed';
        if (isRace && attempt === 0) continue;   // discard everything, start over
        if (settings.allowFallback && isUnavailable(error)) {
          return loadStaticFallback(fetchImpl, error);
        }
        throw error;
      }
    }
    /* istanbul ignore next -- the loop always returns or throws */
    throw new DatasetError('unreachable');
  }

  /**
   * The temporary rollback path: the committed unified_courses.json. It carries
   * no dataset_version, so a tab on the fallback must not make versioned
   * calendar requests -- the caller disables that view and says why.
   */
  async function loadStaticFallback(fetchImpl, cause) {
    const data = await fetchJson(fetchImpl, STATIC_FALLBACK_URL, { cache: 'no-store' });
    return {
      semester: data.semester,
      courses: data.courses || [],
      groupToFacultyMap: data.groupToFacultyMap || {},
      scraping_datetime: data.scraping_datetime,
      dataset_version: null,
      source: 'fallback',
      fallbackReason: cause ? cause.message : null,
    };
  }

  /**
   * Has the dataset changed since this tab loaded? Returns the new version, or
   * null. Throttled and never scheduled: the caller invokes it on
   * visibilitychange, and acts only by offering the user a reload.
   */
  function createFreshnessChecker(options) {
    const settings = options || {};
    const fetchImpl = settings.fetchImpl || defaultFetch();
    const now = settings.now || (() => Date.now());
    const interval = settings.intervalMs === undefined
      ? FRESHNESS_INTERVAL_MS : settings.intervalMs;
    // -Infinity, not 0: the first check after a tab is opened must always run,
    // whatever epoch the clock counts from.
    let lastCheck = -Infinity;
    const dismissed = new Set();

    return {
      dismiss(version) { dismissed.add(version); },
      isDismissed(version) { return dismissed.has(version); },
      async check(currentVersion) {
        const time = now();
        if (time - lastCheck < interval) return null;
        lastCheck = time;
        let manifest;
        try {
          manifest = await fetchJson(fetchImpl, MANIFEST_URL, { cache: 'no-store' });
        } catch (error) {
          return null;   // a failed freshness check is not worth telling anyone about
        }
        const version = manifest && manifest.dataset_version;
        if (!VERSION_PATTERN.test(version || '')) return null;
        if (!currentVersion || version === currentVersion) return null;
        if (dismissed.has(version)) return null;
        return version;
      },
    };
  }

  return {
    loadCourseData,
    loadStaticFallback,
    createFreshnessChecker,
    validateManifest,
    assemble,
    DatasetError,
    MANIFEST_URL,
    COURSES_URL,
    STATIC_FALLBACK_URL,
    MAX_CONCURRENCY,
    FRESHNESS_INTERVAL_MS,
  };
}));
