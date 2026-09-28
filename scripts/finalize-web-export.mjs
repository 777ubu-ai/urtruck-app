import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

// A new URL is intentional: Telegram/WhatsApp/WeChat cache previews by image
// URL for a long time. Reusing og-default.png would keep the old illustrated
// truck/onboarding card visible even after deployment.
const socialPreview = {
  source: resolve('assets/hero.jpg'),
  // Source is a PNG payload despite its legacy .jpg filename. Publish it
  // with the truthful extension/content type so strict social crawlers do
  // not reject the image after sniffing the bytes.
  target: resolve(dist, 'share/urtruck-market-v2.png'),
};

const SOCIAL_META = `
  <meta name="description" content="UrTruck — грузы и рейсы для международных перевозок" />
  <meta property="og:site_name" content="UrTruck" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="UrTruck — грузы и рейсы" />
  <meta property="og:description" content="Международные грузоперевозки без посредников" />
  <meta property="og:image" content="https://urtruck.kz/share/urtruck-market-v2.png" />
  <meta property="og:image:secure_url" content="https://urtruck.kz/share/urtruck-market-v2.png" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1672" />
  <meta property="og:image:height" content="941" />
  <meta property="og:image:alt" content="UrTruck — международные грузоперевозки" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="UrTruck — грузы и рейсы" />
  <meta name="twitter:description" content="Международные грузоперевозки без посредников" />
  <meta name="twitter:image" content="https://urtruck.kz/share/urtruck-market-v2.png" />`;

function requireFile(path) {
  let stat;
  try { stat = statSync(path); } catch { throw new Error(`Обязательный файл отсутствует: ${relative(process.cwd(), path)}`); }
  if (!stat.isFile() || !stat.size) throw new Error(`Обязательный файл пуст или не является файлом: ${relative(process.cwd(), path)}`);
}

try {
  const index = resolve(dist, 'index.html');
  requireFile(index);
  let html = readFileSync(index, 'utf8');
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
  requireFile(socialPreview.source);
  mkdirSync(dirname(socialPreview.target), { recursive: true });
  copyFileSync(socialPreview.source, socialPreview.target);
  requireFile(socialPreview.target);

  // Expo's generated page has only <title>UrTruck</title>. Social crawlers do
  // not execute the React bundle, so metadata set at runtime is invisible to
  // WeChat/WhatsApp/Telegram. Inject it into the actual server HTML.
  if (!html.includes('property="og:title"')) {
    html = html.replace('</head>', `${SOCIAL_META}\n</head>`);
    writeFileSync(index, html);
  }

  // Runtime smoke tests and operators must be able to prove exactly which
  // source revision produced the static artifact. Keep this file intentionally
  // public and limited to non-secret build identity fields.
  const packagePath = resolve('package.json');
  // The fail-fast unit fixture intentionally contains only exported assets.
  // A real application export always has package.json and must publish a
  // verifiable source identity; the asset-only fixture remains supported.
  if (existsSync(packagePath)) {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    const commit = (process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim();
    if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error('Некорректный commit SHA для build-info.json');
    writeFileSync(resolve(dist, 'build-info.json'), `${JSON.stringify({
      commit,
      short: commit.slice(0, 7),
      version: packageJson.version,
    }, null, 2)}\n`);
  }

  console.log(`[build:web] PASS: ${localScripts.length} JS bundle(s), ${assets.length} обязательных статических источников`);
} catch (error) {
  console.error(`[build:web] FAIL: ${error.message}`);
  process.exitCode = 1;
}
