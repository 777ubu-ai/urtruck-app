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

// Отдельный тип карточки: не объявление о свободной машине.
const CARRIER_COPY = {
  RU: { title: 'Контакт перевозчика', availability: 'Наличие свободной машины уточняйте', view: 'Перевозчики в UrTruck' },
  KK: { title: 'Тасымалдаушы байланысы', availability: 'Бос көлік бар-жоғын нақтылаңыз', view: 'UrTruck тасымалдаушылары' },
  ZH: { title: '承运商联系方式', availability: '请确认是否有空车', view: 'UrTruck 承运商' },
  EN: { title: 'Carrier contact', availability: 'Confirm truck availability', view: 'Carriers in UrTruck' },
};

export function buildCarrierContactShare(item, { origin, lang = 'RU' } = {}) {
  if (item?.kind !== 'carrier_contact' || item.status !== 'active') return null;
  const base = String(origin || '').replace(/\/+$/, '');
  if (!/^https:\/\/(?:urtruck\.kz|qa2\.urtruck\.kz)$/.test(base)) return null;
  const copy = CARRIER_COPY[lang] || CARRIER_COPY.EN;
  const url = `${base}/`;
  // Только поля, уже разрешённые к отображению. Телефоны/личные поля не экспортируем.
  const text = ['UrTruck · ' + copy.title, line(item.name),
    [line(item.city), line(item.country), line(item.transport_type)].filter(Boolean).join(' · '),
    copy.availability, `${copy.view}: ${url}`].filter(Boolean).join('\n');
  return { url, text };
}
