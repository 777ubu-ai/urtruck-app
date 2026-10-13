import test from 'node:test';
import assert from 'node:assert/strict';
import { keyboardHostOffset } from '../../src/utils/keyboardHostOffset.js';

test('iOS nested host origin is accounted once above the absolute keyboard frame',()=>{
  for(const top of [0,47,140,200]) {
    const localHeight=800-top, keyboardY=500;
    const overlap=Math.max(0,localHeight-(keyboardY-keyboardHostOffset(top)));
    assert.equal(overlap,300);
  }
});
test('invalid or negative measurements do not move the composer',()=>{
  for(const y of [undefined,NaN,-1]) assert.equal(keyboardHostOffset(y),0);
});
