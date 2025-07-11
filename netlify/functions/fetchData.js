// We need to use a fetch library on the server side
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // Get the URL of the file we want to fetch from the request
  const targetUrl = event.queryStringParameters.url;

  if (!targetUrl) {
    return { statusCode: 400, body: 'Error: url parameter is required' };
  }

  try {
    const response = await fetch(targetUrl);
    const data = await response.text(); // Get the data as raw text

    // Return the data successfully with the correct CORS headers
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Allow any origin to access this
      },
      body: data,
    };
  } catch (error) {
    return { statusCode: 500, body: `Error fetching data: ${error.message}` };
  }
};