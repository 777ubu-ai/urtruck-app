import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeCargoName } from '../../src/utils/places.js';
import { normalizeComposerHeight, selectVoiceDurationSeconds } from '../../src/utils/chatMessageListState.js';
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

test('deal composer safely reads partial native content-size events', () => {
  const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  assert.match(workspace, /const reportedHeight = event\?\.nativeEvent\?\.contentSize\?\.height/);
  assert.doesNotMatch(workspace, /event\.nativeEvent\.contentSize\.height/);
  for (const measured of [undefined, null, NaN]) {
    assert.doesNotThrow(() => normalizeComposerHeight('draft', measured, 32, 88, 8));
    assert.equal(normalizeComposerHeight('draft', measured, 32, 88, 8), null);
  }
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
