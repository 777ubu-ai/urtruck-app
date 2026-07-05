// Мини-сервер для e2e: раздаёт статику из dist/ и проксирует /api/* и
// /security/* на локальный backend (BETA-режим). Нужен потому, что web-бандл
// ходит на относительный /api/v1 (тот же origin, в проде — через nginx).
//
// Запуск: node scripts/e2e-static-proxy.js  [PORT=4599] [BACKEND=http://127.0.0.1:8001]
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.E2E_PORT || '4599', 10);
const BACKEND = process.env.E2E_BACKEND || 'http://127.0.0.1:8001';
const DIST = path.resolve(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.map': 'application/json',
};

function proxy(req, res) {
  const target = new URL(req.url, BACKEND);
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const opts = {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    };
    const preq = http.request(opts, (pres) => {
      res.writeHead(pres.statusCode, pres.headers);
      pres.pipe(res);
    });
    preq.on('error', (e) => { res.writeHead(502); res.end('proxy_error: ' + e.message); });
    if (body.length) preq.write(body);
    preq.end();
  });
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA-fallback на index.html
      file = path.join(DIST, 'index.html');
    }
    fs.readFile(file, (e2, buf) => {
      if (e2) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/security/')) return proxy(req, res);
  return serveStatic(req, res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[e2e-static-proxy] http://127.0.0.1:${PORT}  → backend ${BACKEND}`);
});
