import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bg = readFileSync('src/utils/backgroundLocation.js','utf8');
const deal = readFileSync('src/screens/DealWorkspaceScreenV2.js','utf8');
const api = readFileSync('backend/api/marketplace.py','utf8');

test('persistent GPS FIFO transmits original capture timestamp', () => {
  assert.match(bg, /captured_at_ms: sample\.capturedAt/);
  assert.match(api, /captured_at_ms: Optional\[int\]/);
});

test('backend persists monotonic capture time and stale queue cannot restore GPS health', () => {
  assert.match(api, /captured_ms >= existing_ms/);
  assert.match(api, /fresh_for_restore = \(now_ms - captured_ms\) <= 180 \* 1000/);
  assert.match(api, /last_signal_at=\?/);
});

test('deal workspace age prefers physical capture timestamp', () => {
  assert.match(deal, /location\?\.captured_at_ms/);
  assert.match(deal, /new Date\(capturedMs\)/);
});
