import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src=readFileSync('src/utils/backgroundLocation.js','utf8');

test('persisted Expo background registration is migrated once per fresh app process',()=>{
  assert.match(src,/backgroundTrackingConfiguredThisProcess = false/);
  const block=src.slice(src.indexOf('export async function startBackgroundTracking'),src.indexOf('export async function stopBackgroundTracking'));
  assert.match(block,/started && backgroundTrackingConfiguredThisProcess/);
  assert.match(block,/if \(started\)[\s\S]*stopLocationUpdatesAsync\(BG_LOCATION_TASK\)/);
  assert.match(block,/startLocationUpdatesAsync\(BG_LOCATION_TASK/);
  assert.match(block,/backgroundTrackingConfiguredThisProcess = true/);
});
