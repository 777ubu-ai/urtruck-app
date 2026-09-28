import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shareModal = readFileSync('src/components/ShareModal.js', 'utf8');

test('WeChat web share uses the native Web Share API with separate text and canonical URL', () => {
  assert.match(shareModal, /navigator\.share\(\{ title: 'UrTruck', text: shareBody, url: finalUrl \}\)/);
  assert.match(shareModal, /if \(Platform\.OS === 'web'\)/);
  assert.doesNotMatch(shareModal, /weixin:\/\//);
});

test('WeChat native share uses React Native Share with a canonical URL', () => {
  assert.match(shareModal, /Share\.share\(content, \{ dialogTitle: t\('share'\) \}\)/);
  assert.match(shareModal, /\{ message: shareBody, url: finalUrl \}/);
  assert.match(shareModal, /\{ message: fullShareText \}/);
});

test('WeChat fallback copies the complete text and URL only when system sharing is unavailable', () => {
  const block = shareModal.match(/const handleWeChat = async \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(block, 'WeChat handler must remain explicit and reviewable');
  assert.match(block[1], /copyToClipboard\(fullShareText\)/);
  assert.match(block[1], /t\('share_copied_open_wechat'\)/);
  assert.doesNotMatch(block[1], /Linking\.openURL/);
});

test('Web share body does not duplicate the canonical URL', () => {
  assert.match(shareModal, /const shareBody = fullShareText\.replace\(new RegExp/);
  assert.match(shareModal, /text: shareBody, url: finalUrl/);
});
