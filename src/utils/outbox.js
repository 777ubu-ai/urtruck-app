// QA-аудит P1-3: офлайн-очередь исходящих сообщений чата.
//
// Проблема: при потере сети chatAPI.send падал → сообщение терялось
// (после P0-2 хотя бы показывался toast, но пользователь должен был
// набирать заново). Теперь неотправленное кладётся в персистентную
// очередь и ретраится при следующем входе в чат / возврате сети.
//
// Безопасность от задвоения: каждый элемент несёт clientId, который
// уходит на backend как client_msg_id. Backend идемпотентен (UNIQUE
// (sender_id, client_msg_id) + дедуп), поэтому повторная доставка
// «уже дошедшего» сообщения не создаёт дубль.
//
// Объём: только ТЕКСТОВЫЕ сообщения. Фото/войс не очередим (локальные
// URI не переживают рестарт надёжно) — они получают clientMsgId только
// для дедупа в рамках сессии.

import { storage } from './storage';

const KEY = 'ur_chat_outbox';
const MAX = 50;
const listeners = new Set();
let mutationTail = Promise.resolve();
let flushTail = Promise.resolve();
let queueGeneration = 0;

// Сериализуем только storage-операции: сеть не блокирует enqueue.
function withQueueLock(operation) {
  const result = mutationTail.then(operation);
  mutationTail = result.catch(() => {});
  return result;
}

async function _load() {
  const raw = await storage.get(KEY);
  if (raw == null) return [];
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error('outbox_invalid_storage');
  return arr;
}

async function _save(arr) {
  const serialized = JSON.stringify(arr);
  await storage.set(KEY, serialized);
  // storage.set подавляет ошибки адаптера: проверяем фактическую запись.
  if (await storage.get(KEY) !== serialized) throw new Error('outbox_storage_failed');
  for (const cb of listeners) { try { cb(arr.length); } catch {} }
}

export function subscribeOutbox(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function enqueueOutbox(item, userId) {
  // item: { clientId, payload }  (payload — аргументы chatAPI.send)
  // userId (Блок 2, P1-5): владелец записи — чья это была сессия в момент
  // постановки в очередь. Без этого поля flushOutbox не может отличить
  // «мои неотправленные сообщения» от «сообщения предыдущего пользователя
  // на этом же устройстве» и раньше отправлял всё подряд под ЛЮБЫМ
  // залогиненным юзером (App.js гонял flush по факту hasToken, без проверки
  // владельца).
  return withQueueLock(async () => {
    const arr = await _load();
    if (arr.some((x) => x.clientId === item.clientId)) return;
    if (arr.length >= MAX) throw new Error('outbox_full');
    arr.push({ clientId: item.clientId, payload: item.payload, userId: userId || null, ts: Date.now() });
    await _save(arr);
  });
}

export async function outboxCount() {
  return withQueueLock(async () => (await _load()).length);
}

// P0 30.08.2026 — «отравленная очередь». Раньше flushOutbox на ЛЮБОЙ ошибке
// делал break и НЕ удалял элемент. Постоянная ошибка (403 «чат доступен
// только после принятия», 400, 404 — комната/статус сделки успели измениться)
// блокировала голову очереди НАВСЕГДА, а вместе с ней и все следующие
// сообщения: они не отправлялись ни разу за всё время жизни очереди. Снаружи
// это выглядело как «текст отправил → пузырь повисел → после обновления исчез
// → до собеседника не дошёл», причём голос и фото доходили (они в очередь не
// кладутся вообще — см. шапку файла).
//
// Теперь ошибки разделены:
//   • сетевая (нет связи)      → break, ждём следующего flush (порядок цел);
//   • постоянная 4xx           → элемент выбрасываем из очереди и идём дальше;
//   • временная (5xx/408/429)  → break, но со счётчиком попыток; после
//     MAX_ATTEMPTS элемент тоже выбрасывается, чтобы вечно живой 5xx не
//     запирал очередь.
// Выброшенные отдаются вызывающему через onDrop — чтобы UI пометил пузырь
// «не отправлено», а не молча его потерял.
const MAX_ATTEMPTS = 5;

function isPermanentError(error) {
  if (error?.isNetwork) return false;
  const status = Number(error?.status || 0);
  if (!status) return false;                        // причина неизвестна — считаем временной
  if (status === 408 || status === 429) return false;  // тайм-аут/троттлинг — имеет смысл ретраить
  return status >= 400 && status < 500;             // 400/403/404/413… сами не починятся
}

// Прогон очереди. sendFn(payload) должен бросать при неуспехе.
// Возвращает число УСПЕШНО отправленных (контракт не менялся — вызывающие
// проверяют `sent > 0`). Выброшенные без доставки приходят в opts.onDrop.
//
// activeUserId (Блок 2, P1-5): отправляем ТОЛЬКО записи текущего активного
// пользователя. Запись без userId — legacy (поставлена в очередь до этого
// фикса) — трактуем как принадлежащую текущему юзеру (иначе она застряла
// бы в очереди навсегда). Запись с ЧУЖИМ userId — не трогаем и не удаляем
// («карантин»): она уедет либо когда её реальный владелец снова
// залогинится, либо будет явно вычищена в signOut (см. clearOutbox).
export function flushOutbox(sendFn, activeUserId, opts = {}) {
  const result = flushTail.then(() => flushQueue(sendFn, activeUserId, opts));
  flushTail = result.catch(() => {});
  return result;
}

async function flushQueue(sendFn, activeUserId, { onDrop } = {}) {
  if (!activeUserId) return 0;
  const generation = queueGeneration;
  const snapshot = await withQueueLock(_load);
  let sent = 0;
  for (const queued of snapshot) {
    if (generation !== queueGeneration) break;
    const item = await withQueueLock(async () => (await _load()).find((x) => x.clientId === queued.clientId));
    if (!item || (item.userId && item.userId !== activeUserId)) continue;
    let error = null;
    try { await sendFn(item.payload); } catch (caught) { error = caught; }
    if (error?.isNetwork) break;
    const permanent = error && isPermanentError(error);
    let dropped = false;
    await withQueueLock(async () => {
      if (generation !== queueGeneration) return;
      const current = await _load();
      const existing = current.find((x) => x.clientId === item.clientId);
      if (!existing) return;
      const attempts = Number(existing.attempts || 0) + 1;
      dropped = !!error && (permanent || attempts >= MAX_ATTEMPTS);
      const next = !error || dropped
        ? current.filter((x) => x.clientId !== item.clientId)
        : current.map((x) => x.clientId === item.clientId ? { ...x, attempts } : x);
      await _save(next);
    });
    if (dropped && onDrop) { try { onDrop(item, error); } catch {} }
    if (!error) sent++;
    else if (!dropped) break;
  }
  return sent;
}

/** Logout не позволяет позднему flush восстановить очищенную очередь. */
export function clearOutbox() {
  return withQueueLock(async () => {
    await _save([]);
    queueGeneration += 1;
  });
}

export function clearOutboxForUser(userId) {
  return withQueueLock(async () => {
    const arr = await _load();
    await _save(arr.filter((x) => x.userId !== userId));
    queueGeneration += 1;
  });
}
