import assert from 'node:assert/strict';
import test from 'node:test';
import {performance} from 'node:perf_hooks';
import braces from 'braces';

const nested = depth => '{'.repeat(depth) + 'x' + '}'.repeat(depth);

test('CVE-2026-93687: deeply nested input fails before stack exhaustion', () => {
  const startedAt = performance.now();
  assert.throws(() => braces.parse(nested(101)), /exceeds max depth/);
  assert.ok(performance.now() - startedAt < 250,
    'depth guard must reject input promptly instead of exhausting the process stack');
});

test('large malicious nesting remains bounded and does not crash the process', () => {
  const startedAt = performance.now();
  assert.throws(() => braces.parse(nested(1_000)), /exceeds max depth/);
  assert.ok(performance.now() - startedAt < 1_000,
    'malicious nesting must remain bounded in time');
});

test('normal brace expansion remains compatible', () => {
  assert.deepEqual(braces.expand('route/{almaty,urumqi}/{1..2}'), [
    'route/almaty/1',
    'route/almaty/2',
    'route/urumqi/1',
    'route/urumqi/2',
  ]);
});

test('malformed patterns remain data rather than causing a process failure', () => {
  assert.deepEqual(braces.expand('route/{almaty,urumqi'), ['route/{almaty,urumqi']);
});
