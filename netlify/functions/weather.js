exports.handler = async function(event, context) {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=41.2373&longitude=-80.8184&current_weather=true&temperature_unit=fahrenheit'
    );
    const data = await res.json();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(data)
    };
  } catch(e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
