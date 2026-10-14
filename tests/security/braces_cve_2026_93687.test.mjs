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

test('fractional maxDepth and nested parentheses enforce the same boundary', () => {
  assert.doesNotThrow(() => braces.parse('{a,b}', {maxDepth: 1.5}));
  assert.throws(() => braces.parse('{{a,b},c}', {maxDepth: 1.5}), /exceeds max depth/);
  assert.doesNotThrow(() => braces.parse('(a)', {maxDepth: 1.5}));
  assert.throws(() => braces.parse('((a))', {maxDepth: 1.5}), /exceeds max depth/);
});

test('cyclic AST parent chains fail closed instead of looping', () => {
  const parent = {type: 'paren'};
  const ast = {type: 'paren', parent, nodes: [{type: 'text', value: 'a'}]};
  parent.parent = ast;
  assert.throws(() => braces.expand(ast), /parent chain contains a cycle/);
});

test('escapeInvalid preserves valid nested brace stringification', () => {
  for (const pattern of ['{{a}}', '{a,{b}}', '{{x}y}', '{a,{b,{c}}', '{}{a}']) {
    assert.equal(braces.stringify(braces.parse(pattern), {escapeInvalid: true}), pattern);
  }
});
