import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = process.cwd();
const output = resolve(process.argv[2] || '/tmp/urtruck-public-site-release');
if (output === repo || output === resolve(repo, 'public-site') || output.startsWith(`${repo}/`)) {
  throw new Error('Артефакт должен собираться вне рабочего дерева исходников.');
}
if (existsSync(output)) throw new Error(`Папка артефакта уже существует; выберите новый путь, чтобы ничего не перезаписывать: ${output}`);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('Не удалось определить полный SHA исходника.');

mkdirSync(output, { recursive: true });
const publicRoot = resolve(repo, 'public-site');
for (const [source, target] of [
  ['index.html', 'index.html'], ['styles.css', 'site/styles.css'], ['site.js', 'site/site.js'], ['sw.js', 'sw.js'],
]) {
  const from = resolve(publicRoot, source);
  const to = resolve(output, target);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}
mkdirSync(resolve(output, 'site/assets'), { recursive: true });

const copies = [
  ['docs/appstore/screenshots/iphone-6.7/01-cargo-feed.png', 'site/assets/cargo-feed.png'],
  ['docs/appstore/screenshots/iphone-6.7/02-my-trips-dark.png', 'site/assets/trips-screen.png'],
  ['docs/appstore/screenshots/iphone-6.7/03-deals-feed.png', 'site/assets/deal-screen.png'],
  ['web/store/google-play-qr.png', 'site/assets/google-play-qr.png'],
  ['web/store/app-store-qr.png', 'site/assets/app-store-qr.png'],
  ['web/legal/terms.html', 'terms'], ['web/legal/terms.html', 'terms.html'], ['web/legal/terms.html', 'legal/terms.html'],
  ['web/legal/privacy.html', 'privacy'], ['web/legal/privacy.html', 'privacy.html'], ['web/legal/privacy.html', 'legal/privacy.html'],
  ['web/legal/support.html', 'support'], ['web/legal/support.html', 'support.html'], ['web/legal/support.html', 'legal/support.html'],
  ['web/.well-known/assetlinks.json', '.well-known/assetlinks.json'],
  ['web/.well-known/apple-app-site-association', '.well-known/apple-app-site-association'],
  ['web/apple-app-site-association', 'apple-app-site-association'],
];
for (const [source, target] of copies) {
  const from = resolve(repo, source);
  const to = resolve(output, target);
  if (!statSync(from).isFile() || !statSync(from).size) throw new Error(`Пустой обязательный файл: ${source}`);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

const publicPaths = ['index.html', 'site/styles.css', 'site/site.js', 'sw.js'];
const files = publicPaths.map((path) => ({ path, sha256: createHash('sha256').update(readFileSync(join(output, path))).digest('hex') }));
const assetsDir = resolve(output, 'site/assets');
for (const name of ['cargo-feed.png', 'trips-screen.png', 'deal-screen.png', 'google-play-qr.png', 'app-store-qr.png']) {
  const path = join('site/assets', name);
  files.push({ path, sha256: createHash('sha256').update(readFileSync(join(assetsDir, name))).digest('hex') });
}
writeFileSync(join(output, 'build-info.json'), `${JSON.stringify({ commit: sha, short: sha.slice(0, 7), built_at: new Date().toISOString(), files }, null, 2)}\n`);
console.log(`PASS: public static site ${sha} → ${output} (${files.length} manifest entries)`);
