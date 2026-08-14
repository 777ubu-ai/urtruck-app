import { readFile, writeFile } from 'node:fs/promises';

const key = process.env.EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY?.trim();
if (!key) {
  console.log('Yandex Maps: ключ не передан, web-сборка сохранит фолбэк карты.');
  process.exit(0);
}

const path = 'dist/index.html';
const html = await readFile(path, 'utf8');
const script = `<script src="https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(key)}&lang=ru_RU" defer></script>`;
if (!html.includes('api-maps.yandex.ru/v3/')) {
  await writeFile(path, html.replace('</head>', `  ${script}\n</head>`));
}
console.log('Yandex Maps: JS API подключён к web-сборке.');
