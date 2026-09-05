// scripts/sample-verify-vs-official.js
//
// Random-sample verification of the webapp against the upstream source of truth.
//
//   node scripts/sample-verify-vs-official.js [--groups N] [--seed S] [--out FILE]
//   node scripts/sample-verify-vs-official.js --only CODE1,CODE2 [--out FILE]
//
// The contract tests prove the API serves what the scrape wrote. They cannot
// prove the scrape read the site correctly: both sides of that comparison come
// from the same Selenium run. This script closes that loop by asking TalTech's
// own public REST API -- the one its Angular SPA at tunniplaan.taltech.ee calls,
// a different transport and a different parse from our pipeline -- for the same
// groups, and diffing session-for-session.
//
// For each sampled group it reproduces what the webapp actually shows:
//   1. courses whose `groups` array lists the group      (getCourses)
//   2. every session of those courses                    (getTimetable)
//   3. filtered to sessions the group attends            (main.js:1156)
// Step 3 matters: getTimetable answers per course, not per group, so skipping
// it would compare our whole-course session list against the group's timetable.
//
// Requests go through `exports.handler`, not `handleRequest`, so the human
// gate is on the path being measured. The script signs itself a pass the same
// way the contract tests do.
//
// A diff is not automatically our bug. The upstream timetable is edited
// continuously and our dataset is a snapshot taken at scrape time, so a session
// added upstream this afternoon is a legitimate difference. The report prints
// the scrape timestamp beside the run time for exactly that reason.
//
// Verification tooling, not shipped code.

const fs = require('fs');
const path = require('path');

const { loadDotEnv, argValue, humanHeaders } = require('./lib/script-support.js');

const OFFICIAL_API = 'https://tunniplaan-api.taltech.ee/api/public/';
const DEFAULT_SAMPLE = 12;

// ---------------------------------------------------------------- our side

const manifestFn = require('../netlify/functions/getDatasetManifest.js');
const coursesFn = require('../netlify/functions/getCourses.js');
const timetableFn = require('../netlify/functions/getTimetable.js');

