import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeCargoName } from '../../src/utils/places.js';
import { normalizeComposerHeight, selectVoiceDurationSeconds, stableComposerHeight } from '../../src/utils/chatMessageListState.js';
import { readFileSync } from 'node:fs';

test('cargo names decode once and malformed percent data is safe in every locale', () => {
  for (const lang of ['ru', 'zh', 'en', 'kk']) {
    assert.ok(!localizeCargoName('Electronics%20and%20textiles', lang).includes('%20'));
    assert.doesNotThrow(() => localizeCargoName('broken%2', lang));
  }
});

test('composer ignores invalid iOS content-size and stays at one-line height', () => {
  assert.equal(normalizeComposerHeight('', 999, 32, 88, 8), 32);
  assert.equal(normalizeComposerHeight('hello', NaN, 32, 88, 8), null);
  assert.equal(normalizeComposerHeight('hello', 36, 32, 88, 8), 44);
});

test('composer maps unchanged iOS second-line jitter to one canonical height', () => {
  let height = 52;
  for (const measurement of [40, 48, 40, 48, 40]) {
    height = stableComposerHeight({
      input: 'две строки', previousInput: 'две строки', currentHeight: height,
      reportedHeight: measurement, minimum: 32, maximum: 88,
    });
    assert.equal(height, 52);
  }
});

test('composer auto-grows and shrinks through every canonical line bucket', () => {
  const common = { minimum: 32, maximum: 88, lineHeight: 20 };
  let height = stableComposerHeight({ ...common, input: 'one', previousInput: '', currentHeight: 32, reportedHeight: 20 });
  assert.equal(height, 32);
  height = stableComposerHeight({ ...common, input: 'one\ntwo', previousInput: 'one', currentHeight: height, reportedHeight: 40 });
  assert.equal(height, 52);
  height = stableComposerHeight({ ...common, input: 'one\ntwo\nthree', previousInput: 'one\ntwo', currentHeight: height, reportedHeight: 60 });
  assert.equal(height, 72);
  height = stableComposerHeight({ ...common, input: 'one\ntwo\nthree\nfour', previousInput: 'one\ntwo\nthree', currentHeight: height, reportedHeight: 80 });
  assert.equal(height, 88);
  height = stableComposerHeight({ ...common, input: 'one\ntwo\nthree', previousInput: 'one\ntwo\nthree\nfour', currentHeight: height, reportedHeight: 60 });
  assert.equal(height, 72);
  height = stableComposerHeight({ ...common, input: 'one\ntwo', previousInput: 'one\ntwo\nthree', currentHeight: height, reportedHeight: 40 });
  assert.equal(height, 52);
  height = stableComposerHeight({ ...common, input: 'one', previousInput: 'one\ntwo', currentHeight: height, reportedHeight: 20 });
  assert.equal(height, 32);
  height = stableComposerHeight({ ...common, input: '', previousInput: 'one', currentHeight: height, reportedHeight: 999 });
  assert.equal(height, 32);
});

test('composer accepts a later valid measurement for unchanged text', () => {
  const next = stableComposerHeight({
    input: 'строка переносится по ширине', previousInput: 'строка переносится по ширине',
    currentHeight: 32, reportedHeight: 40, minimum: 32, maximum: 88, lineHeight: 20,
  });
  assert.equal(next, 52);
});

test('composer source keeps focused polling independent and preserves emoji geometry', () => {
  const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  assert.match(workspace, /setInterval\(loadMessages, 3000\)/);
  assert.match(workspace, /composerMeasuredTextRef/);
  assert.match(workspace, /stableComposerHeight/);
  assert.match(workspace, /inputEmojiSpacer/);
  assert.match(workspace, /width: 40, height: 40/);
});

test('voice duration trusts monotonic elapsed time when native value is implausible', () => {
  for (const seconds of [5, 10, 12, 30]) {
    assert.equal(selectVoiceDurationSeconds({ elapsedMs: seconds * 1000, durationMillis: seconds * 1000 }), seconds);
  }
  assert.equal(selectVoiceDurationSeconds({ elapsedMs: 12_000, durationSeconds: 49 }), 12);
  assert.equal(selectVoiceDurationSeconds({ elapsedMs: 12_000, durationMillis: 49 }), 12);
});

test('PDF preview and download URLs remain separate', () => {
  const backend = readFileSync('backend/api/deal_room.py', 'utf8');
  const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  assert.match(backend, /"download_url": download_url/);
  assert.match(backend, /return \{\*\*att, "url": url, "download_url": download_url\}/);
  assert.match(workspace, /docDownloadUrl: a\.download_url \|\| docUrl/);
  assert.match(workspace, /Linking\.openURL\(item\.docDownloadUrl \|\| item\.docUrl\)/);
});
