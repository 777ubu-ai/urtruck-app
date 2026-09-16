import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

// Вызывается только после успешного Expo export. Все перечисленные файлы —
// часть публичного web-контракта, а не необязательные best-effort ресурсы.
const dist = resolve('dist');
const assets = [
  ['share/og-default.png', ['share/og-default.png']],
  ['share/og-trip-template.svg', ['share/og-trip-template.svg']],
  ...['terms', 'privacy', 'support'].map((name) => [`legal/${name}.html`, [`legal/${name}.html`, name, `${name}.html`]]),
  ['apple-app-site-association', ['apple-app-site-association']],
  ['.well-known/apple-app-site-association', ['.well-known/apple-app-site-association']],
  ['.well-known/assetlinks.json', ['.well-known/assetlinks.json']],
];

function requireFile(path) {
  let stat;
  try { stat = statSync(path); } catch { throw new Error(`Обязательный файл отсутствует: ${relative(process.cwd(), path)}`); }
  if (!stat.isFile() || !stat.size) throw new Error(`Обязательный файл пуст или не является файлом: ${relative(process.cwd(), path)}`);
}

try {
  const index = resolve(dist, 'index.html');
  requireFile(index);
  const html = readFileSync(index, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((match) => match[1]);
  const localScripts = scripts.filter((src) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src));
  if (!localScripts.length) throw new Error('index.html не содержит локального JS bundle');
  for (const src of localScripts) {
    const path = decodeURIComponent(src.split(/[?#]/, 1)[0]);
    const bundle = resolve(dist, path.startsWith('/') ? `.${path}` : path);
    const within = relative(dist, bundle);
    if (within === '..' || within.startsWith('../') || within.startsWith('..\\') || isAbsolute(within)) {
      throw new Error('JS bundle выходит за пределы dist');
    }
    requireFile(bundle);
  }
  // Проверяем весь набор до копирования, чтобы missing asset не маскировался
  // прежней копией того же файла в dist.
  for (const [source] of assets) requireFile(resolve('web', source));
  for (const [source, targets] of assets) {
    for (const target of targets) {
      const destination = resolve(dist, target);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(resolve('web', source), destination);
      requireFile(destination);
    }
  }
  console.log(`[build:web] PASS: ${localScripts.length} JS bundle(s), ${assets.length} обязательных статических источников`);
} catch (error) {
  console.error(`[build:web] FAIL: ${error.message}`);
  process.exitCode = 1;
}