// Netlify hands the handler an event; only the fields the handlers read are
// supplied, matching scripts/dev-functions-server.js.
async function callFunction(fn, query) {
  const res = await fn.handler({
    httpMethod: 'GET',
    headers: humanHeaders(),
    queryStringParameters: query,
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function loadManifest() {
  const res = await callFunction(manifestFn, {});
  if (res.statusCode !== 200) {
    throw new Error(`getDatasetManifest returned ${res.statusCode}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function loadAllCourses(version, totalPages) {
  const courses = [];
  for (let page = 0; page < totalPages; page += 1) {
    const res = await callFunction(coursesFn, { version, page: String(page) });
    if (res.statusCode !== 200) {
      throw new Error(`getCourses page ${page} returned ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
    courses.push(...res.body.courses);
  }
  return courses;
}

// getTimetable refuses a request whose courses hold more than 4000 sessions.
// A single group can exceed that on its own, because a shared lecture pulls in
// every other group's sittings of it, so split rather than give up.
async function fetchSessions(courseIds, version) {
  if (courseIds.length === 0) return [];
  const res = await callFunction(timetableFn, { courses: courseIds.join(','), version });

  // A versioned success is a bare array. limit_exceeded is *also* a 200 -- it is
  // an envelope, not an HTTP error (getTimetable.js:72) -- so the shape, not the
  // status, decides which one this is.
  if (res.statusCode === 200 && Array.isArray(res.body)) return res.body;

  const isLimit = res.statusCode === 200
    && res.body && res.body.error === 'limit_exceeded';
  if (isLimit && courseIds.length > 1) {
    const mid = Math.ceil(courseIds.length / 2);
    const [left, right] = await Promise.all([
      fetchSessions(courseIds.slice(0, mid), version),
      fetchSessions(courseIds.slice(mid), version),
    ]);
    return left.concat(right);
  }
  throw new Error(`getTimetable returned ${res.statusCode}: ${JSON.stringify(res.body)}`);
}

// ----------------------------------------------------------- official side

async function officialGet(pathAndQuery) {
  const res = await fetch(OFFICIAL_API + pathAndQuery);
  if (!res.ok) throw new Error(`GET ${pathAndQuery} -> ${res.status}`);
  return res.json();
}

async function officialPost(endpoint, body) {
  const res = await fetch(OFFICIAL_API + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${endpoint} -> ${res.status}`);
  return res.json();
}

// departments -> curriculums -> studentGroups. The same group code can hang off
// more than one curriculum, each with its own sgId; the timetable is the union.
async function loadOfficialGroups(ttId) {
  const tree = await officialGet(`departments?ttId=${ttId}`);
  const byCode = new Map();
  for (const dep of tree.departments || []) {
    for (const cur of dep.curriculums || []) {
      for (const sg of cur.studentGroups || []) {
        const key = normalizeGroup(sg.code);
        if (!key) continue;
        if (!byCode.has(key)) byCode.set(key, { code: sg.code, refs: [] });
        byCode.get(key).refs.push({
          sgId: sg.id,
          curriculumVersionId: sg.curriculumVersionId,
          departmentId: dep.id,
        });
      }
    }
  }
  return byCode;
}

// ------------------------------------------------------------ comparison

const normalizeGroup = (value) => String(value || '').trim().toLowerCase();
const normalizeCourse = (value) => String(value || '').trim().toUpperCase();
const hhmm = (value) => String(value || '').slice(0, 5);

// "31.08.2026" -> "2026-08-31". Our wire format is dotted (getTimetable.js:142);
// the official API is ISO. Compare on ISO.
function isoFromDotted(value) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const sessionKey = (course, date, start, end) => `${course}|${date}|${start}|${end}`;

// One row of the official response covers a repeating event; `dts` holds the
// concrete dates it actually falls on, which is the granularity we store.
function officialKeys(searchResult) {
  const dated = new Set();
  let undated = 0;
  for (const day of searchResult.weekDays || []) {
    for (const row of day.rows || []) {
      const course = normalizeCourse(row.subjectCode);
      const start = hhmm(row.startTime);
      const end = hhmm(row.endTime);
      const dts = Array.isArray(row.dts) ? row.dts : [];
      if (dts.length === 0) { undated += 1; continue; }
      for (const dt of dts) {
        if (dt && dt.date) dated.add(sessionKey(course, dt.date, start, end));
      }
    }
  }
  return { dated, undated };
}

// Mirrors main.js: a session belongs to the group if any entry of its `groups`
// array names it. Sessions with no date are veebiope -- real, but not
// comparable by date, so they are counted rather than diffed.
function ourKeys(sessions, groupKey) {
  const dated = new Set();
  let undated = 0;
  for (const s of sessions) {
    const groups = Array.isArray(s.groups) ? s.groups : [];
    const attends = groups.some((g) => normalizeGroup(g && g.group ? g.group : g) === groupKey);
    if (!attends) continue;
    const iso = isoFromDotted(s.date);
    if (!iso) { undated += 1; continue; }
    dated.add(sessionKey(normalizeCourse(s.course_id), iso, hhmm(s.start), hhmm(s.end)));
  }
  return { dated, undated };
}

// Deterministic sampling: the seed is printed, so a surprising result can be
// replayed exactly instead of chased across a fresh random draw.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(items, n, seed) {
  const pool = items.slice();
  const rand = mulberry32(seed);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}

// ----------------------------------------------------------------- report

function describeDiff(set, limit = 5) {
  return Array.from(set).sort().slice(0, limit);
}

// A coverage gap of two groups is a fact worth naming; a gap of eighty is a
// number. Naming them only when the list is short keeps the report readable.
function namedIfFew(codes, limit = 10) {
  if (codes.length === 0 || codes.length > limit) return '';
  return ` (\`${codes.join('`, `')}\`)`;
}

async function main() {
  loadDotEnv(path.resolve(__dirname, '..', '.env'));
  if (!process.env.NEON_DATABASE_URL) throw new Error('Set NEON_DATABASE_URL');

  const sampleSize = Number(argValue('groups') || DEFAULT_SAMPLE);
  const seed = Number(argValue('seed') || Math.floor(Math.random() * 1e9));
  const outPath = argValue('out');
  const startedAt = new Date();

  const manifest = await loadManifest();
  const version = manifest.dataset_version;
  console.log(`Dataset:  version ${version.slice(0, 12)}… `
    + `semester ${manifest.semester.code} scraped ${manifest.scraping_datetime}`);
  console.log(`Courses:  ${manifest.course_count} in ${manifest.total_pages} pages`);

  const courses = await loadAllCourses(version, manifest.total_pages);

  // group -> course ids, built once; every sampled group reads it.
  const coursesByGroup = new Map();
  for (const course of courses) {
    for (const group of course.groups || []) {
      const key = normalizeGroup(group);
      if (!key) continue;
      if (!coursesByGroup.has(key)) coursesByGroup.set(key, []);
      coursesByGroup.get(key).push(course.id);
    }
  }

  const timetables = await officialGet('timetables');
  const ttId = timetables.currentId;
  console.log(`Official: ttId ${ttId} "${timetables.currentName}"`);

  const officialGroups = await loadOfficialGroups(ttId);
  const shared = Array.from(officialGroups.keys()).filter((k) => coursesByGroup.has(k)).sort();
  const onlyOurs = Array.from(coursesByGroup.keys()).filter((k) => !officialGroups.has(k)).sort();
  const onlyTheirs = Array.from(officialGroups.keys()).filter((k) => !coursesByGroup.has(k)).sort();
  console.log(`Groups:   ${shared.length} in both, `
    + `${onlyOurs.length} only ours${namedIfFew(onlyOurs).replace(/`/g, '')}, `
    + `${onlyTheirs.length} only official${namedIfFew(onlyTheirs).replace(/`/g, '')}`);

  // --only names groups explicitly instead of sampling them. Random sampling
  // answers "is the dataset right?"; --only answers "is this specific group
  // right?", which is what you need once a sample has pointed at something.
  const only = argValue('only');
  let picked;
  if (only) {
    const wanted = only.split(',').map(normalizeGroup).filter(Boolean);
    const unknown = wanted.filter((k) => !shared.includes(k));
    if (unknown.length) throw new Error(`not in both datasets: ${unknown.join(', ')}`);
    picked = wanted;
    console.log(`Targeted: ${picked.length} named groups (--only)
`);
  } else {
    picked = sample(shared, sampleSize, seed);
    console.log(`Sample:   ${picked.length} groups, seed ${seed}
`);
  }

  const results = [];
  for (const key of picked) {
    const official = officialGroups.get(key);
    const courseIds = Array.from(new Set(coursesByGroup.get(key)));

    // Union every sgId the code appears under.
    const theirs = { dated: new Set(), undated: 0 };
    for (const ref of official.refs) {
      const body = { ttId, sgId: ref.sgId, curriculumVersionId: ref.curriculumVersionId };
      const found = officialKeys(await officialPost('search', body));
      found.dated.forEach((k) => theirs.dated.add(k));
      theirs.undated += found.undated;
    }

    const sessions = await fetchSessions(courseIds, version);
    const ours = ourKeys(sessions, key);

    const missing = new Set([...theirs.dated].filter((k) => !ours.dated.has(k)));
    const extra = new Set([...ours.dated].filter((k) => !theirs.dated.has(k)));
    const matched = theirs.dated.size - missing.size;
    const rate = theirs.dated.size === 0 ? 1 : matched / theirs.dated.size;

    const row = {
      group: official.code,
      courses: courseIds.length,
      official: theirs.dated.size,
      ours: ours.dated.size,
      matched,
      missing: missing.size,
      extra: extra.size,
      officialUndated: theirs.undated,
      oursUndated: ours.undated,
      rate,
      missingSample: describeDiff(missing),
      extraSample: describeDiff(extra),
    };
    results.push(row);

    const verdict = row.missing === 0 && row.extra === 0 ? 'OK  ' : 'DIFF';
    console.log(`${verdict} ${row.group.padEnd(12)} `
      + `official ${String(row.official).padStart(4)}  ours ${String(row.ours).padStart(4)}  `
      + `matched ${String(matched).padStart(4)}  `
      + `missing ${String(row.missing).padStart(3)}  extra ${String(row.extra).padStart(3)}  `
      + `(${(rate * 100).toFixed(1)}%)`);
    if (row.missing) console.log(`       missing e.g. ${row.missingSample.join('  ')}`);
    if (row.extra) console.log(`       extra   e.g. ${row.extraSample.join('  ')}`);
  }

  const totalOfficial = results.reduce((n, r) => n + r.official, 0);
  const totalMatched = results.reduce((n, r) => n + r.matched, 0);
  const totalMissing = results.reduce((n, r) => n + r.missing, 0);
  const totalExtra = results.reduce((n, r) => n + r.extra, 0);
  const clean = results.filter((r) => r.missing === 0 && r.extra === 0).length;
  const overall = totalOfficial === 0 ? 0 : totalMatched / totalOfficial;

  console.log(`\nSAMPLING ${totalMissing === 0 && totalExtra === 0 ? 'OK' : 'DIFF'}: `
    + `${clean}/${results.length} groups exact, `
    + `${totalMatched}/${totalOfficial} sessions matched (${(overall * 100).toFixed(2)}%), `
    + `${totalMissing} missing, ${totalExtra} extra`);

  if (outPath) {
    fs.writeFileSync(outPath, renderReport({
      startedAt, seed, manifest, timetables, shared, onlyOurs, onlyTheirs, results,
      totalOfficial, totalMatched, totalMissing, totalExtra, clean, overall,
    }), 'utf-8');
    console.log(`Report written to ${outPath}`);
  }

  process.exitCode = 0;
}

function renderReport(r) {
  const lines = [];
  lines.push('# Sampling verification: webapp vs. tunniplaan.taltech.ee');
  lines.push('');
  lines.push(`- **Run**: ${r.startedAt.toISOString().slice(0, 19).replace('T', ' ')} UTC`);
  lines.push(`- **Seed**: \`${r.seed}\` (replay with \`--seed ${r.seed}\`)`);
  lines.push(`- **Dataset version**: \`${r.manifest.dataset_version}\``);
  lines.push(`- **Scraped**: ${r.manifest.scraping_datetime}`);
  lines.push(`- **Semester**: ${r.manifest.semester.code} — ${r.manifest.semester.label}`);
  lines.push(`- **Upstream timetable**: ttId ${r.timetables.currentId} "${r.timetables.currentName}"`);
  lines.push(`- **Group coverage**: ${r.shared.length} shared, `
    + `${r.onlyOurs.length} only ours${namedIfFew(r.onlyOurs)}, `
    + `${r.onlyTheirs.length} only upstream${namedIfFew(r.onlyTheirs)}`);
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('For each sampled group the webapp path is reproduced end to end — '
    + '`getDatasetManifest` → `getCourses` → `getTimetable` through `exports.handler`, '
    + 'so the human-verification gate is on the measured path — and the resulting sessions '
    + 'are filtered to the group exactly as `main.js` does. The upstream side is '
    + "TalTech's own public REST API (`api/public/search`), which the official SPA calls: "
    + 'a different transport and parse from our Selenium pipeline, so the two sides are '
    + 'genuinely independent.');
  lines.push('');
  lines.push('Sessions are compared as `(course, date, start, end)`. Undated sessions '
    + '(veebiõpe) are counted, not diffed — they carry no date on either side.');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| Group | Courses | Upstream | Ours | Matched | Missing | Extra | Undated (up/ours) | Rate |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of r.results) {
    lines.push(`| ${row.group} | ${row.courses} | ${row.official} | ${row.ours} | `
      + `${row.matched} | ${row.missing} | ${row.extra} | `
      + `${row.officialUndated}/${row.oursUndated} | ${(row.rate * 100).toFixed(1)}% |`);
  }
  lines.push('');
  lines.push(`**${r.clean}/${r.results.length} groups matched exactly.** `
    + `${r.totalMatched}/${r.totalOfficial} upstream sessions found `
    + `(${(r.overall * 100).toFixed(2)}%), ${r.totalMissing} missing, ${r.totalExtra} extra.`);
  lines.push('');

  const diffs = r.results.filter((row) => row.missing || row.extra);
  if (diffs.length) {
    lines.push('## Differences');
    lines.push('');
    lines.push('Keys are `COURSE|date|start|end`.');
    lines.push('');
    for (const row of diffs) {
      lines.push(`### ${row.group}`);
      lines.push('');
      if (row.missingSample.length) {
        lines.push(`- Upstream, not ours (${row.missing}): \`${row.missingSample.join('`, `')}\``);
      }
      if (row.extraSample.length) {
        lines.push(`- Ours, not upstream (${row.extra}): \`${row.extraSample.join('`, `')}\``);
      }
      lines.push('');
    }
    lines.push('The upstream timetable is edited continuously; our dataset is the snapshot '
      + `taken at ${r.manifest.scraping_datetime}. Differences dated after the scrape are `
      + 'expected and are not evidence of a pipeline fault.');
    lines.push('');
  }
  return lines.join('\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
