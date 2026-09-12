import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync('src/screens/QueueScreenLazyV2.js', 'utf8');

test('Border screen restores the complete checkpoint catalogue through the existing API fallback', () => {
  assert.match(screen, /fetchJson\(`\$\{BASE\}\/catalog`\)/);
  assert.match(screen, /fetchJson\(`\$\{BASE\}\?country=ALL`\)/);
  assert.match(screen, /normalizeCatalogRows\(legacy\?\.borders\)/);
  assert.match(screen, /visible\.map\(\(checkpoint\) =>/);
  assert.match(screen, /testID="border-checkpoint-chip"/);
});

test('Border screen does not silently present an empty checkpoint area when both catalogue sources fail', () => {
  assert.match(screen, /testID="border-catalog-error"/);
  assert.match(screen, /onPress=\{loadCatalog\}/);
  assert.match(screen, /setCatalogError\(L\.sourceError\)/);
});
