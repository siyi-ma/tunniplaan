// For modern Node environments, it's better to use ESM imports.
// Make sure node-fetch is in your package.json: npm install node-fetch
import fetch from 'node-fetch';

// --- SECURITY: A whitelist of allowed domains ---
// This prevents your function from being used as an open proxy.
const ALLOWED_DOMAIN = 'raw.githubusercontent.com';

export const handler = async (event) => {
  // Get the URL to fetch from the query string parameters.
  const { url } = event.queryStringParameters;

  if (!url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'URL parameter is required.' }),
    };
  }

  let targetUrl;
  try {
    // Decode the URL and parse it to validate its structure.
    targetUrl = new URL(decodeURIComponent(url));
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid URL format.' }),
    };
  }

  // --- SECURITY CHECK ---
  // Ensure the requested URL's hostname is on our whitelist.
  if (targetUrl.hostname !== ALLOWED_DOMAIN) {
    return {
      statusCode: 403, // Forbidden
      body: JSON.stringify({ error: 'Forbidden: Requests to this domain are not allowed.' }),
    };
  }

  try {
    const response = await fetch(targetUrl.href);

    // If the external fetch failed, pass that error back.
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Failed to fetch from external URL: ${response.statusText}` }),
      };
    }

    // --- CORRECT DATA HANDLING ---
    // Parse the response as JSON here in the function.
    const data = await response.json();

    // Success! Return the data with the correct headers.
    return {
      statusCode: 200,
      headers: {
        // Allow your website to access this function. Use '*' for development.
        // For production, it's safer to use your actual domain: 'https://your-site.com'
        'Access-Control-Allow-Origin': '*', 
        // Tell the browser that you are sending back JSON data.
        'Content-Type': 'application/json',
      },
      // Stringify the JSON data for the HTTP response body.
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('Error in Netlify function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `An internal server error occurred: ${error.message}` }),
    };
  }
};
