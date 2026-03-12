// Simple CORS proxy for the PoE Trade API
// Usage: node proxy.js
// Proxies http://localhost:3456/api/trade/* → https://www.pathofexile.com/api/trade/*

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3456;
const TARGET = 'https://www.pathofexile.com';

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url);
  const targetUrl = TARGET + parsed.path;

  const options = {
    hostname: 'www.pathofexile.com',
    path: parsed.path,
    method: req.method,
    headers: {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'User-Agent': 'PoETradeWebApp/1.0 (contact: poe-trade-app)',
      'Accept': 'application/json',
    },
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
  console.log(`Proxying to ${TARGET}/api/trade/*`);
});
