const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const human = require('../../netlify/functions/lib/humanVerification.js');
const { handleRequest } = require('../../netlify/functions/humanVerification.js');

const SECRET = 'test-secret-not-a-real-one';

// Every case starts from a known secret and an enabled gate. Without the reset
// the memoised derivation from a previous case survives, and a test that means
// to assert "no secret" passes because an old one is still cached.
beforeEach(() => {
  process.env.HUMAN_VERIFICATION_SECRET = SECRET;
  delete process.env.HUMAN_VERIFICATION_ENABLED;
  human._resetSecret();
});

function postEvent(body, extraHeaders) {
  return {
    httpMethod: 'POST',
    headers: { host: 'tunniplaan.netlify.app', ...(extraHeaders || {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

const VALID_BODY = { completed: true, progress: 100, durationMs: 900 };

function cookieEvent(value) {
  return { headers: { cookie: `${human.HUMAN_COOKIE}=${value}` } };
}

// --- the signature -------------------------------------------------------

test('a freshly minted cookie verifies', () => {
  assert.strictEqual(human.isValidCookieValue(human.createCookieValue()), true);
});

test('a cookie signed with a different secret is refused', () => {
  const value = human.createCookieValue();
  process.env.HUMAN_VERIFICATION_SECRET = 'a-completely-different-secret';
  human._resetSecret();
  assert.strictEqual(human.isValidCookieValue(value), false);
});

test('the payload cannot be edited without breaking the signature', () => {
  const [, issuedAt, nonce, signature] = human.createCookieValue().split('.');
  // Re-dating the cookie is the obvious forgery: it is how an expired pass
  // would be made to look current.
  const forged = ['v1', String(Number(issuedAt) + 600), nonce, signature].join('.');
  assert.strictEqual(human.isValidCookieValue(forged), false);
});

test('a cookie older than its maximum age is refused', () => {
  const issued = Date.now() - (human.MAX_AGE_SECONDS + 60) * 1000;
  assert.strictEqual(human.isValidCookieValue(human.createCookieValue(issued)), false);
});

test('a cookie from slightly in the future is accepted, from far ahead is not', () => {
  assert.strictEqual(
    human.isValidCookieValue(human.createCookieValue(Date.now() + 30 * 1000)), true,
    'a client clock 30s fast must not lock the visitor out');
  assert.strictEqual(
    human.isValidCookieValue(human.createCookieValue(Date.now() + 3600 * 1000)), false);
});

test('malformed cookie values are refused rather than throwing', () => {
  for (const value of ['', 'nope', 'v1.abc', 'v2.1.2.3', 'v1.x.y.z', undefined, null, 42]) {
    assert.strictEqual(human.isValidCookieValue(value), false, `accepted ${String(value)}`);
  }
});

// --- admission control ---------------------------------------------------

test('requireHuman refuses a request with no cookie', () => {
  const denial = human.requireHuman({ headers: {} });
  assert.strictEqual(denial.statusCode, 403);
  assert.strictEqual(JSON.parse(denial.body).error, 'human_verification_required');
  assert.strictEqual(denial.headers['Cache-Control'], 'no-store',
    'a cached 403 would outlive the pass that fixes it');
});

test('requireHuman admits a request carrying a valid cookie', () => {
  assert.strictEqual(human.requireHuman(cookieEvent(human.createCookieValue())), null);
});

test('the cookie is found among other cookies and whatever the header case', () => {
  const value = human.createCookieValue();
  assert.strictEqual(human.requireHuman({
    headers: { Cookie: `_ga=GA1.1.x; ${human.HUMAN_COOKIE}=${value}; other=1` },
  }), null);
});

test('requireHuman admits everyone when the gate is switched off', () => {
  process.env.HUMAN_VERIFICATION_ENABLED = 'false';
  assert.strictEqual(human.requireHuman({ headers: {} }), null);
});

test('requireHuman fails open when no secret can be derived', () => {
  delete process.env.HUMAN_VERIFICATION_SECRET;
  const savedUrl = process.env.NEON_DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
  human._resetSecret();
  try {
    // A missing variable must not take the public timetable offline. This is a
    // deliberate choice, so it is pinned rather than left to chance.
    assert.strictEqual(human.requireHuman({ headers: {} }), null);
  } finally {
    if (savedUrl !== undefined) process.env.NEON_DATABASE_URL = savedUrl;
  }
});

test('the secret derived from NEON_DATABASE_URL is stable and is not the URL', () => {
  delete process.env.HUMAN_VERIFICATION_SECRET;
  process.env.NEON_DATABASE_URL = 'postgres://user:pw@host/db';
  human._resetSecret();
  const first = human.getSecret();
  human._resetSecret();
  // Stability is the whole point: getCourses and humanVerification are separate
  // lambdas, and a per-process secret would reject cookies at random.
  assert.strictEqual(first, human.getSecret());
  assert.ok(first && !first.includes('pw'), 'the connection string must not leak into the key');
});

// --- cache scoping -------------------------------------------------------

test('a gated public response is downgraded to private', () => {
  const scoped = human.scopeCacheToClient({
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
  assert.strictEqual(scoped.headers['Cache-Control'],
    'private, max-age=31536000, immutable');
});

test('an ungated deployment keeps the shared cache', () => {
  process.env.HUMAN_VERIFICATION_ENABLED = 'false';
  const headers = { 'Cache-Control': 'public, max-age=31536000, immutable' };
  assert.strictEqual(
    human.scopeCacheToClient({ headers }).headers['Cache-Control'],
    'public, max-age=31536000, immutable');
});

test('no-store is left alone', () => {
  const headers = { 'Cache-Control': 'no-store' };
  assert.strictEqual(human.scopeCacheToClient({ headers }).headers['Cache-Control'],
    'no-store');
});

test('withHumanGate does not run the handler for an unverified caller', async () => {
  let ran = false;
  const response = await human.withHumanGate({ headers: {} }, async () => {
    ran = true;
    return { statusCode: 200, headers: {}, body: '{}' };
  });
  assert.strictEqual(ran, false, 'an unverified request must not reach the database');
  assert.strictEqual(response.statusCode, 403);
});

// --- the endpoint --------------------------------------------------------

test('a completed slider mints a hardened cookie', async () => {
  const response = await handleRequest(postEvent(VALID_BODY));
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(JSON.parse(response.body).verified, true);

  const setCookie = response.headers['Set-Cookie'];
  assert.match(setCookie, /^tt_human_verified=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Max-Age=43200/);

  // And the value it hands out is one the data endpoints will actually accept.
  const value = setCookie.slice(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
  assert.strictEqual(human.requireHuman(cookieEvent(value)), null);
});

test('Secure is set over https and omitted over plain http', async () => {
  const secure = await handleRequest(
    postEvent(VALID_BODY, { 'x-forwarded-proto': 'https' }));
  assert.match(secure.headers['Set-Cookie'], /Secure/);

  // Omitted on localhost on purpose: a Secure cookie is dropped silently over
  // http, which would look like a slider that never finishes.
  const local = await handleRequest(
    postEvent(VALID_BODY, { 'x-forwarded-proto': 'http' }));
  assert.doesNotMatch(local.headers['Set-Cookie'], /Secure/);
});

test('a gesture outside the plausible timing band is refused', async () => {
  for (const durationMs of [0, 10, 249, 120001, 999999]) {
    const response = await handleRequest(postEvent({ ...VALID_BODY, durationMs }));
    assert.strictEqual(response.statusCode, 400, `accepted durationMs ${durationMs}`);
    assert.strictEqual(JSON.parse(response.body).reason, 'incomplete_slider');
  }
});

test('an incomplete slider is refused', async () => {
  const partial = await handleRequest(postEvent({ ...VALID_BODY, progress: 99 }));
  assert.strictEqual(partial.statusCode, 400);
  const unfinished = await handleRequest(postEvent({ ...VALID_BODY, completed: false }));
  assert.strictEqual(unfinished.statusCode, 400);
});

test('a cross-site caller is refused', async () => {
  const response = await handleRequest(
    postEvent(VALID_BODY, { origin: 'https://evil.example' }));
  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(JSON.parse(response.body).reason, 'invalid_origin');
});

test('a same-origin caller is accepted', async () => {
  const response = await handleRequest(
    postEvent(VALID_BODY, { origin: 'https://tunniplaan.netlify.app' }));
  assert.strictEqual(response.statusCode, 200);
});

test('a non-POST request is refused', async () => {
  const response = await handleRequest({ ...postEvent(VALID_BODY), httpMethod: 'GET' });
  assert.strictEqual(response.statusCode, 405);
  assert.strictEqual(response.headers.Allow, 'POST');
});

test('a malformed body is refused rather than throwing', async () => {
  for (const body of ['', 'not json', '[]', 'null', '"x"']) {
    const response = await handleRequest(postEvent(body));
    assert.strictEqual(response.statusCode, 400, `accepted body ${body}`);
  }
});

test('no pass is minted when the gate is switched off', async () => {
  process.env.HUMAN_VERIFICATION_ENABLED = 'false';
  const response = await handleRequest(postEvent(VALID_BODY));
  assert.strictEqual(response.statusCode, 503);
  assert.strictEqual(JSON.parse(response.body).reason, 'verification_disabled');
  assert.strictEqual(response.headers['Set-Cookie'], undefined);
});

// --- the wiring ----------------------------------------------------------
//
// Every test above calls handleRequest, which bypasses the gate by design.
// That left the thing that actually protects the dataset -- the withHumanGate
// wrapper on each endpoint's exported handler -- pinned by nothing at all: an
// ablation that deleted the wrapper from getCourses passed all 127 tests.
//
// These call handler, so deleting the wrapper fails here instead. The denial
// happens before the query, so no database is needed to assert it -- which is
// also the property worth pinning: an unverified caller costs us no Neon quota.
for (const endpoint of ['getDatasetManifest', 'getCourses', 'getTimetable']) {
  test(`${endpoint} refuses an unverified caller`, async () => {
    const { handler } = require(`../../netlify/functions/${endpoint}.js`);
    const response = await handler({
      httpMethod: 'GET', headers: {}, queryStringParameters: {},
    });
    assert.strictEqual(response.statusCode, 403,
      `${endpoint} answered a caller with no pass`);
    assert.strictEqual(JSON.parse(response.body).error, 'human_verification_required');
  });

  test(`${endpoint} serves a verified caller`, async () => {
    const { handler } = require(`../../netlify/functions/${endpoint}.js`);
    const response = await handler({
      httpMethod: 'GET',
      headers: { cookie: `${human.HUMAN_COOKIE}=${human.createCookieValue()}` },
      queryStringParameters: {},
    });
    // Not 200: without NEON_DATABASE_URL the query fails, and each endpoint
    // turns that into a 500. The point is only that the gate let it through.
    assert.notStrictEqual(response.statusCode, 403,
      `${endpoint} refused a valid pass`);
  });
}
