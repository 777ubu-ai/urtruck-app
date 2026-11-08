import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/utils/backgroundLocation.js', 'utf8');

test('active-trip Android tracking keeps a time heartbeat while stationary', () => {
  const block = src.slice(src.indexOf('startLocationUpdatesAsync'), src.indexOf('return { ok: true, foregroundService'));
  assert.match(block, /timeInterval:\s*60000/);
  assert.match(block, /distanceInterval:\s*0/);
  assert.match(block, /pausesUpdatesAutomatically:\s*false/);
  assert.match(block, /foregroundService:/);
});
