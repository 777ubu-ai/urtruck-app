import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const push = fs.readFileSync('src/utils/push.js', 'utf8');
const banner = fs.readFileSync('src/components/PushPermissionBanner.js', 'utf8');
const app = fs.readFileSync('App.js', 'utf8');

test('web bootstrap never consumes browser notification permission prompt', () => {
  assert.match(push, /permission_required/);
  assert.match(push, /this\.subscribe\(\{ requestPermission: false \}\)/);
  assert.match(push, /options\?\.requestPermission === true/);
});

test('authenticated web UI has explicit push permission CTA', () => {
  assert.match(banner, /push\.subscribe\(\{ requestPermission: true \}\)/);
  assert.match(banner, /testID="push-permission-enable"/);
  assert.match(app, /<PushPermissionBanner enabled=\{hasToken\} \/>/);
});

test('native Android notifications use a dedicated audible channel', () => {
  assert.match(push, /NATIVE_PUSH_CHANNEL_ID = 'urtruck_messages_v2'/);
  assert.match(push, /setNotificationChannelAsync\(NATIVE_PUSH_CHANNEL_ID/);
  assert.match(push, /importance:\s*Notifications\.AndroidImportance\.MAX/);
  assert.match(push, /sound:\s*'default'/);
  assert.match(push, /vibrationPattern:\s*\[0,\s*250,\s*250,\s*250\]/);
});
