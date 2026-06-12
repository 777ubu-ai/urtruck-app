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

// Drop-in замена fetch: идентичное поведение + сайд-эффект на 401.
// Возвращает тот же Response, чтобы вызывающий код не менялся.
export async function authedFetch(input, init) {
  const r = await fetch(input, init);
  if (r && r.status === 401) notifyAuthExpired();
  return r;
}
