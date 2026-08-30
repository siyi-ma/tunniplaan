// Shared pieces of the Phase 2 dataset API.
//
// This lives in a subdirectory on purpose: Netlify turns each .js file at the
// top level of the functions directory into an endpoint, and this is a library,
// not a function.

const { neon } = require('@neondatabase/serverless');

// Server-owned constant. Clients do not choose a page size; the manifest tells
// them what it is. Against the current dataset the largest serialized page is
// about 1.05 MiB, well under the 4.5 MiB ceiling.
const PAGE_SIZE = 200;

const DATASET_VERSION_PATTERN = /^[0-9a-f]{64}$/;

// Every error response, and the manifest itself, must be uncacheable. A cached
// error outlives the ingest that would have fixed it.
const NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

// Content-addressed URLs: the bytes behind a given version can never change, so
// they take the same one-year policy as a bundler's [contenthash] filename.
const IMMUTABLE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=31536000, immutable',
};

let cachedSql = null;
function getSql() {
  if (!cachedSql) {
    cachedSql = neon(process.env.NEON_DATABASE_URL);
  }
  return cachedSql;
}

function jsonResponse(statusCode, payload, headers = NO_STORE_HEADERS) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function isDatasetVersion(value) {
  return typeof value === 'string' && DATASET_VERSION_PATTERN.test(value);
}

// Postgres returns bigint as a string to avoid precision loss. The wire format
// says number, and JSON.stringify would happily emit "1030" with quotes.
function toCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function totalPages(courseCount) {
  return Math.ceil(toCount(courseCount) / PAGE_SIZE);
}

// The driver may hand back a Date or a full timestamp string depending on the
// column type and the connection. The manifest contract says YYYY-MM-DD.
function toIsoDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

class GroupMapConflict extends Error {}

// Folded in JS rather than with jsonb_object_agg so a conflict is an error
// instead of a last-write-wins silent overwrite. (semester_code, code) is the
// groups primary key, so a genuine conflict means the database invariant is
// broken, and a quietly wrong group filter is worse than a 500.
function foldGroupMap(pairs) {
  const map = {};
  for (const pair of pairs || []) {
    const [code, facultyCode] = pair;
    if (code in map && map[code] !== facultyCode) {
      throw new GroupMapConflict(
        `group ${code} maps to both ${map[code]} and ${facultyCode}`,
      );
    }
    map[code] = facultyCode;
  }
  return map;
}

module.exports = {
  // Tests that assert configuration failures need the memoised client cleared,
  // or they pass for the wrong reason as soon as an earlier test connects once.
  _resetSql: () => { cachedSql = null; },
  PAGE_SIZE,
  NO_STORE_HEADERS,
  IMMUTABLE_HEADERS,
  GroupMapConflict,
  getSql,
  jsonResponse,
  isDatasetVersion,
  toCount,
  totalPages,
  toIsoDate,
  foldGroupMap,
};
