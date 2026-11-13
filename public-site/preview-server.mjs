import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] || '/tmp/urtruck-public-site-preview');
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Сначала соберите preview через scripts/build-public-site.mjs');
const legacy = new Set(['/register', '/login', '/signup', '/profile', '/dashboard', '/my-work', '/my-trips', '/deals', '/chat']);
const service = ['/api/', '/security/', '/storage/'];
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (service.some((prefix) => url.pathname.startsWith(prefix))) {
    res.writeHead(501, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' });
    res.end(JSON.stringify({ preview: true, message: 'В preview API не проксируется; в production сохраните существующий upstream.' }));
    return;
  }
  if (legacy.has(url.pathname)) {
    res.writeHead(302, { location: '/', 'cache-control':'no-store' });
    res.end();
    return;
  }
  let filePath = url.pathname === '/' ? resolve(root, 'index.html') : resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (!filePath.startsWith(root + sep)) {
    res.writeHead(400); res.end('Bad path'); return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // Universal/app-link detail URLs must still resolve to this public page
    // in a browser. Installed apps use the unchanged association documents.
    filePath = resolve(root, 'index.html');
  }
  res.writeHead(200, {
    'content-type': mime[extname(filePath)] || (['terms', 'privacy', 'support'].includes(url.pathname.slice(1)) ? mime['.html'] : 'application/octet-stream'),
    'cache-control': filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('sw.js') ? 'no-cache' : 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(filePath).pipe(res);
});

const port = Number(process.env.PORT || 4178);
server.listen(port, '127.0.0.1', () => console.log(`Public site preview: http://127.0.0.1:${port} (root=${root})`));
