// api/stockanews.js
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60'); // Cache 5 mins

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Only GET requests permitted.' });
  }

  try {
    // Generate valid SvelteKit cache-busting timestamp (critical fix)
    const invalidatedParam = Date.now().toString();
    const url = `https://stockanalysis.com/news/__data.json?x-sveltekit-trailing-slash=1&x-sveltekit-invalidated=${invalidatedParam}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StockNewsAPI/1.0; +https://yourdomain.com)',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://stockanalysis.com/news/', // Required by target server
        'Origin': 'https://stockanalysis.com' // Required by some CDNs
      },
      redirect: 'follow',
      timeout: 10000 // 10s timeout (Node 18+ native support)
    });

    if (!response.ok) {
      // Log critical details server-side ONLY (never expose to client)
      const errorPreview = await response.text().then(text => text.substring(0, 300));
      console.error(
        `[STOCKANALYSIS FETCH FAILED] Status: ${response.status} | URL: ${url} | Preview: ${errorPreview}`
      );
      
      // Generic client error (avoid leaking internal details)
      return res.status(502).json({
        error: 'Upstream service unavailable',
        message: 'Failed to retrieve news data. Please try again later.'
      });
    }

    // Parse and transform SvelteKit's internal format to clean news array
    const rawData = await response.json();
    const cleanedData = transformSvelteKitData(rawData);

    // Return optimized response
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(cleanedData); // Next.js auto-stringifies cleanly

  } catch (error) {
    console.error('[STOCKANALYSIS API ERROR]', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      url: req.url
    });

    // Never expose raw errors to clients
    return res.status(500).json({
      error: 'Internal service error',
      message: 'News service temporarily unavailable'
    });
  }
}

// Critical: Transform SvelteKit's opaque __data.json format into usable news items
function transformSvelteKitData(data) {
  try {
    // SvelteKit __data.json structure: [nodes[0], nodes[1], ...]
    // News items typically live in node[1] (verify via browser DevTools)
    const newsNode = data?.nodes?.[1]?.data;
    
    if (!Array.isArray(newsNode)) {
      console.warn('Unexpected data structure - falling back to raw nodes');
      return { raw_nodes: data.nodes?.map(n => n?.type || 'unknown') };
    }

    // Map to clean, documented format (adjust fields based on actual structure)
    return {
      lastUpdated: new Date().toISOString(),
      articles: newsNode.map(item => ({
        id: item?.id || item?.url?.split('/').pop() || Math.random().toString(36).slice(2),
        title: item?.title || '',
        summary: item?.summary || item?.description || '',
        url: item?.url ? `https://stockanalysis.com${item.url}` : '',
        source: 'StockAnalysis',
        publishedAt: item?.date || item?.time || null,
        imageUrl: item?.image ? `https://stockanalysis.com${item.image}` : null
      })).filter(article => article.title && article.url)
    };
  } catch (transformErr) {
    console.error('Data transformation failed:', transformErr.message);
    return { error: 'Data parsing failed', raw_sample: JSON.stringify(data).substring(0, 200) };
  }
}
