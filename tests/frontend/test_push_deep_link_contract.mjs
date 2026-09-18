// Frontend deep-link contract for push URLs (26.08.2026).
//
// Backend matrix живёт в docs/release/push-event-matrix.md, backend
// contract — в backend/tests/test_push_event_matrix.py. Здесь фиксируем
// то, что backend породит URL, а frontend его пропарсит и перекинет на
// правильный экран:
//   /cargos/{id}?bid={bid_id}       → CargoDetail(cargoId, bidId)
//   /trips/{id}?bid={bid_id}        → TripDetail(tripId, bidId)
//   /chats/{room_id}                → Chat(roomId)
//   /deals/{id}                     → Chat(dealId)   (Deal Room в чате)
//   /profile                        → Profile
//   /notifications                  → Notifications
//   /auth?token={t}                 → OtpV2(magicToken=t)
//
// Тесты — grep-style против App.js. Если backend начнёт слать новый
// формат url, а фронт не будет знать как его распарсить — сюда упадём.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.js', 'utf8');

test('parseNotifUrl exists and strips protocol/host', () => {
  assert.match(app, /function parseNotifUrl\(url\) \{/);
  // Payload URL могут приходить как 'https://urtruck.kz/cargos/1' и как
  // '/cargos/1'. Обе формы должны нормализоваться до 'cargos/1' перед
  // сплитом. Проверяем как строку, чтобы не бороться с regex-of-regex.
  assert.ok(
    app.includes(".replace(/^https?:\\/\\/[^/]+/i, '').replace(/^\\/+/, '')"),
    "protocol/host stripping must live in parseNotifUrl",
  );
});

test('parseNotifUrl extracts kind + id + query params (bid=…)', () => {
  const block = app.match(/function parseNotifUrl\(url\) \{([\s\S]*?)\n\}\n/);
  assert.ok(block, 'parseNotifUrl body not found');
  const body = block[1];
  assert.match(body, /const \[pathPart, queryPart = ''\] = cleaned\.split\('\?'\);/);
  assert.match(body, /const kind = segments\[0\]\.toLowerCase\(\);/);
  assert.match(body, /const id = segments\[1\] \|\| null;/);
  // params распаковываются, чтобы `?bid=xxx` можно было прочитать.
  assert.match(body, /params\[decodeURIComponent\(rawK\)\] = decodeURIComponent\(rawV\);/);
});

test('cargos deep-link opens CargoDetail with role + bidId param preserved', () => {
  assert.match(app, /if \(kind === 'cargos' && id\) \{[\s\S]*?navRef\.current\.navigate\('CargoDetail', \{ cargoId: id, bidId: params\.bid \|\| null, role \}\);/);
});

test('trips deep-link opens TripDetail with role + bidId', () => {
  assert.match(app, /\} else if \(kind === 'trips' && id\) \{[\s\S]*?navRef\.current\.navigate\('TripDetail', \{ tripId: id, bidId: params\.bid \|\| null, role \}\);/);
});

test('deals deep-link opens the deal chat (Deal Room), not just ChatsList', () => {
  // BUG-002 в комментарии: раньше кидало в общий список чатов без
  // контекста — фикс, чтобы push вёл прямо в конкретную сделку.
  assert.match(app, /\} else if \(kind === 'deals' && id\) \{[\s\S]*?navRef\.current\.navigate\('Chat', \{ dealId: id, role \}\);/);
});

test('chats/{room_id} deep-link opens the exact chat room, not the list', () => {
  assert.match(app, /\} else if \(kind === 'chats' && id\) \{[\s\S]*?navRef\.current\.navigate\('Chat', \{ roomId: id, role \}\);/);
});

test('bare chat/chats without id falls back to ChatsList', () => {
  assert.match(app, /\} else if \(kind === 'chat' \|\| kind === 'chats'\) \{[\s\S]*?navRef\.current\.navigate\('ChatsList'\);/);
});

test('profile deep-link is handled (previously fell to default and did nothing)', () => {
  // Комментарий в коде фиксирует прежний баг: '/profile' пуши от
  // отзывов/статуса документов не парсились. Тест защищает от регрессии.
  assert.match(app, /\} else if \(kind === 'profile'\) \{[\s\S]*?navRef\.current\.navigate\('Profile'\);/);
});

test('notifications deep-link is handled', () => {
  assert.match(app, /\} else if \(kind === 'notifications'\) \{[\s\S]*?navRef\.current\.navigate\('Notifications'\);/);
});

test('auth?token= deep-link routes through OtpV2 with magicToken (magic link login)', () => {
  assert.match(app, /\} else if \(kind === 'auth' && params\.token\) \{[\s\S]*?navRef\.current\.navigate\('OtpV2', \{ channel: 'email', magicToken: params\.token \}\);/);
});

test('deep-link with unknown auth path is DEFERRED until user is logged in (pendingUrlRef)', () => {
  // Cargo/Trip/Deal/Chat/Profile/Notifications требуют сессию + роль.
  // routeFromUrl должен положить url в pendingUrlRef до готовности
  // навигатора и авторизованного стека — иначе тап по push «теряется»,
  // когда приложение открыто в холодном старте на splash.
  assert.match(app, /const needsAuth = parsed && \['chats', 'chat', 'deals', 'cargos', 'trips', 'profile', 'notifications'\]\.includes\(parsed\.kind\);/);
  assert.match(app, /pendingUrlRef\.current = url;  \/\/ отложить/);
});

test('deferred deep-link plays back once auth + navigator are both ready', () => {
  assert.match(app, /useEffect\(\(\) => \{[\s\S]*?if \(pendingUrlRef\.current && navReadyRef\.current && authedForDeepLink\) \{/);
});

test('navigateFromUrl always threads role through so the target screen renders in the correct mode', () => {
  // BUG-005: cargos/trips/deals/chats — все передают `role`.
  // Иначе экран открывался в дефолтном виде, независимо от того,
  // кто пришёл по пушу. Проверяем каждый экран отдельно (простые
  // substring-и, без regex-of-regex внутри шаблонного литерала).
  assert.ok(
    app.includes("navigate('CargoDetail', { cargoId: id, bidId: params.bid || null, role })"),
    'CargoDetail deep-link must pass role',
  );
  assert.ok(
    app.includes("navigate('TripDetail', { tripId: id, bidId: params.bid || null, role })"),
    'TripDetail deep-link must pass role',
  );
  assert.ok(
    app.includes("navigate('Chat', { dealId: id, role })"),
    'deals→Chat deep-link must pass role',
  );
  assert.ok(
    app.includes("navigate('Chat', { roomId: id, role })"),
    'chats→Chat deep-link must pass role',
  );
});
