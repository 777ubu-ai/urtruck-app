import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const shareModal = readFileSync('src/components/ShareModal.js', 'utf8');
const chatApi = readFileSync('src/utils/chatAPI.js', 'utf8');

test('WeChat fallback closes the share sheet after copying', () => {
  const block = shareModal.match(/const handleWeChat = async \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(block, 'WeChat handler must remain explicit and reviewable');
  assert.match(block[1], /copyToClipboard\(fullShareText\)/);
  assert.match(block[1], /onClose\(\);/);
  assert.doesNotMatch(block[1], /Отправлено в WeChat|Sent to WeChat/);
});

test('chat provider/backend errors fail closed to localized text', () => {
  const fn = chatApi.match(/function chatApiError\(detail, fallbackKey\) \{([\s\S]*?)\n\}/);
  assert.ok(fn, 'chatApiError must remain centralized');
  assert.match(fn[1], /localized \|\| fallback/);
  assert.doesNotMatch(fn[1], /detail\.hint/);
  assert.doesNotMatch(fn[1], /typeof detail === 'string' && detail/);
});
