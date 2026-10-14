// Tiny pub/sub for "session token expired" (HTTP 401 on authenticated traffic).
//
// QA-аудит P1-6: раньше истёкший/отозванный токен (TTL 30 дней, либо
// серверный revoke) в фичевых эндпоинтах выглядел как generic-ошибка —
// пользователь застревал с «серверной ошибкой» вместо выхода на login.
//
// Дизайн (безопасный, без цикла разлогина):
//   - authedFetch проверяет 401 через текущий bearer и /register/me.
//     Гостевой/устаревший запрос и временный сбой не запускают выход.
//   - AuthContext подписывается и делает signOut ОДИН раз.
//   - Защита от цикла: (1) cooldown между срабатываниями; (2) suppression
//     на время самого signOut и короткий хвост после (guest re-init,
//     logout POST не должны ретриггерить).
//   - Подключаем ТОЛЬКО к внутрисессионному трафику (marketAPI/chatAPI).
//     registration.js (auth-bootstrap) намеренно не оборачиваем — 401 во
//     время инициализации не должен инициировать выход.

const listeners = new Set();
let suppressed = false;
let lastFireAt = 0;
let expiryValidation = null;
const pendingValidations = new Map();
const COOLDOWN_MS = 4000;
const VALIDATION_TIMEOUT_MS = 5000;

// A feature endpoint is not authoritative about the entire login session.
// Validate the same current bearer through /register/me before logging out.
export function configureAuthExpiryValidation(validation) {
  expiryValidation = validation;
  return () => {
    if (expiryValidation === validation) expiryValidation = null;
  };
}

export function subscribeAuthExpired(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setAuthExpirySuppressed(value) {
  suppressed = !!value;
}

export function notifyAuthExpired(token) {
  if (suppressed || !token) return;
  const now = Date.now();
  if (now - lastFireAt < COOLDOWN_MS) return;
  lastFireAt = now;
  for (const cb of listeners) {
    try { cb(token); } catch {}
  }
}

function requestBearer(input, init) {
  const headers = init?.headers ?? input?.headers;
  let authorization;
  if (typeof headers?.get === 'function') authorization = headers.get('Authorization');
  else if (Array.isArray(headers)) {
    authorization = headers.find(([key]) => String(key).toLowerCase() === 'authorization')?.[1];
  } else if (headers) {
    const key = Object.keys(headers).find((name) => name.toLowerCase() === 'authorization');
    authorization = key ? headers[key] : null;
  }
  return typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim() : null;
}

async function confirmAuthExpired(token) {
  const validation = expiryValidation;
  if (!token || !validation || suppressed) return;
  if (pendingValidations.has(token)) return pendingValidations.get(token);
  const work = (async () => {
    let timer;
    const controller = new AbortController();
    try {
      if (await validation.getToken() !== token || suppressed) return;
      // Promise.race also bounds transports which ignore AbortSignal.
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve(null); }, VALIDATION_TIMEOUT_MS);
      });
      const status = await Promise.race([
        validation.validateToken(token, { signal: controller.signal }), timeout,
      ]);
      if (status !== 401 || expiryValidation !== validation || suppressed) return;
      if (await validation.getToken() !== token) return;
      notifyAuthExpired(token);
    } catch {
      // Offline, timeout and server failure never erase a valid local session.
    } finally {
      clearTimeout(timer);
    }
  })();
  pendingValidations.set(token, work);
  try { await work; } finally {
    if (pendingValidations.get(token) === work) pendingValidations.delete(token);
  }
}

// Таймаут по умолчанию для внутрисессионного трафика. Без него «висящее»
// соединение (медленная сеть / сервер не отвечает) приводило к тому, что
// fetch не резолвился НИКОГДА → экран («Мои грузы» и т.п.) застревал на
// спиннере навсегда, т.к. setLoading(false) в finally не выполнялся.
// AbortController прерывает запрос → fetch реджектится → вызывающий код
// (везде обёрнут в try/catch) показывает empty/serverError, а не висит.
const DEFAULT_TIMEOUT_MS = 20000;

// Drop-in замена fetch: идентичное поведение + сайд-эффект на 401 + таймаут.
// Multipart callers may inject expo/fetch, which understands ExpoFile blobs;
// ordinary JSON traffic keeps the global fetch transport by default.
// Возвращает тот же Response, чтобы вызывающий код не менялся.
export async function authedFetch(input, init, fetchImpl = fetch) {
  // Если вызывающий уже передал свой signal — не перетираем его.
  if (init && init.signal) {
    const r = await fetchImpl(input, init);
    if (r && r.status === 401) await confirmAuthExpired(requestBearer(input, init));
    return r;
  }
  let controller;
  let timer;
  try { controller = new AbortController(); } catch { controller = null; }
  if (controller) {
    timer = setTimeout(() => { try { controller.abort(); } catch {} }, DEFAULT_TIMEOUT_MS);
  }
  try {
    const r = await fetchImpl(input, controller ? { ...(init || {}), signal: controller.signal } : init);
    if (r && r.status === 401) await confirmAuthExpired(requestBearer(input, init));
    return r;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
