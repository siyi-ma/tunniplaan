// GET /.netlify/functions/getTimetable?courses=ID1,ID2
//
// Netlify adapter. The query lives in server/api/timetable.js so the ChatGPT
// Sites worker can call the same function. This file only opens the Neon
// client from the lambda environment and applies the human-verification gate.
//
// Sessions are the most expensive thing here to serve and the most valuable
// thing to scrape, so the gate matters most on this endpoint. It wraps the
// handler rather than handleRequest so the contract test, which replays the
// legacy filter against handleRequest directly, keeps testing the query and not
// the admission check.

const { handleRequest, _resetSemesterCache } = require('../../server/api/timetable.js');
const { getSql, jsonResponse } = require('./lib/dataset.js');
const { withHumanGate } = require('./lib/humanVerification.js');

exports.handler = async (event) => withHumanGate(event, async () => {
  let sql;
  try {
    sql = getSql();
  } catch (error) {
    console.error('getTimetable configuration error:', error);
    return jsonResponse(500, { error: 'Error processing timetable data.' });
  }
  return handleRequest(event, sql);
});
exports.handleRequest = handleRequest;
exports._resetSemesterCache = _resetSemesterCache;
