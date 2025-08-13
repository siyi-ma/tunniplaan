const fs = require('fs').promises;
const path = require('path');

exports.handler = async (event) => {
  // 1. Get the list of course IDs from the request URL (e.g., ?courses=ID1,ID2,ID3)
  const requestedCoursesQuery = event.queryStringParameters.courses;
  if (!requestedCoursesQuery) {
    // Return an empty list if no courses are requested, this is not an error.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    };
  }
  const requestedCourses = new Set(requestedCoursesQuery.split(','));

  try {
    // 2. Find and read the massive JSON file on the server.
    // This path looks for the file in the root of your published site.
    const dataPath = path.resolve(process.cwd(), 'sessions.json');
    console.log('Resolved timetable path:', dataPath);
    try {
      await fs.access(dataPath);
      console.log('Timetable file exists!');
    } catch (err) {
      console.error('Timetable file does NOT exist:', err);
    }
    const timetableData = await fs.readFile(dataPath, 'utf-8');
    const allEvents = JSON.parse(timetableData);

    // 3. Filter the data to find only matching events. This is the magic part.
    const filteredEvents = allEvents.filter(event => 
      requestedCourses.has(event.course_id)
    );

    // 4. Send back only the small, filtered list.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filteredEvents),
    };
  } catch (error) {
    console.error('Error reading or filtering timetable data:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Error processing timetable data.' }) };
  }
};