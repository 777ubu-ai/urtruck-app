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

test('stationary Android wake posts a persisted genuine point through the retry queue', () => {
  assert.match(src, /defineTask\(BG_LOCATION_TASK/);
  assert.match(src, /BG_LAST_LOCATION_KEY/);
  assert.match(src, /await rememberLastKnownLocation\(coords\)/);
  assert.match(src, /timestamp: last\.timestamp \?\? last\.coords\.timestamp/);
  assert.match(src, /const coords = freshCoords \|\| await readLastKnownLocation\(\)/);
  assert.match(src, /if \(coords\) await pushLocationToDeals\(coords\)/);
  assert.match(src, /BG_LOCATION_QUEUE_KEY/);
});
