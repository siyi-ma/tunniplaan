// GET /.netlify/functions/getCourses?version=<sha256>&page=<zero-based>
//
// Netlify adapter. The query lives in server/api/courses.js so the ChatGPT
// Sites worker can call the same function. This file only opens the Neon
// client from the lambda environment and applies the human-verification gate.
//
// withHumanGate also rewrites immutable `public` caching to `private`. A gated
// page must not be shared-cacheable: Netlify's CDN keys on the URL and not on
// the cookie, so one verified visitor would otherwise warm a cache that
// answers everyone. The year-long browser cache is unaffected.

const { handleRequest, toCourse } = require('../../server/api/courses.js');
const { getSql, jsonResponse } = require('./lib/dataset.js');
const { withHumanGate } = require('./lib/humanVerification.js');

exports.handler = async (event) => withHumanGate(event, async () => {
  let sql;
  try {
    sql = getSql();
  } catch (error) {
    console.error('getCourses configuration error:', error);
    return jsonResponse(500, { error: 'courses_unavailable' });
  }
  return handleRequest(event, sql);
});
exports.handleRequest = handleRequest;
exports.toCourse = toCourse;
