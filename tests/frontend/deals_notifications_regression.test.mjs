import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../src/screens/DealsScreen.js', import.meta.url), 'utf8');

test('Deals loader reads notifications independently and no longer references undefined notifData', () => {
  assert.match(source, /await notificationsAPI\.list\(50\)/);
  assert.match(source, /setUnreadNotifPaths\(unreadNotificationPaths\(notificationData\)\)/);
  assert.doesNotMatch(source, /notifData\?/);
});

test('notification failure is auxiliary and cannot fail the Deals dashboard', () => {
  assert.match(source, /try \{[\s\S]*await notificationsAPI\.list\(50\)[\s\S]*\} catch \{[\s\S]*setUnreadNotifPaths\(\[\]\)/);
});

test('unread notification path mapping preserves only unread actionable URLs', () => {
  const helper = source.match(/export const unreadNotificationPaths = \(data\) =>([\s\S]*?)\n\nconst parseServerDate/);
  assert.ok(helper, 'helper must be present in the active Deals module');
  assert.match(helper[1], /Array\.isArray\(data\?\.notifications\)/);
  assert.match(helper[1], /!item\?\.is_read/);
  assert.match(helper[1], /normalizeNotifPath\(item\?\.url\)/);
});
