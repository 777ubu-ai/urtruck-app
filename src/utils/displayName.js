// Shared display-name hygiene. Technical partner IDs must never leak into a
// user-facing profile, chat, or fixture; keep the legacy exports intact.
const TECH_NAME_PATTERNS = [
  /^guest_/i, /^agent-/i, /^test[_-]?/i, /^mock[_-]?/i, /^qa[_-]?/i,
  /^anonymous[_-]?/i, /^system[_-]?/i, /^user[_-]?/i, /^d\d+$/i,
  /^c_\d+$/, /^u_\d+$/, /\[ar-[a-z0-9]+\]/i, /^Bid\s+Serik/i,
  /currency-regression/i, /Direct\s+probe/i,
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const isTechnical = (value) => {
  if (!value || typeof value !== 'string') return true;
  const normalized = value.trim();
  return !normalized || UUID_RE.test(normalized) || TECH_NAME_PATTERNS.some((re) => re.test(normalized));
};

export const isTechnicalDisplayName = (value) => {
  return isTechnical(value);
};

export const sanitizeDisplayName = (value, fallback = '') => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return isTechnicalDisplayName(normalized) ? fallback : normalized;
};

export const prettifyPartnerName = (name, id, t) => {
  if (name && !isTechnical(name)) return String(name).trim();
  return (t && t('chat_partner_fallback')) || 'Собеседник';
};

export const partnerInitial = (name) => {
  if (!name || isTechnical(name)) return '?';
  return String(name).trim().charAt(0).toUpperCase() || '?';
};

export const isTechnicalName = isTechnical;

export default sanitizeDisplayName;
