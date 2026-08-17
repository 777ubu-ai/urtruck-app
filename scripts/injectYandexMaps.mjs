import { readFile, writeFile } from 'node:fs/promises';

const key = process.env.EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY?.trim();
const routerKey = process.env.EXPO_PUBLIC_YANDEX_ROUTER_API_KEY?.trim();
if (!key) {
  console.log('Yandex Maps: YANDEX_MAPS_JS_API_KEY is not configured; web keeps the OpenStreetMap fallback.');
  process.exit(0);
}

const path = 'dist/index.html';
const html = await readFile(path, 'utf8');
const marker = '<script>window.__URTRUCK_YANDEX_MAPS_CONFIGURED__=true;</script>';
const routerMarker = routerKey
  ? `<script>window.__URTRUCK_YANDEX_ROUTER_API_KEY__=${JSON.stringify(routerKey)};window.__URTRUCK_YANDEX_ROUTER_CONFIGURED__=true;</script>`
  : '<script>window.__URTRUCK_YANDEX_ROUTER_CONFIGURED__=false;</script>';
const script = `<script src="https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(key)}&lang=ru_RU" defer></script>`;

if (!html.includes('api-maps.yandex.ru/v3/')) {
  await writeFile(path, html.replace('</head>', `  ${marker}\n  ${routerMarker}\n  ${script}\n</head>`));
}

console.log(`Yandex Maps: JS API v3 injected with ru_RU localization; Router API ${routerKey ? 'configured' : 'not configured'}.`);
