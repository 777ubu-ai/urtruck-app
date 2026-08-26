// Bid expiration — frontend UI contract (26.08.2026).
//
// Backend covered by backend/tests/test_bid_expiration.py. Здесь фиксируем
// именно UI-контракт, чтобы будущий refactor не удалил случайно ⏰-плашку
// или TTL-индикатор:
//   * BargainCard знает о 'expired' статусе, показывает плашку без чипов,
//     а также TTL-строку для живых pending/countered.
//   * CargoDetail отдельно рендерит expired-ветку в bids-списке (⏰
//     Истекло) и включает 'expired' в myPendingBid lookup.
//   * i18n: все 4 языка имеют bid_expired + bid_expires_in_* ключи.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bargain = fs.readFileSync('src/components/deal/BargainCard.js', 'utf8');
const cargoDetail = fs.readFileSync('src/screens/CargoDetail.js', 'utf8');
const i18n = fs.readFileSync('src/utils/i18n.js', 'utf8');

test('BargainCard treats "expired" as a visible bid state, not just pending/countered', () => {
  // Раньше active-lookup был жёстко pending|countered — expired бесшумно
  // выпадал из карточки. Теперь список видимых состояний включает expired.
  assert.match(bargain, /VISIBLE = new Set\(\['pending', 'countered', 'expired'\]\)/);
  assert.match(bargain, /pickActive = \(arr\) =>/);
  assert.match(bargain, /const isExpired = bid\.status === 'expired'/);
});

test('BargainCard shows an explicit ⏰ + t(bid_expired) status label for expired bids', () => {
  assert.match(bargain, /isExpired \? t\('bid_expired'\)/);
  assert.match(bargain, /isExpired \? '⏰ ' : ''/);
});

test('BargainCard hides ALL action chips (accept/counter/reject) when the bid is expired', () => {
  // Единственный правильный способ: обернуть всю chips-ветку условием
  // {isExpired ? null : (<>...</>)}. Иначе accept всё ещё будет виден
  // и на нажатие получит backend 409 — плохой UX и лишний спам.
  assert.match(bargain, /\{isExpired \? null : \(/);
});

test('BargainCard renders a TTL countdown for live bids (urgent < 1h / warn 1-3h / muted otherwise)', () => {
  assert.match(bargain, /if \(!isExpired && bid\.expires_at\)/);
  assert.match(bargain, /ttlUrgent = leftMs < 60 \* 60 \* 1000/);
  assert.match(bargain, /ttlWarn = !ttlUrgent && leftMs < 3 \* 60 \* 60 \* 1000/);
  assert.match(bargain, /testID="bargain-ttl"/);
  // TTL строка использует новые i18n ключи, не hardcoded «истекает через …».
  assert.match(bargain, /t\('bid_expires_in_h_m'\)/);
  assert.match(bargain, /t\('bid_expires_in_m'\)/);
});

test('BargainCard applies a dedicated visual style to the expired card (dimmed, strikethrough amount)', () => {
  assert.match(bargain, /wrapExpired: \{ borderColor: v1\.border, opacity: 0\.7 \}/);
  assert.match(bargain, /amountExpired: \{ color: v1\.textMuted, textDecorationLine: 'line-through' \}/);
});

test('CargoDetail renders an expired bid with muted opacity and a "⏰ Истекло" label instead of the "Принять" CTA', () => {
  assert.match(cargoDetail, /const isExpired = b\.status === 'expired'/);
  // Дизайн: expired получает ту же приглушённую opacity, что cancelled/
  // rejected, а не остаётся ярким.
  assert.match(cargoDetail, /opacity: \(b\.status === 'rejected' \|\| isCancelled \|\| isExpired\) \? 0\.55 : 1/);
  // «⏰ Истекло» через i18n.
  assert.match(cargoDetail, /isExpired \? '⏰ ' \+ t\('bid_expired'\)/);
});

test('CargoDetail includes expired in myPendingBid so the driver sees the reason his bid disappeared', () => {
  assert.match(cargoDetail, /b\.status === 'pending' \|\| b\.status === 'countered' \|\| b\.status === 'expired'/);
  assert.match(cargoDetail, /case 'expired':\s*return t\('bid_expired'\)/);
});

test('i18n: bid_expired exists in ALL four locales (ru, kk, zh, en) — no missing translation', () => {
  // Каждая локаль должна нести ключ ровно один раз (regex глобальный, но
  // важно наличие всех четырёх — считаем совпадения).
  const matches = i18n.match(/bid_expired:/g) || [];
  assert.equal(matches.length, 4, `expected 4 bid_expired entries, got ${matches.length}`);
  // Проверяем конкретные переводы, чтобы случайный copy-paste (все на RU)
  // ловился.
  assert.match(i18n, /bid_expired: 'Истекло'/);
  assert.match(i18n, /bid_expired: 'Мерзімі өтті'/);
  assert.match(i18n, /bid_expired: '已过期'/);
  assert.match(i18n, /bid_expired: 'Expired'/);
});

test('i18n: TTL countdown strings exist in ALL four locales', () => {
  const m1 = (i18n.match(/bid_expires_in_h_m:/g) || []).length;
  const m2 = (i18n.match(/bid_expires_in_m:/g) || []).length;
  assert.equal(m1, 4, `expected 4 bid_expires_in_h_m, got ${m1}`);
  assert.equal(m2, 4, `expected 4 bid_expires_in_m, got ${m2}`);
});
