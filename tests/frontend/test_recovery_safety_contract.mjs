import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const shareModal = readFileSync('src/components/ShareModal.js', 'utf8');
const i18n = readFileSync('src/utils/i18n.js', 'utf8');
const chatApi = readFileSync('src/utils/chatAPI.js', 'utf8');

test('WeChat fallback closes the share sheet after copying', () => {
  const block = shareModal.match(/const handleWeChat = async \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(block, 'WeChat handler must remain explicit and reviewable');
  assert.match(block[1], /copyToClipboard\(fullShareText\)/);
  assert.match(block[1], /onClose\(\);/);
  assert.doesNotMatch(block[1], /Отправлено в WeChat|Sent to WeChat/);
});
test('share channels are explicit two-column actions in every locale', () => {
  assert.match(shareModal, /action: t\('share_action_send'\)/);
  assert.match(shareModal, /action: t\('share_action_copy'\)/);
  assert.match(shareModal, /accessibilityRole="button"/);
  assert.match(shareModal, /flexWrap: 'wrap'/);
  assert.match(shareModal, /actionRow:/);
  assert.equal([...i18n.matchAll(/share_action_send:/g)].length, 4);
  assert.equal([...i18n.matchAll(/share_action_copy:/g)].length, 4);
});

test('chat provider/backend errors fail closed to localized text', () => {
  const fn = chatApi.match(/function chatApiError\(detail, fallbackKey\) \{([\s\S]*?)\n\}/);
  assert.ok(fn, 'chatApiError must remain centralized');
  assert.match(fn[1], /localized \|\| fallback/);
  assert.doesNotMatch(fn[1], /detail\.hint/);
  assert.doesNotMatch(fn[1], /typeof detail === 'string' && detail/);
});
