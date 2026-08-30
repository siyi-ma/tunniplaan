// Static assertions over the checked-in DDL. These files are applied by hand
// against Neon, so nothing else catches a clean-schema/migration drift: a column
// added to only one of them produces two databases with different shapes
// depending on whether they were created or migrated.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dbDir = path.resolve(__dirname, '..', '..', 'db');
const schema = fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf-8');
const migrationPath = path.join(dbDir, 'migrations', '20260829_phase2_dataset_version.sql');

// The columns Phase 2 adds, with the type each must carry in both files.
const PHASE2_COLUMNS = [
  ['dataset_version', 'text'],
  ['ingested_at', 'timestamptz'],
];

// Constraint assertions must read statements, not prose: a comment saying
// "do not add NOT NULL here" is not a NOT NULL constraint.
function stripComments(sql) {
  return sql.replace(/--.*$/gm, '');
}

function semestersBlock(sql) {
  const match = stripComments(sql).match(/CREATE TABLE semesters\s*\(([\s\S]*?)\n\);/);
  assert.ok(match, 'schema.sql must declare CREATE TABLE semesters');
  return match[1];
}

test('clean schema declares the Phase 2 dataset identity columns', () => {
  const block = semestersBlock(schema);
  for (const [column, type] of PHASE2_COLUMNS) {
    const declaration = new RegExp(`^\\s*${column}\\s+${type}\\b`, 'm');
    assert.match(block, declaration, `semesters.${column} must be declared ${type}`);
  }
});

test('the Phase 2 columns stay nullable until an ingest backfills them', () => {
  const block = semestersBlock(schema);
  for (const [column] of PHASE2_COLUMNS) {
    const line = block.split('\n').find((l) => new RegExp(`^\\s*${column}\\b`).test(l));
    assert.ok(line, `semesters.${column} must exist`);
    assert.doesNotMatch(line, /NOT NULL/, `semesters.${column} must not be NOT NULL before the first ingest`);
  }
});

test('the Phase 2 migration is idempotent and matches the clean schema', () => {
  assert.ok(fs.existsSync(migrationPath), `${migrationPath} must exist`);
  const migration = stripComments(fs.readFileSync(migrationPath, 'utf-8'));
  for (const [column, type] of PHASE2_COLUMNS) {
    const addColumn = new RegExp(
      `ALTER TABLE semesters\\s+ADD COLUMN IF NOT EXISTS\\s+${column}\\s+${type}\\b`,
      'i',
    );
    assert.match(migration, addColumn, `migration must ADD COLUMN IF NOT EXISTS ${column} ${type}`);
  }
  assert.doesNotMatch(migration, /NOT NULL/, 'migration must not add a NOT NULL constraint');
  assert.doesNotMatch(migration, /DROP\s/i, 'the migration is additive: no DROP');
});
