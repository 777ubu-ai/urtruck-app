import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeCargoName } from '../../src/utils/places.js';
import {
  composerHeightForLineCount,
  countComposerSoftWrapLines,
  normalizeComposerHeight,
  selectVoiceDurationSeconds,
  stableComposerHeight,
  stableComposerHeightFromLineCount,
} from '../../src/utils/chatMessageListState.js';
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

test('composer mirror maps actual visual lines to stable canonical heights', () => {
  const common = { minimum: 32, maximum: 88, lineHeight: 20 };
  assert.equal(composerHeightForLineCount({ ...common, lineCount: 1 }), 32);
  assert.equal(composerHeightForLineCount({ ...common, lineCount: 2 }), 52);
  assert.equal(composerHeightForLineCount({ ...common, lineCount: 3 }), 72);
  assert.equal(composerHeightForLineCount({ ...common, lineCount: 4 }), 88);
  assert.equal(composerHeightForLineCount({ ...common, lineCount: 9 }), 88);
});

test('composer soft-wrap contract counts fixed-width text and explicit newlines', () => {
  const measureText = (value) => Array.from(value).length;
  assert.equal(countComposerSoftWrapLines({ input: '123456789', usableWidth: 4, measureText }), 3);
  assert.equal(countComposerSoftWrapLines({ input: '1234\n56789', usableWidth: 4, measureText }), 3);
  assert.equal(countComposerSoftWrapLines({ input: '1234\n\n5678', usableWidth: 4, measureText }), 3);
});

test('composer mirror grows and shrinks through every bucket without content-size guesses', () => {
  const common = { minimum: 32, maximum: 88, lineHeight: 20 };
  let height = 32;
  const text = ['one', 'one two', 'one two three', 'one two three four'];
  for (const [index, value] of text.entries()) {
    height = stableComposerHeightFromLineCount({
      ...common,
      input: value,
      previousInput: index ? text[index - 1] : '',
      currentHeight: height,
      lineCount: index + 1,
    });
    assert.equal(height, [32, 52, 72, 88][index]);
  }
  for (const [lineCount, value, previous, expected] of [
    [3, text[2], text[3], 72],
    [2, text[1], text[2], 52],
    [1, text[0], text[1], 32],
  ]) {
    height = stableComposerHeightFromLineCount({ ...common, input: value, previousInput: previous, currentHeight: height, lineCount });
    assert.equal(height, expected);
  }
});

test('unchanged mirror line-count and polling reconciliation leave composer height stable', () => {
  const common = { input: 'длинная строка переносится по ширине поля', previousInput: 'длинная строка переносится по ширине поля', minimum: 32, maximum: 88, lineHeight: 20 };
  let height = 52;
  for (const lineCount of [2, 2, 2, 2]) {
    height = stableComposerHeightFromLineCount({ ...common, currentHeight: height, lineCount });
    assert.equal(height, 52);
  }
});

test('composer source keeps focused polling independent and preserves emoji geometry', () => {
  const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  assert.match(workspace, /setInterval\(loadMessages, 3000\)/);
  assert.match(workspace, /composerMeasuredTextRef/);
  assert.match(workspace, /composerMirrorMeasuredTextRef/);
  assert.match(workspace, /stableComposerHeightFromLineCount/);
  assert.match(workspace, /onTextLayout/);
  assert.match(workspace, /composerInputWidth - 20/);
  assert.match(workspace, /Platform\.OS === 'ios' && composerInputWidth > 0/);
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
