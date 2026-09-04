// The "prove you are human" gate, shared by every endpoint that serves data.
//
// Ported from survey_maj_dekanaadi_kysitlus, where a Next.js middleware could
// intercept every request before it reached a route. There is no middleware
// layer here -- this is a static page plus three Netlify functions -- so the
// check lives inside the functions themselves. That is also where the only
// thing worth protecting is: the ~1000-course dataset behind Neon. Gating the
// HTML alone would protect nothing, because the HTML is not the asset.
//
// The slider in the browser is UX. The security is the signature: a request
// counts as human iff it carries a cookie this server signed, unexpired.
//
// This file lives in lib/ on purpose. Netlify turns every .js file at the TOP
// level of the functions directory into an endpoint, and this is a library.

const crypto = require('node:crypto');

const HUMAN_COOKIE = 'tt_human_verified';
const MAX_AGE_SECONDS = 60 * 60 * 12;

// A drag that completes faster than this is not a hand; one that takes longer
// than two minutes is a tab someone walked away from, not a session to trust.
const MIN_DURATION_MS = 250;
const MAX_DURATION_MS = 120000;

// Tolerance for a client clock running ahead of ours. Without it, a browser a
// few seconds fast would mint a cookie that its own next request rejects.
const CLOCK_SKEW_SECONDS = 60;

const DENIED_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

// Enabled unless explicitly switched off, matching the survey. Set
// HUMAN_VERIFICATION_ENABLED=false to serve the dataset ungated.
function isEnabled() {
  return process.env.HUMAN_VERIFICATION_ENABLED !== 'false';
}

let derivedSecret = null;

// HUMAN_VERIFICATION_SECRET is the intended input; the fallback exists because
// of how Netlify runs this. humanVerification and getCourses are separate
// lambdas in separate processes, so a per-process random secret -- the shape the
// survey falls back to -- would mint cookies a sibling lambda cannot verify, and
// the gate would reject callers at random. Deriving from NEON_DATABASE_URL gives
// every function the same key without a new variable to set. The hash is
// one-way, so the connection string is never the key itself and no signature
// leaving this server carries anything reversibly derived from it.
function getSecret() {
  if (process.env.HUMAN_VERIFICATION_SECRET) return process.env.HUMAN_VERIFICATION_SECRET;
  if (!process.env.NEON_DATABASE_URL) return null;
  if (!derivedSecret) {
    derivedSecret = crypto
      .createHash('sha256')
      .update(`tunniplaan-human-verification:${process.env.NEON_DATABASE_URL}`)
      .digest('hex');
  }
  return derivedSecret;
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createCookieValue(now = Date.now()) {
  const secret = getSecret();
  if (!secret) throw new Error('human verification signing secret is not configured');
  // The nonce makes two cookies minted in the same second distinct, so one
  // captured value cannot be recognised as "the" cookie for that moment.
  const payload = `v1.${Math.floor(now / 1000)}.${crypto.randomUUID()}`;
  return `${payload}.${sign(payload, secret)}`;
}

function isValidCookieValue(value, now = Date.now()) {
  if (typeof value !== 'string' || value.length === 0) return false;

  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;

  // Age is checked before the HMAC so an expired cookie costs no hashing.
  const issuedAt = Number(parts[1]);
  if (!Number.isSafeInteger(issuedAt)) return false;
  const age = Math.floor(now / 1000) - issuedAt;
  if (age < -CLOCK_SKEW_SECONDS || age > MAX_AGE_SECONDS) return false;

  const secret = getSecret();
  if (!secret) return false;

  // Compared on bytes, in constant time. A plain === on a signature leaks how
  // long a matching prefix was through timing, which is the exact oracle a
  // forger wants: it turns 2^256 guesses into a few hundred.
  const expected = Buffer.from(sign(parts.slice(0, 3).join('.'), secret));
  const actual = Buffer.from(parts[3]);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

// Netlify lowercases incoming header names and so does node:http, but a
// hand-built test event may not, and a case-sensitive lookup that silently
// misses is a gate that silently opens.
function readHeader(event, name) {
  const headers = (event && event.headers) || {};
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) return headers[key];
  }
  return undefined;
}

