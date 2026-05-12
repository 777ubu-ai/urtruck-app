// displayName — превращает technical partner_id / partner_name в человеческое
// имя для UI. До этого фикса (см. PR Design-System Phase 1) ChatsListScreen
// показывал в карточке диалога вещи вроде «guest_5af3...», «d3», «d4»,
// «agent-boris», «Bid Serik [ar-...]» — это сразу выдавало сырой продукт.
//
// Логика prettify:
//   1. Если name содержит технические префиксы / маркеры → подменяем на
//      переводимый fallback "Собеседник" (i18n.chat_partner_fallback).
//   2. Если name пустое и есть только partner_id → не показываем id (он
//      технический), а возвращаем тот же fallback.
//   3. Иначе — возвращаем name как есть.

const TECH_NAME_PATTERNS = [
  /^guest_/i,
  /^agent-/i,
  /^test[_-]?/i,
  /^mock[_-]?/i,
  /^qa[_-]?/i,
  /^d\d+$/i,                  // d3, d4, d12 — старые dev IDs
  /^c_\d+$/,                  // c_<timestamp> — autoreg
  /^u_\d+$/,                  // u_<timestamp> — autoreg
  /\[ar-[a-z0-9]+\]/i,        // QA marker "[ar-XXX]"
  /^Bid\s+Serik/i,            // тестовый агент
  /currency-regression/i,
  /Direct\s+probe/i,
];

const isTechnical = (s) => {
  if (!s || typeof s !== 'string') return true;
  const v = s.trim();
  if (!v) return true;
  return TECH_NAME_PATTERNS.some((re) => re.test(v));
};

export const prettifyPartnerName = (name, id, t) => {
  // 1) Имя задано и не тех. — отдаём как есть.
  if (name && !isTechnical(name)) return String(name).trim();
  // 2) Имя задано, но тех. → fallback.
  // 3) Имя пусто — fallback (никогда не показываем partner_id в UI).
  return (t && t('chat_partner_fallback')) || 'Собеседник';
};

// Используется в ChatScreen.js (partner_avatar initial). Если имя
// технического вида — возвращаем "?" вместо первой буквы "g" из "guest_".
export const partnerInitial = (name) => {
  if (!name || isTechnical(name)) return '?';
  const c = String(name).trim().charAt(0);
  return c ? c.toUpperCase() : '?';
};

export const isTechnicalName = isTechnical;
