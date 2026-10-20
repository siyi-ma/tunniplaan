// Checks shared by build:sites and sites:release.
//
// A full course dump in the Site output would be served as a static file and
// would make the identity check decorative. The build copies an allow-list,
// and these checks refuse the result if a dump name appears anyway.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DUMP_NAMES = new Set(['unified_courses.json', 'sessions.json']);

export function findDatasetDump(dir) {
  const found = [];
  if (!dir || !fs.existsSync(dir)) return found;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (DUMP_NAMES.has(entry.name)) found.push(full);
    }
  }
  return found;
}

export function assertNoDatasetDump(dir) {
  const found = findDatasetDump(dir);
  if (found.length === 0) return;
  throw new Error(
    `refusing to ship a dataset dump (it would bypass the Sites identity check):\n${found.join('\n')}`,
  );
}

export function worktreeStatus(root) {
  return execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  });
}

export function assertCleanWorktree(root, status = worktreeStatus(root)) {
  if (String(status).trim()) {
    throw new Error(
      'sites:release refused: the worktree is dirty. Commit the source you '
      + 'intend to ship, then release that commit.\n'
      + String(status).trim(),
    );
  }
}

export function copyRelease(distDir, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of ['client', 'server', '.openai']) {
    const from = path.join(distDir, name);
    const to = path.join(dest, name);
    if (!fs.existsSync(from)) throw new Error(`sites release is missing ${from}`);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
  }
}
