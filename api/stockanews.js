// api/stockanews.js
export default async function handler(req, res) {
  // CORS headers (optional but useful)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const url = 'https://stockanalysis.com/news/__data.json?x-sveltekit-trailing-slash=1&x-sveltekit-invalidated=01';

    // stockanalysis blocks requests without proper headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        // Note: Do NOT send Origin or Referer unless needed — may cause issues
      },
      // Optional: Disable automatic redirect handling
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error(`stockanalysis API error: ${response.status} ${response.statusText}`);
      return res.status(502).json({
        error: 'Failed to fetch from stockanalysis API',
        status: response.status,
        url
      });
    }

    const data = await response.json();

    // Return pretty-printed JSON
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
