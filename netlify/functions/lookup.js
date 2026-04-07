exports.handler = async function(event) {
  const upc = event.queryStringParameters && event.queryStringParameters.upc;

  if (!upc) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'UPC required' })
    };
  }

  const apiKey = process.env.BLUECART_API_KEY;

  try {
    // First try exact product lookup by GTIN/UPC
    const productRes = await fetch(
      `https://api.bluecartapi.com/request?api_key=${apiKey}&type=product&gtin=${upc}`
    );
    const productData = await productRes.json();

    if (productData.product) {
      const p = productData.product;
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          found: true,
          name: p.title,
          image: p.main_image,
          price: p.buybox_winner?.price ? p.buybox_winner.price.toFixed(2) : null,
          walmartUrl: p.link || null,
          source: 'walmart_exact'
        })
      };
    }

    // Fallback: search Walmart by UPC as search term
    const searchRes = await fetch(
      `https://api.bluecartapi.com/request?api_key=${apiKey}&type=search&search_term=${upc}&walmart_domain=walmart.com`
    );
    const searchData = await searchRes.json();

    if (searchData.search_results && searchData.search_results.length > 0) {
      const p = searchData.search_results[0];
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          found: true,
          name: p.product?.title,
          image: p.product?.main_image,
          price: p.offers?.primary?.price ? p.offers.primary.price.toFixed(2) : null,
          walmartUrl: p.product?.link || null,
          source: 'walmart_search'
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
