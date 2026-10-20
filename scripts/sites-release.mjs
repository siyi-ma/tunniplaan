// npm run sites:release -- --dest <site-source-folder>
//
// Refuses a dirty worktree, builds dist/, and copies it into the folder Siyi
// saves a version from. It does not deploy, and it does not talk to Neon.

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertCleanWorktree, assertNoDatasetDump, copyRelease } from './lib/sites-guards.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argValue(name) {
  const flag = `--${name}`;
  const prefix = `${flag}=`;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flag) return argv[i + 1];
    if (argv[i].startsWith(prefix)) return argv[i].slice(prefix.length);
  }
  return undefined;
}

const destArg = argValue('dest') || process.env.SITES_RELEASE_DIR;
if (!destArg) {
  console.error('sites:release needs --dest <site-source-folder> (or SITES_RELEASE_DIR).');
  console.error('It builds dist/ and copies client/, server/ and .openai/ there. It does not deploy.');
  process.exit(2);
}

try {
  assertCleanWorktree(root);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const built = spawnSync(process.execPath, [path.join(root, 'scripts/build-sites.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (built.status !== 0) process.exit(built.status === null ? 1 : built.status);

const dist = path.join(root, 'dist');
const dest = path.resolve(destArg);
try {
  assertNoDatasetDump(dist);
  copyRelease(dist, dest);
  assertNoDatasetDump(dest);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`Copied dist/ to ${dest}`);
console.log('Next, in the ChatGPT Sites UI: save a version from that folder, then deploy it.');
console.log('This command did not deploy anything.');
