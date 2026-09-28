import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bg = readFileSync('src/utils/backgroundLocation.js', 'utf8');
const hook = readFileSync('src/hooks/useDealLocationBroadcast.js', 'utf8');

test('headless GPS refreshes server-approved deal ids before posting', () => {
  assert.match(bg, /refreshBackgroundActiveDealIds/);
  assert.match(bg, /market\/tracking\/active/);
  assert.match(bg, /if \(!response\?\.ok\) return fallback/);
  assert.match(bg, /Offline is not the same as \"no active deals\"/);
});

test('cold start does not clear persisted GPS ids before server truth arrives', () => {
  assert.match(hook, /useState\(null\)/);
  assert.match(hook, /if \(!alive \|\| r\?\.ok === false\) return/);
  assert.match(hook, /key === null/);
  assert.doesNotMatch(hook, /if \(!candidateKey\)[\s\S]{0,120}setPermittedIds\(\[\]\)/);
});
