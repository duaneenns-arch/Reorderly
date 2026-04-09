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
  "servings": "4",
  "prepTime": "30 mins",
  "image": "",
  "ingredients": [
    { "name": "ingredient name", "quantity": "2 cups" }
  ],
  "instructions": [
    "Step 1 instruction text",
    "Step 2 instruction text"
  ],
  "emoji": "🍽️"
}
Rules:
- servings should be just the number e.g. "4"
- ingredient name should be simple e.g. "chicken breast" not "boneless skinless chicken breast, trimmed"
- quantity should include amount and unit
- instructions should be an array of strings, one per step
- image should be the full URL of the main recipe photo if available, otherwise empty string ""
- Return ONLY the JSON object, no other text
- If you cannot find a recipe, return { "error": "Could not find recipe in this content" }`;

  try {
    let requestBody;

    if (type === 'url') {
      requestBody = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Please fetch this recipe URL and extract the full recipe including all ingredients, step by step instructions, and photo URL if available: ${data}`
        }]
      };
    } else if (type === 'text') {
      requestBody = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: 'Extract the full recipe including ingredients and instructions from this text:\n\n' + data
        }]
      };
    } else if (type === 'photo') {
      const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
      const mediaType = data.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
      requestBody = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: 'Extract the full recipe including ingredients and instructions from this image.' }
          ]
        }]
      };
    }

    console.log('Calling Anthropic API, type:', type);

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
    console.log('API response status:', response.status);
    console.log('API stop reason:', result.stop_reason);
    console.log('Content blocks:', result.content ? result.content.map(b => b.type).join(', ') : 'none');

    if (!response.ok) {
      console.log('API error:', JSON.stringify(result.error));
      if (response.status === 401) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Invalid Anthropic API key' }) };
      }
      throw new Error(result.error?.message || 'AI service error');
    }

    // Find the last text block — Claude may have used web_search first
    let finalText = '';
    if (result.content && Array.isArray(result.content)) {
      for (const block of result.content) {
        if (block.type === 'text') {
          finalText = block.text;
        }
      }
    }

    console.log('Final text length:', finalText.length);
    console.log('Final text preview:', finalText.substring(0, 200));

    if (!finalText) {
      throw new Error('No text response from AI');
    }

    // Extract JSON from the response
    const start = finalText.indexOf('{');
    const end = finalText.lastIndexOf('}');
    if (start === -1 || end === -1) {
      console.log('No JSON found in:', finalText);
      throw new Error('No JSON found in response');
    }

    const jsonStr = finalText.substring(start, end + 1);
    const parsed = JSON.parse(jsonStr);

    if (parsed.error) {
      return { statusCode: 200, body: JSON.stringify({ error: parsed.error }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };

  } catch(e) {
    console.error('Recipe error:', e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message || 'Could not process recipe.' })
    };
  }
};
