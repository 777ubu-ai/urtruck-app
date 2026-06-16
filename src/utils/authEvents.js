// Tiny pub/sub for "session token expired" (HTTP 401 on authenticated traffic).
//
// QA-аудит P1-6: раньше истёкший/отозванный токен (TTL 30 дней, либо
// серверный revoke) в фичевых эндпоинтах выглядел как generic-ошибка —
// пользователь застревал с «серверной ошибкой» вместо выхода на login.
//
// Дизайн (безопасный, без цикла разлогина):
//   - authedFetch оборачивает обычный fetch и ТОЛЬКО при status===401
//     дёргает notifyAuthExpired() — поведение запроса не меняется.
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
const COOLDOWN_MS = 4000;

export function subscribeAuthExpired(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Заглушить уведомления (вызывается на время signOut + короткий хвост).
export function setAuthExpirySuppressed(value) {
  suppressed = !!value;
}

export function notifyAuthExpired() {
  if (suppressed) return;
  const now = Date.now();
  if (now - lastFireAt < COOLDOWN_MS) return;
  lastFireAt = now;
  for (const cb of listeners) {
    try { cb(); } catch {}
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
// Возвращает тот же Response, чтобы вызывающий код не менялся.
export async function authedFetch(input, init) {
  // Если вызывающий уже передал свой signal — не перетираем его.
  if (init && init.signal) {
    const r = await fetch(input, init);
    if (r && r.status === 401) notifyAuthExpired();
    return r;
  }
  let controller;
  let timer;
  try { controller = new AbortController(); } catch { controller = null; }
  if (controller) {
    timer = setTimeout(() => { try { controller.abort(); } catch {} }, DEFAULT_TIMEOUT_MS);
  }
  try {
    const r = await fetch(input, controller ? { ...(init || {}), signal: controller.signal } : init);
    if (r && r.status === 401) notifyAuthExpired();
    return r;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
