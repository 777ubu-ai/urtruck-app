import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { glob, globSync } = require('glob');
const { minimatch } = require('minimatch');

test('сборочное дерево не содержит уязвимых glob/minimatch после security override', () => {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  let found = 0;
  for (const [path, pkg] of Object.entries(lock.packages)) {
    if (path.endsWith('node_modules/glob')) {
      assert.equal(pkg.version, '14.0.2', path);
      found++;
    }
    if (path.endsWith('node_modules/minimatch')) {
      assert.equal(pkg.version, '11.0.1', path);
      found++;
    }
  }
  assert.ok(found >= 2);
});

test('glob сохраняет sync/async обход, ignore и dot для сборки Expo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'urtruck-glob-'));
  try {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'node_modules'));
    for (const file of ['src/app.js', 'src/card.ts', 'src/.hidden.js', 'node_modules/skip.js']) {
      writeFileSync(join(dir, file), 'fixture');
    }
    const options = { cwd: dir, nodir: true, dot: true, ignore: ['node_modules/**'] };
    const expected = ['src/.hidden.js', 'src/app.js', 'src/card.ts'];
    assert.deepEqual(globSync('**/*.{js,ts}', options).sort(), expected);
    assert.deepEqual((await glob('**/*.{js,ts}', options)).sort(), expected);
    await assert.rejects(glob('**/*', { cwd: dir, signal: AbortSignal.abort(new Error('fixture_abort')) }), /fixture_abort/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('minimatch сохраняет рабочие шаблоны расширений и исключений', () => {
  assert.equal(minimatch('src/card.tsx', '**/*.{js,jsx,ts,tsx}'), true);
  assert.equal(minimatch('src/card.png', '**/*.{js,jsx,ts,tsx}'), false);
  assert.equal(minimatch('src/.private.js', '**/*.js'), false);
  assert.equal(minimatch('src/.private.js', '**/*.js', { dot: true }), true);
  assert.equal(minimatch('src/card.tsx', 'src/!(*.test).tsx', { optimizationLevel: 2 }), true);
});
