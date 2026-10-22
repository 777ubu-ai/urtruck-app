// Только видимые краткие данные. Исходный текст и контакты не экспортируются.
const COPY = {
  RU: { cargo: 'Груз', vehicle: 'Машина', view: 'Грузы и машины в UrTruck' },
  KK: { cargo: 'Жүк', vehicle: 'Көлік', view: 'UrTruck: жүктер мен көліктер' },
  ZH: { cargo: '货物', vehicle: '车辆', view: 'UrTruck：货源与车辆' },
  EN: { cargo: 'Cargo', vehicle: 'Truck', view: 'Cargo and trucks in UrTruck' },
};
const line = value => String(value ?? '').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 360);

export function buildExternalFreightShare(item, { origin, lang = 'RU', summary = '', price = '', now = Date.now() } = {}) {
  if (!item || item.status !== 'active' || !['cargo', 'vehicle'].includes(item.kind)) return null;
  if (item.expires_at && !(Date.parse(item.expires_at) > now)) return null;
  const base = String(origin || '').replace(/\/+$/, '');
  if (!/^https:\/\/(?:urtruck\.kz|qa2\.urtruck\.kz)$/.test(base)) return null;
  const copy = COPY[lang] || COPY.EN;
  // Отдельной публичной страницы внешней заявки пока нет. Ссылка честно
  // подписана как вход в UrTruck, а не как ссылка на конкретную карточку.
  const url = `${base}/`;
  const text = [
    `UrTruck · ${copy[item.kind]}`,
    [line(item.origin), line(item.destination)].filter(Boolean).join(' → '),
    line(summary), line(price),
    `${copy.view}: ${url}`,
  ].filter(Boolean).join('\n');
  return { url, text };
}
