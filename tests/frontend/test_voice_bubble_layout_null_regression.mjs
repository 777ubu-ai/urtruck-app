import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/components/VoiceMessageBubble.js', import.meta.url), 'utf8');
const attrStart = source.indexOf('onLayout=');
const expressionStart = source.indexOf('{', attrStart);
assert.ok(attrStart >= 0 && expressionStart > attrStart, 'voice track onLayout handler exists');

let depth = 0;
let expressionEnd = -1;
for (let i = expressionStart; i < source.length; i += 1) {
  if (source[i] === '{') depth += 1;
  if (source[i] === '}') depth -= 1;
  if (depth === 0) {
    expressionEnd = i;
    break;
  }
}
assert.ok(expressionEnd > expressionStart, 'voice track onLayout expression closes');
const callbackSource = source.slice(expressionStart + 1, expressionEnd);
const invokeHandler = new Function('event', 'setTrackWidth', `return (${callbackSource})(event, setTrackWidth);`);

test('voice track layout ignores null and malformed native events, preserving the last width', () => {
  let trackWidth = 120;
  const handler = invokeHandler;
  for (const event of [undefined, null, {}, { nativeEvent: null }, { nativeEvent: {} },
    { nativeEvent: { layout: null } },
    { nativeEvent: { layout: { width: null } } },
    { nativeEvent: { layout: { width: '168' } } },
    { nativeEvent: { layout: { width: NaN } } },
    { nativeEvent: { layout: { width: -1 } } },
    { nativeEvent: { layout: { width: 0 } } }]) {
    assert.doesNotThrow(() => handler(event, (value) => { trackWidth = value; }));
    assert.equal(trackWidth, 120);
  }
});

test('voice track layout extracts a valid width synchronously before event invalidation', () => {
  let trackWidth = 0;
  let invalidated = false;
  const event = {
    get nativeEvent() {
      if (invalidated) throw new Error('native event read after handler returned');
      return { layout: { width: 168 } };
    },
  };
  const handler = invokeHandler;
  handler(event, (value) => {
    assert.equal(typeof value, 'number', 'state receives an extracted measurement, not an updater');
    trackWidth = value;
  });
  invalidated = true;
  assert.equal(trackWidth, 168);
});
