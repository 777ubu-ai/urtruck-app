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
  assert.equal(normalizeComposerHeight('', 999, 44, 104, 8), 44);
  assert.equal(normalizeComposerHeight('hello', NaN, 44, 104, 8), null);
  assert.equal(normalizeComposerHeight('hello', -1, 44, 104, 8), null);
  assert.equal(normalizeComposerHeight('hello', 36, 44, 104, 8), 44);
  assert.equal(normalizeComposerHeight('long text', 200, 44, 104, 8), 104);
});

test('deal composer safely reads partial native content-size events', () => {
  const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  assert.match(workspace, /const reportedHeight = event\?\.nativeEvent\?\.contentSize\?\.height/);
  assert.doesNotMatch(workspace, /event\.nativeEvent\.contentSize\.height/);
  assert.match(workspace, /const inputValueRef = React\.useRef\(''\)/);
  assert.match(workspace, /if \(!currentText\.trim\(\)\) \{\s*setComposerHeight\(COMPOSER_INPUT_MIN_HEIGHT\);/);
  assert.match(workspace, /if \(nextHeight != null\) setComposerHeight\(nextHeight\)/);
  assert.doesNotMatch(workspace, /onContentSizeChange=\{\(event\) => \{[\s\S]*?setInputHeight\(/);
  for (const measured of [undefined, null, NaN]) {
    assert.doesNotThrow(() => normalizeComposerHeight('draft', measured, 44, 104, 8));
    assert.equal(normalizeComposerHeight('draft', measured, 44, 104, 8), null);
  }
});

test('composer keeps a stable native input across all text/layout regressions', () => {
  const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  const composer = workspace.slice(workspace.indexOf('testID="deal-chat-composer-dock"'), workspace.indexOf('{emojiOpen ?'));
  assert.match(composer, /testID="deal-chat-composer-dock"/);
  assert.match(composer, /multiline/);
  assert.match(workspace, /textAlignVertical: 'top'/);
  assert.match(workspace, /inputShell: \{ flex: 1, minHeight: 44, maxHeight: 104/);
  assert.match(workspace, /input: \{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 44, maxHeight: 104/);
  assert.doesNotMatch(composer, /<TextInput[\s\S]*?key=/);
  assert.doesNotMatch(composer, /onLayout=/);
  assert.match(composer, /setComposerHeight\(\(?(?:nextHeight|COMPOSER_INPUT_MIN_HEIGHT)/);
  assert.match(workspace, /inputHeightRef\.current === next/);
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
