import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts['build:web'];
const assets = ['share/og-default.png', 'share/og-trip-template.svg', 'legal/terms.html', 'legal/privacy.html', 'legal/support.html', 'apple-app-site-association', '.well-known/apple-app-site-association', '.well-known/assetlinks.json'];

function fixture(t, { exportExit = 0, missing = null, bundle = true, index = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'urtruck-build-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, contents) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), contents); };
  for (const asset of assets) if (asset !== missing) put(`web/${asset}`, `fixture:${asset}`);
  put('assets/hero.jpg', 'fixture:current-market-hero');
  // Экспортёр подменён только внутри temp fixture: production Expo не запускается.
  put('bin/npx', `#!/bin/sh\nexit ${exportExit}\n`);
  chmodSync(join(root, 'bin/npx'), 0o755);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  if (existsSync('scripts/finalize-web-export.mjs')) copyFileSync('scripts/finalize-web-export.mjs', join(root, 'scripts/finalize-web-export.mjs'));
  if (index) put('dist/index.html', '<html><head><title>UrTruck</title></head><body><script src="/_expo/static/js/web/index.js" defer></script></body></html>');
  if (bundle) put('dist/_expo/static/js/web/index.js', 'globalThis.fixture = true;');
  return { root, put, run: () => spawnSync('/bin/sh', ['-c', script], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${join(root, 'bin')}:${dirname(process.execPath)}:${process.env.PATH || ''}` },
  }) };
}

test('F09: export exit 23 не скрывается, даже если остался прежний dist', (t) => {
  const { run, root } = fixture(t, { exportExit: 23 });
  const result = run();
  assert.equal(result.status, 23, result.stderr);
  assert.equal(existsSync(join(root, 'dist/legal/privacy.html')), false);
});

test('build:web отклоняет отсутствие обязательных статических файлов', (t) => {
  for (const missing of assets) {
    const { run } = fixture(t, { missing });
    const result = run();
    assert.notEqual(result.status, 0, `${missing} не должен молча пропускаться`);
  }
});

test('build:web отклоняет отсутствующий index или JS bundle', (t) => {
  for (const config of [{ index: false }, { bundle: false }]) {
    const result = fixture(t, config).run();
    assert.notEqual(result.status, 0, result.stdout);
  }
});

test('build:web отклоняет пустой bundle и ссылки за пределы dist', (t) => {
  const empty = fixture(t);
  empty.put('dist/_expo/static/js/web/index.js', '');
  assert.notEqual(empty.run().status, 0);
  const escape = fixture(t);
  escape.put('dist/index.html', '<html><script src="../package.json"></script></html>');
  assert.notEqual(escape.run().status, 0);
});

test('успешный build:web сохраняет legal, share и deep-link assets по прежним адресам', (t) => {
  const { run, root } = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  for (const asset of assets) assert.equal(readFileSync(join(root, 'dist', asset), 'utf8'), `fixture:${asset}`);
  for (const name of ['terms', 'privacy', 'support']) {
    for (const alias of [name, `${name}.html`]) assert.equal(readFileSync(join(root, 'dist', alias), 'utf8'), `fixture:legal/${name}.html`);
  }
  assert.equal(readFileSync(join(root, 'dist/share/urtruck-market-v2.png'), 'utf8'), 'fixture:current-market-hero');
  const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
  assert.match(html, /property="og:title"/);
  assert.match(html, /urtruck-market-v2\.png/);
});
