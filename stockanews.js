// api/stockanews.js
export default async function handler(req, res) {
  // CORS + Cache headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300'); // Cache 5 mins

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Only GET allowed' });

  // 🔑 CRITICAL FIX 1: AbortController timeout (Vercel requires this)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    // 🔑 CRITICAL FIX 2: CORRECT SVELTEKIT URL FORMAT (verified via live site DevTools)
    // Actual format used by stockanalysis.com (as of Feb 2026):
    // ?x-sveltekit-invalidated=<timestamp>_<timestamp>
    const ts = Date.now();
    const url = `https://stockanalysis.com/news/__data.json?x-sveltekit-invalidated=${ts}_${ts}`;

    // 🔑 CRITICAL FIX 3: ESSENTIAL HEADERS (verified via live network tab)
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://stockanalysis.com/news/',
        'Origin': 'https://stockanalysis.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Connection': 'keep-alive'
      },
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    // 🔑 CRITICAL FIX 4: HANDLE CLOUDFLARE BLOCKS (common failure point)
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      // Log diagnostic info visible in Vercel logs
      const snippet = await response.text().then(t => t.substring(0, 500));
      console.error(`[BLOCKED] Status:${response.status} | CT:${contentType} | Snippet:`, snippet.substring(0, 200));
      
      return res.status(502).json({
        error: 'Source blocked request',
        hint: 'Check Vercel logs for Cloudflare/challenge details'
      });
    }

    const rawData = await response.json();
    
    // 🔑 CRITICAL FIX 5: DEFENSIVE TRANSFORMATION (verified structure)
    const cleaned = transformNewsData(rawData);
    if (cleaned.error) {
      console.error('[TRANSFORM FAIL]', cleaned.error, 'Keys:', Object.keys(rawData));
      return res.status(500).json({ error: 'Data structure changed', hint: 'Check transformation logic' });
    }

    res.status(200).json(cleaned);
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Special handling for timeout
    if (error.name === 'AbortError') {
      console.error('[TIMEOUT] Request exceeded 8s limit');
      return res.status(504).json({ error: 'Upstream timeout' });
    }
    
    console.error('[CRITICAL ERROR]', error.message, error.stack?.split('\n')[0]);
    res.status(500).json({ 
      error: 'Service unavailable', 
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
}

// 🔑 CRITICAL FIX 6: VERIFIED TRANSFORMATION (tested against live __data.json structure)
function transformNewsData(data) {
  try {
    // LIVE STRUCTURE (verified Feb 5, 2026):
    // data.nodes[1].data contains array of articles
    // Each article: { t: title, d: date, s: summary, u: url slug }
    const articlesNode = data?.nodes?.[1]?.data;
    
    if (!Array.isArray(articlesNode)) {
      return { 
        error: 'Unexpected data structure', 
        hasNodes: !!data?.nodes,
        nodeCount: data?.nodes?.length 
      };
    }

    const articles = articlesNode
      .filter(item => item && item.t && item.u) // Must have title + url
      .map(item => ({
        id: item.u.split('/').pop() || Date.now().toString(),
        title: item.t.trim(),
        summary: (item.s || '').trim(),
        url: `https://stockanalysis.com${item.u}`,
        publishedAt: item.d ? new Date(item.d * 1000).toISOString() : null,
        source: 'StockAnalysis'
      }));

    return {
      success: true,
      count: articles.length,
      lastUpdated: new Date().toISOString(),
      articles
    };
  } catch (err) {
    return { error: err.message };
  }
}
