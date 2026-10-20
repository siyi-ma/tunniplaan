// GET /.netlify/functions/getDatasetManifest
//
// Netlify adapter. The query lives in server/api/manifest.js so the ChatGPT
// Sites worker can call the same function. This file only opens the Neon
// client from the lambda environment and applies the human-verification gate.

const { handleRequest, PAGE_SIZE, NO_STORE_HEADERS } = require('../../server/api/manifest.js');
const { getSql, jsonResponse } = require('./lib/dataset.js');
const { withHumanGate } = require('./lib/humanVerification.js');

exports.handler = async (event) => withHumanGate(event, async () => {
  let sql;
  try {
    sql = getSql();
  } catch (error) {
    console.error('getDatasetManifest configuration error:', error);
    return jsonResponse(500, { error: 'manifest_unavailable' });
  }
  return handleRequest(event, sql);
});
exports.handleRequest = handleRequest;
exports.PAGE_SIZE = PAGE_SIZE;
exports.NO_STORE_HEADERS = NO_STORE_HEADERS;
