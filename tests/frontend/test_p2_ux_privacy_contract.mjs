import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatUrTruckLocationMessage, parseUrTruckLocationMessage } from '../../src/utils/chatLocation.js';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const guard = read('src/hooks/useDiscardChangesGuard.js');
assert.match(guard, /navigation\.addListener\('beforeRemove'/);
assert.match(guard, /event\.preventDefault\(\)/);
assert.match(guard, /navigation\.dispatch\(event\.data\.action\)/);
assert.match(guard, /discard_changes_body/);

for (const path of ['src/screens/CreateCargoScreen.js', 'src/screens/CreateTripScreen.js']) {
  const source = read(path);
  assert.match(source, /useDiscardChangesGuard\(\{ navigation, hasChanges, t \}\)/, `${path}: close guard`);
  assert.match(source, /markSafeToLeave\(\);\s*navigation\.replace/, `${path}: successful publish may leave`);
  assert.doesNotMatch(source, /t\('create_route_save_draft'\)/, `${path}: must not promise a draft`);
}

const chats = read('src/screens/ChatsListScreen.js');
for (const marker of ["RU: 'ru-RU'", "KK: 'kk-KZ'", "ZH: 'zh-CN'", "EN: 'en-US'"]) {
  assert.ok(chats.includes(marker), `locale-aware chat dates: ${marker}`);
}
assert.doesNotMatch(chats, /toLocaleDateString\('ru-RU'/);
assert.doesNotMatch(chats, /formatStatus\(/, 'raw/global status formatting must not bypass viewer locale');
assert.match(chats, /accessibilityLabel=\{`\$\{partnerName\}\. \$\{statusLabel\}/);

const chat = read('src/screens/ChatScreen.js');
assert.match(chat, /parseUrTruckLocationMessage/);
assert.match(chat, /testID="chat-location-coordinate-card"/);
assert.match(chat, /chat_location_privacy_note/);
assert.doesNotMatch(chat, /yandex\.(?:ru|com)\/maps|maps\.yandex/i, 'chat location must never open an external map');
const encodedLocation = formatUrTruckLocationMessage('My location', 43.238949, 76.889709);
assert.equal(encodedLocation, '📍 My location: 43.238949, 76.889709');
assert.deepEqual(parseUrTruckLocationMessage(encodedLocation), { latitude: 43.238949, longitude: 76.889709 });
assert.equal(formatUrTruckLocationMessage('Invalid', 91, 76), null);
assert.equal(parseUrTruckLocationMessage('📍 Location: NaN, 76'), null);
assert.equal(parseUrTruckLocationMessage('https://yandex.ru/maps/?ll=76,43'), null);

const queue = read('src/screens/QueueScreen.js');
for (const marker of ['lookup_in_queue', 'lookup_called', 'lookup_crossed', 'lookup_revoked']) {
  assert.equal((queue.match(new RegExp(`${marker}:`, 'g')) || []).length, 4, `${marker}: RU/KK/EN/ZH parity`);
}
assert.doesNotMatch(queue, /status_raw\s*\|\|\s*(?:state|lookup)\.status/, 'raw CGR statuses must not leak into UI');
assert.match(queue, /accessibilityLabel=\{`\$\{L\.queueStatus\}/);

const dealRoom = read('src/components/deal/DealRoom.js');
assert.doesNotMatch(dealRoom, /#FF8400/i, 'DealRoom must not carry the legacy orange constant');
assert.match(dealRoom, /CLIENT_ACCENT = v1Colors\.cargoOwner/);
assert.match(dealRoom, /dealStatusColor\(displayStatus, v1\)/);

const i18n = read('src/utils/i18n.js');
for (const key of [
  'discard_changes_title',
  'discard_changes_body',
  'continue_editing',
  'discard_changes_action',
  'chat_location_in_app',
  'chat_location_privacy_note',
]) {
  assert.equal((i18n.match(new RegExp(`\\b${key}:`, 'g')) || []).length, 4, `${key}: RU/KK/ZH/EN parity`);
}

console.log('P2 UX/privacy contract: PASS');
