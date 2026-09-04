// POST /.netlify/functions/humanVerification
//
// Mints the signed pass that getDatasetManifest, getCourses and getTimetable
// require. The browser sends one of these after the visitor drags the slider on
// the opening page; everything about the request that is checked here is
// checked because a script would get it wrong or would not bother.
//
// Nothing in the body is trusted as evidence on its own -- a script can post
// {completed:true} as easily as a person can drag. What the body buys is a
// cost: the timing bounds mean a bot has to model a human-speed gesture, and
// the Origin check means it has to be talking to this site rather than replaying
// the call from somewhere else. The real work is done by the signature the
// response carries away.
//
// Contract: 200 {"verified":true} plus Set-Cookie, or a 4xx envelope naming
// the reason. Never cached.

const {
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  DENIED_HEADERS,
  isEnabled,
  getSecret,
  createCookieValue,
  readHeader,
  serializeSetCookie,
} = require('./lib/humanVerification.js');

function jsonResponse(statusCode, payload, extraHeaders) {
  return {
    statusCode,
    headers: { ...DENIED_HEADERS, ...(extraHeaders || {}) },
    body: JSON.stringify(payload),
  };
}

// An absent Origin is not a failure: it is what a non-browser client sends, and
// what some browsers send for a same-origin request. A *present* Origin naming
// a different host is a cross-site caller, and that is refused.
function isSameOrigin(event) {
  const origin = readHeader(event, 'origin');
  if (!origin) return true;
  const host = readHeader(event, 'host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch (error) {
    return false;
  }
}

function readNumber(body, key) {
  const value = body[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function handleRequest(event) {
  // Disabled means the endpoint is not merely permissive, it is gone. Handing
  // out a cookie nothing checks would be a worse answer than saying so.
  if (!isEnabled()) {
    return jsonResponse(503, { verified: false, reason: 'verification_disabled' });
  }
  if (!getSecret()) {
    console.error('humanVerification: no signing secret available; cannot mint a pass');
    return jsonResponse(503, { verified: false, reason: 'verification_unavailable' });
  }

  // Netlify supplies httpMethod; a hand-built event may omit it, and defaulting
  // to POST there keeps the tests honest without opening a GET path in production.
  const method = (event && event.httpMethod) || 'POST';
  if (method !== 'POST') {
    return jsonResponse(405, { verified: false, reason: 'method_not_allowed' },
      { Allow: 'POST' });
  }
  if (!isSameOrigin(event)) {
    return jsonResponse(403, { verified: false, reason: 'invalid_origin' });
  }

  let body;
  try {
    body = JSON.parse((event && event.body) || '');
  } catch (error) {
    return jsonResponse(400, { verified: false, reason: 'invalid_request' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { verified: false, reason: 'invalid_request' });
  }

  const completed = body.completed === true;
  const progress = readNumber(body, 'progress');
  const durationMs = readNumber(body, 'durationMs');

  if (!completed || progress < 100
      || durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) {
    return jsonResponse(400, { verified: false, reason: 'incomplete_slider' });
  }

  return jsonResponse(200, { verified: true }, {
    'Set-Cookie': serializeSetCookie(createCookieValue(), event),
  });
}

exports.handler = async (event) => {
  try {
    return await handleRequest(event);
  } catch (error) {
    console.error('humanVerification failed:', error);
    return jsonResponse(500, { verified: false, reason: 'verification_unavailable' });
  }
};
exports.handleRequest = handleRequest;
