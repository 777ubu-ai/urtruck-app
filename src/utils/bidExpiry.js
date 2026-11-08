export const BID_TTL_MS = 48 * 60 * 60 * 1000;

const OPEN_BID_STATUSES = new Set(['pending', 'countered']);

export const parseBidServerDate = (raw) => {
  if (!raw) return null;
  const normalized = String(raw).replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const bidExpiryAt = (bid) => {
  if (!bid) return null;
  const activity = parseBidServerDate(bid.updated_at || bid.created_at);
  if (!activity) return null;
  return new Date(activity.getTime() + BID_TTL_MS);
};

export const isBidFresh = (bid, now = Date.now()) => {
  if (!bid || !OPEN_BID_STATUSES.has(bid.status)) return false;
  const expiresAt = bidExpiryAt(bid);
  return !expiresAt || expiresAt.getTime() > Number(now);
};

const leftCopy = (lang, days, hours, minutes) => {
  if (lang === 'ZH') {
    if (days > 0) return `剩余${days}天${hours}小时`;
    if (hours > 0) return `剩余${hours}小时`;
    return `剩余${minutes}分钟`;
  }
  if (lang === 'EN') {
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h left`;
    return `${minutes}m left`;
  }
  if (lang === 'KK') {
    if (days > 0) return `${days} күн ${hours} сағ қалды`;
    if (hours > 0) return `${hours} сағ қалды`;
    return `${minutes} мин қалды`;
  }
  if (days > 0) return `Осталось ${days} д ${hours} ч`;
  if (hours > 0) return `Осталось ${hours} ч`;
  return `Осталось ${minutes} мин`;
};

export const formatBidRemaining = (bid, lang = 'RU', now = Date.now()) => {
  const expiresAt = bidExpiryAt(bid);
  if (!expiresAt) return '';
  const remainingMs = expiresAt.getTime() - Number(now);
  if (remainingMs <= 0) return '';

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return leftCopy(lang, days, hours, minutes);
};
