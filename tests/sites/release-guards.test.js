const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('a dataset dump name is refused and an allow-list tree is not', async () => {
  const { findDatasetDump, assertNoDatasetDump } = await import('../../scripts/lib/sites-guards.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunniplaan-dump-'));
  fs.mkdirSync(path.join(dir, 'client'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'client', 'index.html'), '<html></html>');
  assert.deepStrictEqual(findDatasetDump(dir), []);
  assert.doesNotThrow(() => assertNoDatasetDump(dir));

  fs.writeFileSync(path.join(dir, 'client', 'unified_courses.json'), '{}');
  fs.mkdirSync(path.join(dir, 'nested'));
  fs.writeFileSync(path.join(dir, 'nested', 'sessions.json'), '{}');
  const found = findDatasetDump(dir).map((file) => path.basename(file)).sort();
  assert.deepStrictEqual(found, ['sessions.json', 'unified_courses.json']);
  assert.throws(() => assertNoDatasetDump(dir), /dataset dump/);
});

test('sites:release refuses a dirty worktree status without asking git', async () => {
  const { assertCleanWorktree } = await import('../../scripts/lib/sites-guards.mjs');
  assert.throws(() => assertCleanWorktree('/tmp', ' M main.js\n'), /dirty/);
  assert.doesNotThrow(() => assertCleanWorktree('/tmp', ''));
  assert.doesNotThrow(() => assertCleanWorktree('/tmp', '\n'));
});

test('copyRelease mirrors client, server and hosting.json and nothing else', async () => {
  const { copyRelease, findDatasetDump } = await import('../../scripts/lib/sites-guards.mjs');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'tunniplaan-dist-'));
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'tunniplaan-dest-'));
  fs.mkdirSync(path.join(dist, 'client'));
  fs.mkdirSync(path.join(dist, 'server'));
  fs.mkdirSync(path.join(dist, '.openai'));
  fs.writeFileSync(path.join(dist, 'client', 'index.html'), '<meta name="tunniplaan-target" content="sites">');
  fs.writeFileSync(path.join(dist, 'server', 'index.js'), 'export default {}');
  fs.writeFileSync(path.join(dist, '.openai', 'hosting.json'), '{"project_id":null,"d1":null,"r2":null}\n');
  fs.writeFileSync(path.join(dist, 'notes.txt'), 'not part of the release');
  fs.writeFileSync(path.join(dest, 'keep.txt'), 'left in place');

  copyRelease(dist, dest);

  assert.strictEqual(
    fs.readFileSync(path.join(dest, 'client', 'index.html'), 'utf8'),
    '<meta name="tunniplaan-target" content="sites">',
  );
  assert.strictEqual(fs.existsSync(path.join(dest, 'server', 'index.js')), true);
  assert.strictEqual(fs.existsSync(path.join(dest, 'notes.txt')), false);
  assert.strictEqual(fs.readFileSync(path.join(dest, 'keep.txt'), 'utf8'), 'left in place');
  const hosting = JSON.parse(fs.readFileSync(path.join(dest, '.openai', 'hosting.json'), 'utf8'));
  assert.strictEqual(hosting.project_id, null);
  assert.strictEqual(Object.hasOwn(hosting, 'NEON_DATABASE_URL'), false);
  assert.deepStrictEqual(findDatasetDump(dest), []);
});
