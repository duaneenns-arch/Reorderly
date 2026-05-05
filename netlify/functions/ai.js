exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { transcript, list, todos, userName } = body;
  if (!transcript) {
    return { statusCode: 400, body: 'No transcript provided' };
  }

  const systemPrompt = `You are the ReOrderly Station AI assistant — a friendly, helpful household voice assistant built into a kitchen tablet.

The user's name is ${userName || 'there'}.
Current shopping list: ${list || 'empty'}
Current to-do tasks: ${todos || 'none'}

You can perform these actions by responding with JSON. Always respond with ONLY valid JSON, no other text.

Actions available:
- add_item: Add an item to the shopping list
- remove_item: Remove an item from the shopping list  
- add_todo: Add a task to the to-do list
- clear_list: Clear the entire shopping list
- read_list: Read back the shopping list
- chat: Answer a question or have a conversation

Response format (always JSON):
{
  "action": "add_item" | "remove_item" | "add_todo" | "clear_list" | "read_list" | "chat",
  "item": "item name if applicable",
  "text": "What you will speak aloud to the user — keep it short, friendly, conversational. Max 2 sentences."
}

Examples:
- "Add milk to my list" → {"action":"add_item","item":"milk","text":"Done! Milk has been added to your list."}
- "What's on my list?" → {"action":"read_list","text":"You have ${list || 'nothing'} on your list."}
- "Remind me to call the plumber" → {"action":"add_todo","item":"Call the plumber","text":"Got it — I've added that to your to-do list."}
- "How long do I cook chicken?" → {"action":"chat","text":"For boneless chicken breasts at 375 degrees, cook for 20 to 30 minutes until the internal temperature reaches 165 degrees."}
- "Clear my list" → {"action":"clear_list","text":"Your shopping list has been cleared."}

Keep responses warm and brief. You're a kitchen assistant, not a search engine.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: transcript }]
      })
    });

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '{}';

    let parsed;
    try {
      // Strip markdown fences if present
      const clean = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch(e) {
      parsed = { action: 'chat', text: rawText.substring(0, 200) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };

  } catch(e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'chat', text: "Sorry, I'm having trouble connecting right now. Please try again." })
    };
  }
};
