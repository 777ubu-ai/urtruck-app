// P1 30.08.2026/01.09.2026 (reconciliation §9): офлайн-очередь GPS-точек
// активного рейса.
//
// Проблема: useDealLocationBroadcast.js слал координаты «выстрелил и забыл»
// — `marketAPI.sendDealLocation(id, payload)` без ожидания результата и без
// повторной попытки. На границе (at_border) сеть регулярно пропадает на
// минуты — каждая точка, отправленная в этот момент, терялась НАВСЕГДА:
// как только сеть восстанавливалась, следующий тик слал уже НОВУЮ позицию,
// старая точка просто исчезала без следа. Для международных рейсов это
// означает пропуски в треке ровно там, где GPS важнее всего (переход
// границы, поворот, застревание).
//
// Backend-модель: `deal_locations` хранит ТОЛЬКО последнюю точку на сделку
// (UPSERT по deal_id, PRIMARY KEY — не история). Это делает очередь простой:
// доставка гарантированно идемпотентна (повторная/устаревшая точка просто
// перезапишется более новой), достаточно сохранить порядок FIFO при разгрузке
// — без client_msg_id-дедупа, который нужен был чату (там копится история).
//
// Формула ошибок — та же, что в outbox.js (текстовый чат): постоянная 4xx
// (403 «не водитель», 404 «сделки нет», 409 «рейс не активен» — деал уже
// закрылся/отменился к моменту разгрузки, точка неактуальна) выбрасывается
// из очереди сразу; сетевая — ждём; 5xx/408/429 — ждём, но со счётчиком
// попыток, чтобы вечная 500 не заперла очередь навсегда.
import { storage } from './storage';

const KEY = 'ur_gps_outbox';
const MAX = 200; // рейс может длиться сутки на границе без сети — не резать агрессивно
const MAX_ATTEMPTS = 5;

async function _load() {
  try {
    const raw = await storage.get(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function _save(arr) {
  try { await storage.set(KEY, JSON.stringify(arr.slice(-MAX))); } catch {}
}

export async function enqueueGpsPoint(dealId, payload) {
  if (!dealId || !payload) return;
  const arr = await _load();
  arr.push({ id: `${dealId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, dealId, payload, ts: Date.now() });
  await _save(arr);
}

export async function gpsOutboxCount() {
  return (await _load()).length;
}

function isPermanentStatus(status) {
  const s = Number(status || 0);
  if (!s) return false; // нет status — сетевая ошибка, не постоянная
  if (s === 408 || s === 429) return false;
  return s >= 400 && s < 500;
}

// sendFn(dealId, payload) — контракт marketAPI.sendDealLocation: НЕ бросает,
// возвращает { ok: true } | { ok: false, status? }. status отсутствует при
// чисто сетевой ошибке (см. marketAPI.js catch-блок), присутствует, когда
// сервер реально ответил не-2xx.
export async function flushGpsOutbox(sendFn) {
  let arr = await _load();
  if (!arr.length) return 0;
  let sent = 0;
  // FIFO — старые точки уходят первыми, backendUPSERT сам сойдётся к
  // последней актуальной позиции к концу разгрузки.
  for (const item of [...arr].sort((a, b) => a.ts - b.ts)) {
    let result;
    try {
      result = await sendFn(item.dealId, item.payload);
    } catch {
      result = { ok: false };
    }
    if (result?.ok) {
      arr = arr.filter((x) => x.id !== item.id);
      await _save(arr);
      sent++;
      continue;
    }
    if (isPermanentStatus(result?.status)) {
      // Сделка уже не в работе / водитель сменился — точка неактуальна.
      arr = arr.filter((x) => x.id !== item.id);
      await _save(arr);
      continue;
    }
    if (!result?.status) break; // сетевая ошибка — сеть, вероятно, ещё недоступна, стоп
    const attempts = Number(item.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      arr = arr.filter((x) => x.id !== item.id);
      await _save(arr);
      continue;
    }
    arr = arr.map((x) => (x.id === item.id ? { ...x, attempts } : x));
    await _save(arr);
    break;
  }
  return sent;
}

export async function clearGpsOutbox() {
  await _save([]);
}
