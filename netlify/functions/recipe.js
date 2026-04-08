exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) }; }

  const { type, data } = body;

  try {
    let messages = [];
    const systemPrompt = `You are a recipe parser. Extract recipe information and return ONLY valid JSON with this exact structure:
{
  "name": "Recipe name",
  "category": "dinner/lunch/breakfast/dessert/snack/etc",
  "servings": "4 servings",
  "prepTime": "30 mins",
  "ingredients": [
    { "name": "ingredient name", "quantity": "2 cups" }
  ],
  "emoji": "🍽️"
}
Rules:
- ingredient name should be the simple product name (e.g. "chicken breast" not "boneless skinless chicken breast, trimmed")
- quantity should include amount and unit
- Return ONLY the JSON object, no other text
- If you cannot find a recipe, return { "error": "Could not find recipe in this content" }`;

    if (type === 'url') {
      // Fetch the URL content first
      let urlContent = '';
      try {
        const fetchRes = await fetch(data, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000)
        });
        urlContent = await fetchRes.text();
        // Strip HTML tags for cleaner content
        urlContent = urlContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                               .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                               .replace(/<[^>]+>/g, ' ')
                               .replace(/\s+/g, ' ')
                               .substring(0, 8000);
      } catch(e) {
        urlContent = 'URL: ' + data;
      }
      messages = [{ role: 'user', content: 'Extract the recipe from this content:\n\n' + urlContent }];
    } else if (type === 'text') {
      messages = [{ role: 'user', content: 'Extract the recipe from this text:\n\n' + data }];
    } else if (type === 'photo') {
      // Photo - base64 image
      const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
      const mediaType = data.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: 'Extract the recipe from this image of a recipe card or cookbook page.' }
        ]
      }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages
      })
    });

    const result = await response.json();
    if (!result.content || !result.content[0]) {
      throw new Error('No response from AI');
    }

    const text = result.content[0].text.trim();
    const parsed = JSON.parse(text);

    if (parsed.error) {
      return { statusCode: 200, body: JSON.stringify({ error: parsed.error }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };

  } catch(e) {
    console.error('Recipe error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not process recipe. Please try pasting the text directly.' })
    };
  }
};
