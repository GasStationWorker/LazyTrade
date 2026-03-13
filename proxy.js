// Simple CORS proxy for the PoE Trade API + Stash API
// Usage: node proxy.js
// Proxies http://localhost:3456/* → https://www.pathofexile.com/*

const http = require('http');
const https = require('https');

const PORT = 3456;

const server = http.createServer((req, res) => {
  // CORS headers — allow Cookie + X-POESESSID for stash requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent, X-POESESSID');
  res.setHeader('Access-Control-Expose-Headers', 'Retry-After, X-Rate-Limit-Policy, X-Rate-Limit-Rules, X-Rate-Limit-Ip, X-Rate-Limit-Ip-State, X-Rate-Limit-Account, X-Rate-Limit-Account-State');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

  const headers = {
    'Content-Type': req.headers['content-type'] || 'application/json',
    'User-Agent': 'PoETradeWebApp/1.0 (contact: poe-trade-app)',
    'Accept': 'application/json',
  };

  // Forward POESESSID as Cookie for stash API requests
  // The browser sends it via X-POESESSID header (can't set Cookie cross-origin),
  // and the proxy converts it to a Cookie header for pathofexile.com.
  if (req.headers['x-poesessid']) {
    headers['Cookie'] = 'POESESSID=' + req.headers['x-poesessid'];
  }

  const options = {
    hostname: 'www.pathofexile.com',
    path: parsedUrl.pathname + parsedUrl.search,
    method: req.method,
    headers,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    // Forward rate limit headers
    const fwdHeaders = ['x-rate-limit-policy', 'x-rate-limit-rules', 'retry-after', 'content-type'];
    for (const h of fwdHeaders) {
      if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]);
    }
    // Forward any x-rate-limit-* headers
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (k.startsWith('x-rate-limit')) res.setHeader(k, v);
    }

    res.writeHead(proxyRes.statusCode);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error('Proxy error:', e.message);
    res.writeHead(502);
    res.end(JSON.stringify({ error: 'Proxy error: ' + e.message }));
  });

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      proxyReq.write(body);
      proxyReq.end();
    });
  } else {
    proxyReq.end();
  }
});

server.listen(PORT, () => {
  console.log(`PoE Trade CORS proxy running on http://localhost:${PORT}`);
  console.log(`Proxying to https://www.pathofexile.com`);
});
