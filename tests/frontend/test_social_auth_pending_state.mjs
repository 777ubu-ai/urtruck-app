import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/utils/socialAuth.js', 'utf8');

test('OAuth pending state has a bounded lifetime', () => {
  assert.match(source, /PENDING_PROVIDER_MAX_AGE_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);
  assert.match(source, /startedAt:\s*Date\.now\(\)/);
  assert.match(source, /now - state\.startedAt > PENDING_PROVIDER_MAX_AGE_MS/);
});

test('legacy provider values are explicitly treated as stale', () => {
  assert.match(source, /legacy:\s*true/);
  assert.match(source, /state\.legacy \|\| state\.startedAt == null/);
});

test('callback can override stale metadata while completing the flow', () => {
  assert.match(source, /hasCallback \|\| !isPendingProviderStale\(state, now\)/);
});

test('provider state is parsed instead of restored as a raw string', () => {
  assert.match(source, /getPendingProviderState/);
  assert.match(source, /JSON\.stringify\(\{ provider, startedAt: Date\.now\(\) \}\)/);
});
