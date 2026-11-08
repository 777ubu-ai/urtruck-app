// Регрессия P0 30.08.2026 — «текст в чате не доходит, а голос/фото доходят».
//
// Симптом с прода (urtruck.kz v126 + TestFlight): отправляешь текст — пузырь
// появляется, после обновления исчезает, до собеседника не доходит. Голосовые
// и фото при этом доходят всегда.
//
// Первопричина: при обрыве/смене сети (4G→5G→wifi) текст уходит в офлайн-
// очередь (в неё кладётся ТОЛЬКО текст — фото/войс намеренно нет), а очередь
// «отравливалась»: flushOutbox на ЛЮБОЙ ошибке делал break и не удалял
// элемент, поэтому одно сообщение с постоянной ошибкой (403/400/404)
// блокировало голову очереди НАВСЕГДА вместе со всеми следующими. Плюс
// комната сделки вообще никогда не разгружала очередь, App.js потерял
// защиту владельца очереди, а сверка optimistic↔server роняла второе
// одинаковое сообщение.
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/test_chat_text_delivery_outbox.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  enqueueOutbox, flushOutbox, outboxCount, clearOutbox,
} from '../../src/utils/outbox.js';

const err = (status) => Object.assign(new Error(`http ${status}`), { status });
const netErr = () => Object.assign(new Error('network'), { isNetwork: true });

async function seed(...texts) {
  await clearOutbox();
  for (let i = 0; i < texts.length; i++) {
    await enqueueOutbox({ clientId: `c${i}`, payload: { text: texts[i] } }, 'u1');
  }
}

// ── функциональные: семантика очереди ───────────────────────

test('очередь: постоянная 4xx у головы НЕ запирает остальные сообщения', async () => {
  await seed('🙂', 'Рриии', 'Ьььь');
  const tried = [];
  const sent = await flushOutbox(async (p) => {
    tried.push(p.text);
    if (p.text === '🙂') throw err(403);   // комната/статус сделки изменились
    return { ok: true };
  }, 'u1');
  assert.deepEqual(tried, ['🙂', 'Рриии', 'Ьььь'], 'все три обязаны быть испробованы за один прогон');
  assert.equal(sent, 2, 'два доставляемых сообщения должны уехать, несмотря на битую голову');
  assert.equal(await outboxCount(), 0, 'битый элемент выброшен, очередь пуста — а не заперта навсегда');
});

test('очередь: сетевая ошибка НЕ выбрасывает сообщение и сохраняет порядок', async () => {
  await seed('первое', 'второе');
  const sent = await flushOutbox(async () => { throw netErr(); }, 'u1');
  assert.equal(sent, 0);
  assert.equal(await outboxCount(), 2, 'нет сети — ничего не теряем, уедет следующим flush');
});

test('очередь: onDrop сообщает UI о недоставленном (пузырь не исчезает молча)', async () => {
  await seed('битое');
  const dropped = [];
  await flushOutbox(async () => { throw err(400); }, 'u1', {
    onDrop: (item, error) => dropped.push([item.clientId, error?.status]),
  });
  assert.deepEqual(dropped, [['c0', 400]], 'вызывающий обязан узнать, что сообщение не доставлено');
});

test('очередь: 429/408 считаются временными и не выбрасываются сразу', async () => {
  await seed('троттлинг');
  await flushOutbox(async () => { throw err(429); }, 'u1');
  assert.equal(await outboxCount(), 1, '429 — это «подожди», а не «выбрось»');
});

test('очередь: вечная 5xx выбрасывается после лимита попыток, не заперев очередь', async () => {
  await seed('вечная500');
  for (let i = 0; i < 5; i++) {
    await flushOutbox(async () => { throw err(500); }, 'u1');
  }
  assert.equal(await outboxCount(), 0, 'после MAX_ATTEMPTS элемент уходит, иначе очередь стоит вечно');
});

test('очередь: сообщения ЧУЖОГО юзера не уезжают под текущей сессией', async () => {
  await clearOutbox();
  await enqueueOutbox({ clientId: 'foreign', payload: { text: 'чужое' } }, 'user_A');
  const tried = [];
  await flushOutbox(async (p) => { tried.push(p.text); return { ok: true }; }, 'user_B');
  assert.deepEqual(tried, [], 'запись другого владельца остаётся в карантине');
  assert.equal(await outboxCount(), 1, 'и не удаляется — уедет, когда владелец вернётся');
});

// ── статические: проводка не удалена ────────────────────────

const dealSrc = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const appSrc = readFileSync('App.js', 'utf8');

test('комната сделки: сама разгружает очередь (вход + возврат в active)', () => {
  assert.match(dealSrc, /import \{ enqueueOutbox, flushOutbox \} from '\.\.\/utils\/outbox'/,
    'без импорта flushOutbox комната только копит очередь и никогда её не отправляет');
  assert.match(dealSrc, /flushOutbox\(\(p\) => chatAPI\.send\(p\), session\?\.user\?\.id/,
    'flush обязан идти с activeUserId — иначе уедет чужая очередь');
  const idx = dealSrc.indexOf('const doFlush = async () =>');
  assert.ok(idx > 0, 'doFlush должен существовать в комнате сделки');
  const block = dealSrc.slice(idx, idx + 1100);
  assert.match(block, /onDrop:/, 'недоставленное обязано помечаться в UI, а не исчезать молча');
  assert.match(block, /sendStatus: 'failed'/);
  assert.match(block, /AppState\.addEventListener\('change'/,
    'возврат в active — второй триггер (на вебе перезагрузки может не быть всю сессию)');
});

test('App.js: глобальный flush передаёт activeUserId', () => {
  assert.match(appSrc, /flushOutbox\(\(p\) => chatAPI\.send\(p\), session\?\.user\?\.id\)/,
    'без activeUserId защита владельца из flushOutbox молча обходится');
  assert.doesNotMatch(appSrc, /flushOutbox\(\(p\) => chatAPI\.send\(p\)\)/,
    'старый вызов без владельца не должен вернуться');
});

test('сверка optimistic↔server: по client_msg_id, текст — только фолбэк', () => {
  assert.match(dealSrc, /server\.clientMsgId\s*\n?\s*\?\s*server\.clientMsgId === item\.id/,
    'основной критерий — устойчивый client_msg_id');
  assert.doesNotMatch(dealSrc, /server\.clientMsgId === item\.id \|\| \(server\.mine/,
    'старое «или по тексту» роняло второе одинаковое сообщение — не должно вернуться');
});
