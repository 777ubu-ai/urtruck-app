import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../src/screens/DealsScreen.js', import.meta.url), 'utf8');

test('Deals loader reads notifications independently and no longer references undefined notifData', () => {
  assert.match(source, /notificationsAPI\.attention\(\)/);
  assert.match(source, /setUnreadNotifPaths\(unreadNotificationPaths\(notificationData\)\)/);
  assert.doesNotMatch(source, /notifData\?/);
});

test('notification outage keeps the last attention snapshot and reports refresh failure', () => {
  assert.match(source, /if \(request === loadRequestRef\.current\) setLoadError\(true\)/);
  assert.doesNotMatch(source, /setUnreadNotifPaths\(\[\]\)/);
});

test('unread notification path mapping preserves only unread actionable URLs', () => {
  const helper = source.match(/export const unreadNotificationPaths = \(data\) =>([\s\S]*?)\n\nconst parseServerDate/);
  assert.ok(helper, 'helper must be present in the active Deals module');
  assert.match(helper[1], /Array\.isArray\(data\?\.notifications\)/);
  assert.match(helper[1], /!item\?\.is_read/);
  assert.match(helper[1], /normalizeNotifPath\(item\?\.url\)/);
});
