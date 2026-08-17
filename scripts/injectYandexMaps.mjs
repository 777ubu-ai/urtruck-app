import { readFile, writeFile } from 'node:fs/promises';

const key = process.env.EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY?.trim();
if (!key) {
  console.log('Yandex Maps: YANDEX_MAPS_JS_API_KEY is not configured; no web map provider will be injected.');
  process.exit(0);
}

const path = 'dist/index.html';
const html = await readFile(path, 'utf8');
const marker = '<script>window.__URTRUCK_YANDEX_MAPS_CONFIGURED__=true;window.__URTRUCK_YANDEX_MAPS_VERSION__="2.1";</script>';
const script = `<script src="https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU" defer></script>`;

if (!html.includes('api-maps.yandex.ru/2.1/')) {
  await writeFile(path, html.replace('</head>', `  ${marker}\n  ${script}\n</head>`));
}

console.log('Yandex Maps: JavaScript API 2.1 injected with ru_RU localization.');
