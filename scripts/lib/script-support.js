// Helpers shared by the scripts in this directory.
//
// Every one of these existed in two to four byte-identical copies before it
// moved here. loadDotEnv alone was duplicated across contract-test-getcourses,
// contract-test-gettimetable, dev-functions-server and run-sql -- four places
// that all had to agree about what .env means, and no test that would notice if
// one of them drifted.
//
// lib/ is a subdirectory for the same reason it is one under netlify/functions:
// this is a library, not something meant to be run.

const fs = require('node:fs');
const path = require('node:path');

// Reads a .env file into process.env. Deliberately not dotenv: this repository
// has no runtime dependency on it, and the format used here is one line of
// KEY=value with # comments.
//
// An already-exported variable always wins over the file, everywhere in Phase 2.
// That is what lets a one-off run point at another database without editing .env.
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

// Accepts both `--name value` and `--name=value`. The two former copies each
// supported only one of those spellings, which is exactly the kind of drift a
// shared helper removes.
function argValue(name, fallback) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  return fallback;
}

// --source-dir > TUNNIPLAAN_DATA_DIR, and nothing else. Specification 7.2.2.
//
// There is deliberately no repository-root fallback: Phase 1 removed
// sessions.json from this repo, and a silent fallback is how a contract test
// passes against the wrong data. Throws rather than exiting, so each caller
// keeps its own reporting convention.
function resolveSourceDir() {
  const candidates = [
    [argValue('source-dir'), '--source-dir'],
    [process.env.TUNNIPLAAN_DATA_DIR, 'TUNNIPLAAN_DATA_DIR'],
  ];
  for (const [value, origin] of candidates) {
    if (!value) continue;
    if (!fs.existsSync(value) || !fs.statSync(value).isDirectory()) {
      throw new Error(`${origin} points at ${value}, which is not a directory`);
    }
    return path.resolve(value);
  }
  throw new Error('no source directory. Pass --source-dir or set TUNNIPLAAN_DATA_DIR. '
    + 'There is no repository-root fallback on purpose.');
}

// The data endpoints are gated, so a script calling handler() has to arrive as
// a verified visitor. It signs its own pass rather than going through the HTTP
// endpoint, because what these scripts test is the dataset contract, not the
// gate -- and an ungated deployment must not make them fail, hence the guard.
//
// Evaluated at call time, not at module load: getSecret() derives from
// NEON_DATABASE_URL, which loadDotEnv has not read yet when this file is parsed.
function humanHeaders() {
  const human = require('../../netlify/functions/lib/humanVerification.js');
  if (!human.isEnabled() || !human.getSecret()) return {};
  return { cookie: `${human.HUMAN_COOKIE}=${human.createCookieValue()}` };
}

module.exports = { loadDotEnv, argValue, resolveSourceDir, humanHeaders };
