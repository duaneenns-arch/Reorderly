exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured — please add ANTHROPIC_API_KEY in Netlify environment variables' }) };
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
      let urlContent = '';
      let fetchSuccess = false;

      // Try multiple user agents — some sites block the default one
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Googlebot/2.1 (+http://www.google.com/bot.html)',
      ];

      for (const ua of userAgents) {
        try {
          const fetchRes = await fetch(data, {
            headers: {
              'User-Agent': ua,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Cache-Control': 'no-cache',
            },
            signal: AbortSignal.timeout(12000)
          });

          if (fetchRes.ok) {
            const html = await fetchRes.text();

            // Look for JSON-LD recipe schema first (most reliable, works on AllRecipes, Food Network, etc.)
            const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
            if (jsonLdMatch) {
              for (const block of jsonLdMatch) {
                const jsonStr = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
                try {
                  const parsed = JSON.parse(jsonStr);
                  const recipe = findRecipeSchema(parsed);
                  if (recipe) {
                    urlContent = JSON.stringify(recipe);
                    fetchSuccess = true;
                    break;
                  }
                } catch(e) {}
              }
            }

            // Fall back to stripped HTML text if no schema found
            if (!urlContent) {
              urlContent = html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .substring(0, 8000);
              fetchSuccess = urlContent.length > 200;
            }

            if (fetchSuccess) break;
          }
        } catch(e) {
          // Try next user agent
        }
      }

      if (!fetchSuccess || !urlContent) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'url_blocked'
          })
        };
      }

      messages = [{ role: 'user', content: 'Extract the recipe from this content:\n\n' + urlContent }];

    } else if (type === 'text') {
      messages = [{ role: 'user', content: 'Extract the recipe from this text:\n\n' + data }];

    } else if (type === 'photo') {
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

    if (!response.ok) {
      if (response.status === 401) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Invalid Anthropic API key — check ANTHROPIC_API_KEY in Netlify environment variables' }) };
      }
      throw new Error(result.error?.message || 'AI service error');
    }

    if (!result.content || !result.content[0]) {
      throw new Error('No response from AI');
    }

    const text = result.content[0].text.trim();
    // Strip markdown code fences if present
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
      body: JSON.stringify({ error: e.message || 'Could not process recipe.' })
    };
  }
};

// Recursively find a Recipe schema in JSON-LD (handles @graph arrays etc.)
function findRecipeSchema(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findRecipeSchema(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === 'object') {
    const type = obj['@type'];
    if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
      return obj;
    }
    if (obj['@graph']) return findRecipeSchema(obj['@graph']);
  }
  return null;
}
