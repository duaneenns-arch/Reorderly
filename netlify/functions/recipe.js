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

  try {
    let requestBody;

    if (type === 'url') {
      // Use Claude's web search tool to fetch the recipe URL directly
      requestBody = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search'
          }
        ],
        messages: [{
          role: 'user',
          content: `Please fetch this recipe URL and extract the recipe: ${data}`
        }]
      };
    } else if (type === 'text') {
      requestBody = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: 'Extract the recipe from this text:\n\n' + data
        }]
      };
    } else if (type === 'photo') {
      const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
      const mediaType = data.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
      requestBody = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: 'Extract the recipe from this image of a recipe card or cookbook page.' }
          ]
        }]
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify(requestBody)
    });

    const result = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Invalid Anthropic API key' }) };
      }
      throw new Error(result.error?.message || 'AI service error');
    }

    // Extract the final text response — Claude may have used web search tool first
    const textBlock = result.content && result.content.find(b => b.type === 'text');
    if (!textBlock) {
      throw new Error('No response from AI');
    }

    const text = textBlock.text.trim();
    const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(clean);

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
      body: JSON.stringify({ error: e.message || 'Could not process recipe. Please try pasting the text directly.' })
    };
  }
};
