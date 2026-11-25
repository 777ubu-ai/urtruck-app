import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/screens/QueueScreenLazyV2.js', import.meta.url), 'utf8');

test('calendar does not convert MRP using an unverified fixed value', () => {
  assert.doesNotMatch(source, /MCI_KZT_2026|formatKztAmount/);
  assert.match(source, /L\.standard/);
  assert.match(source, /L\.premium/);
});
