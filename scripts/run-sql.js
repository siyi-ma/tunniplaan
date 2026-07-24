// scripts/run-sql.js
// Executes each ;-terminated statement of a .sql file against the connection
// string in the given env var. {{NAME}} placeholders are substituted from the
// environment before execution, so .sql files never contain secrets.
// Usage: node scripts/run-sql.js <file.sql> [ENV_VAR]   (ENV_VAR defaults to NEON_ADMIN_URL)
// Limitation: statements must not contain a ';' at end-of-line mid-statement.
const fs = require('fs');
const { neon } = require('@neondatabase/serverless');

async function main() {
  const [file, envVar = 'NEON_ADMIN_URL'] = process.argv.slice(2);
  if (!file) throw new Error('Usage: node scripts/run-sql.js <file.sql> [ENV_VAR]');
  const url = process.env[envVar];
  if (!url) throw new Error(`Env var ${envVar} is not set`);

  let text = fs.readFileSync(file, 'utf-8');
  text = text.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const val = process.env[name];
    if (!val) throw new Error(`Placeholder {{${name}}} needs env var ${name}`);
    return val;
  });

  const statements = text
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);

  const sql = neon(url);
  for (const stmt of statements) {
    console.log('> ' + stmt.split('\n')[0].slice(0, 70) + ' ...');
    await sql.query(stmt);
  }
  console.log(`Executed ${statements.length} statements from ${file}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
