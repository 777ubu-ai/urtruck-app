import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measureComposerLines } from '../../src/utils/composerTextLayout.js';

const source = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const marker = 'onTextLayout={(event) => {';
const from = source.indexOf(marker);
assert.ok(from > 0);
const start = from + marker.length;
let depth = 1, end = start;
while (depth && end < source.length) {
  if (source[end] === '{') depth++;
  if (source[end] === '}') depth--;
  end++;
}
const body = source.slice(start, end - 1);
function handler({ input = 'draft', current = input, width = 200, currentWidth = width, oldScope = false } = {}) {
  const scope = {};
  let layout = { height: 44, scroll: false }, changes = 0;
  const invoke = new Function('event', 'composerMeasureScopeRef', 'chatDraft', 'inputValueRef', 'input', 'composerWidthRef', 'composerInputWidth', 'measureComposerLines', 'setIosComposerLayout', body);
  return {
    emit: (lines) => invoke({ nativeEvent: { lines } }, { current: oldScope ? {} : scope }, scope, { current }, input, { current: currentWidth }, width, measureComposerLines, (update) => { const next = update(layout); if (next !== layout) changes++; layout = next; }),
    get layout() { return layout; }, get changes() { return changes; },
  };
}
const lines = (n, height = 20) => Array.from({ length: n }, () => ({ height }));
test('iOS grows 1–4 rendered lines, scrolls the fifth, shrinks and resets without native contentSize', () => {
  const h = handler();
  for (const [n, height, scroll] of [[1,44,false],[2,56,false],[3,76,false],[4,96,false],[5,96,true],[8,96,true],[2,56,false],[1,44,false]]) {
    h.emit(lines(n));
    assert.deepEqual(h.layout, { height, scroll });
  }
  assert.deepEqual(measureComposerLines('', lines(8)), { height: 44, scroll: false });
});
test('wrapped rows and larger font use measured line heights rather than newline count or 104px', () => {
  assert.deepEqual(measureComposerLines('long text without Enter', lines(6)), { height: 96, scroll: true });
  assert.deepEqual(measureComposerLines('大字', lines(5, 30)), { height: 136, scroll: true });
  assert.deepEqual(measureComposerLines('\n\n\n', lines(4)), { height: 96, scroll: false });
});
test('stale text, width and room measurements are ignored', () => {
  for (const config of [{ current: 'new draft' }, { currentWidth: 300 }, { oldScope: true }]) {
    const h = handler(config); h.emit(lines(8));
    assert.deepEqual(h.layout, { height: 44, scroll: false });
    assert.equal(h.changes, 0);
  }
});
test('invalid line reports and identical layout do not change state or create feedback', () => {
  const h = handler(); h.emit(lines(4)); const before = h.layout;
  for (const invalid of [null, [], [{}], [{ height: NaN }], [{ height: 0 }], [{ height: -1 }]]) h.emit(invalid);
  h.emit(lines(4)); assert.equal(h.layout, before); assert.equal(h.changes, 1);
});
test('mirror measures the native input width, trailing Enter and stays outside accessibility', () => {
  const mirror = source.slice(from - 360, end + 150);
  assert.match(mirror, /accessible=\{false\}/);
  assert.match(mirror, /accessibilityElementsHidden/);
  assert.match(mirror, /composerInputWidth - 20/);
  assert.match(mirror, /input \+ '\\u200b'/);
  assert.match(source, /scrollEnabled=\{Platform.OS === 'ios' \? input.length > 0 && iosComposerLayout.scroll : inputHeight >= COMPOSER_INPUT_MAX_HEIGHT\}/);
});
