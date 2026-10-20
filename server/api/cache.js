// Shared cache rewrite for identity-gated dataset responses.
//
// Netlify's withHumanGate applies the same replacement, but it lives next to
// node:crypto and the cookie signer, which the Sites worker must not load.
// One function, two callers, so the rule cannot drift: a `public` policy
// becomes `private` and every other policy (no-store included) is left alone.
// The year-long max-age stays; only the shared-cache hop is given up.

function privatizePublicCache(response) {
  const headers = response && response.headers;
  const policy = headers && headers['Cache-Control'];
  if (typeof policy !== 'string' || !policy.startsWith('public')) return response;
  return {
    ...response,
    headers: { ...headers, 'Cache-Control': policy.replace(/^public/, 'private') },
  };
}

module.exports = { privatizePublicCache };
