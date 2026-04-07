exports.handler = async function(event) {
  const upc = event.queryStringParameters && event.queryStringParameters.upc;
  const name = event.queryStringParameters && event.queryStringParameters.name;

  if (!upc && !name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'UPC or name required' })
    };
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;

  try {
    // Step 1: First try UPCitemdb to get the product name
    let productName = name;
    let productImage = null;

    if (upc && !productName) {
      try {
        const upcRes = await fetch(
          `https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`
        );
        const upcData = await upcRes.json();
        if (upcData.items && upcData.items.length > 0) {
          const p = upcData.items[0];
          productName = p.title || p.brand;
          productImage = p.images && p.images[0] ? p.images[0] : null;
        }
      } catch(e) {}
    }

    // Step 2: Search Walmart via RapidAPI using product name
    if (productName) {
      const searchRes = await fetch(
        `https://walmart-data.p.rapidapi.com/search?q=${encodeURIComponent(productName)}&page=1`,
        {
          headers: {
            'x-rapidapi-host': 'walmart-data.p.rapidapi.com',
            'x-rapidapi-key': rapidApiKey,
            'Content-Type': 'application/json'
          }
        }
      );
      const searchData = await searchRes.json();

      // Get first result from search
      const results = searchData.searchResult && searchData.searchResult[0];
      if (results && results.length > 0) {
        const item = results[0];
        const itemId = item.id || item.usItemId;
        const walmartUrl = itemId
          ? `https://www.walmart.com/ip/${itemId}`
          : `https://www.walmart.com/search?q=${encodeURIComponent(productName)}`;

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            found: true,
            name: item.name || productName,
            image: item.image || productImage,
            price: item.price ? item.price.toString() : null,
            walmartUrl: walmartUrl,
            source: 'walmart'
          })
        };
      }
    }

    // Fallback: return name/image from UPCitemdb with Walmart search link
    if (productName) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          found: true,
          name: productName,
          image: productImage,
          price: null,
          walmartUrl: `https://www.walmart.com/search?q=${encodeURIComponent(productName)}`,
          source: 'search'
        })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ found: false })
    };

  } catch(e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