function readCookie(event, name) {
  const header = readHeader(event, 'cookie');
  if (typeof header !== 'string') return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return part.slice(eq + 1).trim();
  }
  return undefined;
}

function isVerifiedRequest(event) {
  return isValidCookieValue(readCookie(event, HUMAN_COOKIE));
}

function isSecureRequest(event) {
  const proto = readHeader(event, 'x-forwarded-proto');
  if (typeof proto === 'string') return proto.split(',')[0].trim() === 'https';
  return process.env.NODE_ENV === 'production';
}

function serializeSetCookie(value, event) {
  const attributes = [
    `${HUMAN_COOKIE}=${value}`,
    `Max-Age=${MAX_AGE_SECONDS}`,
    'Path=/',
    'HttpOnly',          // the page never needs to read it; script must not either
    'SameSite=Lax',      // a cross-site request cannot spend someone else's pass
  ];
  // Secure is conditional purely so the gate works over plain http on
  // localhost. A Secure cookie is dropped silently there, which would present
  // as a slider that never finishes rather than as a configuration problem.
  if (isSecureRequest(event)) attributes.push('Secure');
  return attributes.join('; ');
}

// Returns null when the request may proceed, or the response to send instead.
//
// Deliberately fails OPEN when no secret can be derived. This gate exists to
// slow bulk scraping down, and a missing environment variable must not take the
// public timetable offline for every student in the university. The log line is
// the alarm; a blank site would be a worse one.
function requireHuman(event) {
  if (!isEnabled()) return null;
  if (!getSecret()) {
    console.error(
      'human verification is enabled but no signing secret is available '
      + '(set HUMAN_VERIFICATION_SECRET). Allowing the request.');
    return null;
  }
  if (isVerifiedRequest(event)) return null;
  return {
    statusCode: 403,
    headers: DENIED_HEADERS,
    body: JSON.stringify({ error: 'human_verification_required' }),
  };
}

// A gated response must never sit in a shared cache. The course pages were
// `public, max-age=31536000, immutable` -- correct while the bytes were public,
// and a straight bypass the moment they are not: Netlify's CDN keys on the URL,
// not on the cookie, so the first verified visitor would warm a cache that then
// answers everybody. Downgrading to `private` keeps the year-long browser cache,
// which is what makes a repeat visit fast, and gives up only the shared hop.
function scopeCacheToClient(response) {
  if (!isEnabled() || !getSecret()) return response;
  const headers = response && response.headers;
  const policy = headers && headers['Cache-Control'];
  if (typeof policy !== 'string' || !policy.startsWith('public')) return response;
  return {
    ...response,
    headers: { ...headers, 'Cache-Control': policy.replace(/^public/, 'private') },
  };
}

// The whole gate as one wrapper, so an endpoint adds exactly one line and
// cannot get half of it right: deny an unverified caller, and keep a verified
// caller's response out of the shared cache.
async function withHumanGate(event, run) {
  const denial = requireHuman(event);
  if (denial) return denial;
  return scopeCacheToClient(await run());
}

module.exports = {
  // Tests that switch HUMAN_VERIFICATION_SECRET between cases need the
  // memoised derivation cleared, or a later case passes for the wrong reason.
  _resetSecret: () => { derivedSecret = null; },
  HUMAN_COOKIE,
  MAX_AGE_SECONDS,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  DENIED_HEADERS,
  isEnabled,
  getSecret,
  createCookieValue,
  isValidCookieValue,
  readHeader,
  readCookie,
  isVerifiedRequest,
  serializeSetCookie,
  requireHuman,
  scopeCacheToClient,
  withHumanGate,
};
