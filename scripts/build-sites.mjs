// npm run build:sites
//
// Writes:
//   dist/client/                  the static app, marked as the Sites target
//   dist/server/index.js          the Worker
//   dist/.openai/hosting.json     the project link, never secrets
//
// The copy is an allow-list. unified_courses.json is not on it, and a scan
// afterwards refuses the build if a dump name showed up anyway. Netlify does
// not publish dist/; it keeps serving the repository root.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertNoDatasetDump } from './lib/sites-guards.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const client = path.join(dist, 'client');

const STATIC_FILES = ['index.html', 'main.js', 'main.css', 'course-data.js', 'favicon.ico'];
const SITES_META = '<meta name="tunniplaan-target" content="sites">';
const SITES_META_PATTERN = /<meta\s+name="tunniplaan-target"\s+content="sites"\s*>/;
const BUNDLE_FORBIDDEN = [
  'node:crypto',
  'node:buffer',
  'tunniplaan-human-verification',
  'unified_courses.json',
  'tt_human_verified',
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(client, { recursive: true });

for (const file of STATIC_FILES) {
  const from = path.join(root, file);
  if (!fs.existsSync(from)) throw new Error(`static file missing: ${file}`);
  fs.copyFileSync(from, path.join(client, file));
}

const indexPath = path.join(client, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const anchor = '<meta charset="UTF-8">';
if (!html.includes(anchor)) {
  throw new Error('index.html has no charset meta; cannot mark the Sites build');
}
if (!SITES_META_PATTERN.test(html)) {
  const marked = html.replace(anchor, `${anchor}\n    ${SITES_META}`);
  if (marked === html || !SITES_META_PATTERN.test(marked)) {
    throw new Error('failed to mark dist/client/index.html as the Sites target');
  }
  fs.writeFileSync(indexPath, marked);
}

fs.mkdirSync(path.join(dist, '.openai'), { recursive: true });
fs.copyFileSync(
  path.join(root, '.openai', 'hosting.json'),
  path.join(dist, '.openai', 'hosting.json'),
);

const bundled = spawnSync(process.execPath, [path.join(root, 'scripts/bundle-worker.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (bundled.status !== 0) process.exit(bundled.status === null ? 1 : bundled.status);

const bundlePath = path.join(dist, 'server', 'index.js');
if (!fs.existsSync(bundlePath)) throw new Error('worker bundle was not written');
const bundleText = fs.readFileSync(bundlePath, 'utf8');
for (const forbidden of BUNDLE_FORBIDDEN) {
  if (bundleText.includes(forbidden)) {
    throw new Error(`worker bundle contains ${JSON.stringify(forbidden)}`);
  }
}

assertNoDatasetDump(dist);

const hosting = JSON.parse(fs.readFileSync(path.join(dist, '.openai', 'hosting.json'), 'utf8'));
if (hosting && (hosting.NEON_DATABASE_URL || hosting.HUMAN_VERIFICATION_SECRET)) {
  throw new Error('.openai/hosting.json must not carry secrets');
}

console.log('build:sites wrote dist/client, dist/server/index.js and dist/.openai/hosting.json');
