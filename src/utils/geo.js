// Координаты городов (синхронизировано с RouteMap)
export const CITIES = {
  'Алматы': [43.2220, 76.8512], 'Almaty': [43.2220, 76.8512],
  'Астана': [51.1694, 71.4491], 'Astana': [51.1694, 71.4491], 'Нур-Султан': [51.1694, 71.4491],
  'Шымкент': [42.3417, 69.5901], 'Караганда': [49.8047, 73.1094],
  'Актобе': [50.2839, 57.1660], 'Атырау': [47.0945, 51.9238],
  'Усть-Каменогорск': [49.9787, 82.6086], 'Павлодар': [52.2871, 76.9669],
  'Семей': [50.4111, 80.2275], 'Тараз': [42.9000, 71.3667],
  'Костанай': [53.2189, 63.6356], 'Кызылорда': [44.8488, 65.4823],
  'Уральск': [51.2333, 51.3667], 'Актау': [43.6500, 51.1800],
  'Хоргос': [44.2113, 80.4137], 'Достык': [45.2333, 82.6500],
  'Алашанькоу': [45.1700, 82.5700], 'Alashankou': [45.1700, 82.5700],
  'Калжат': [43.3840, 80.7770], 'Kalzhat': [43.3840, 80.7770],
  'Дулаты': [43.7330, 80.8200], 'Dulaty': [43.7330, 80.8200],
  'Майкапчагай': [47.9670, 85.6160], 'Maykapshagay': [47.9670, 85.6160],
  'Зимунай': [47.4430, 85.8740], 'Jeminay': [47.4430, 85.8740],
  // Казахстан ↔ Китай, восточный коридор. Для Бахты используем точную
  // координату автомобильного КПП на дороге, а не приблизительный центр села:
  // это позволяет Yandex Router привязать маршрут к дорожной сети.
  'Бахты': [46.679365, 82.776816], 'Bakhty': [46.679365, 82.776816],
  'Чугучак': [46.739131, 82.983797], 'Chuguchak': [46.739131, 82.983797],
  'Тачэн': [46.739131, 82.983797], 'Tacheng': [46.739131, 82.983797],
  'Москва': [55.7558, 37.6176], 'Moscow': [55.7558, 37.6176],
  'Санкт-Петербург': [59.9311, 30.3609], 'СПб': [59.9311, 30.3609],
  'Новосибирск': [55.0084, 82.9357], 'Екатеринбург': [56.8431, 60.6454],
  'Казань': [55.8304, 49.0661], 'Самара': [53.2415, 50.2212],
  'Омск': [54.9885, 73.3242], 'Уфа': [54.7388, 55.9721],
  'Краснодар': [45.0355, 38.9753], 'Иркутск': [52.2864, 104.2807],
  'Иу': [29.3079, 120.0762], 'Yiwu': [29.3079, 120.0762],
  'Гуанчжоу': [23.1291, 113.2644], 'Шэньчжэнь': [22.5431, 114.0579],
  'Пекин': [39.9042, 116.4074], 'Шанхай': [31.2304, 121.4737],
  'Ханчжоу': [30.2741, 120.1551], 'Урумчи': [43.8256, 87.6168],
  'Ташкент': [41.2995, 69.2401], 'Самарканд': [39.6542, 66.9597],
  'Бухара': [39.7747, 64.4286], 'Андижан': [40.7821, 72.3442],
  'Бишкек': [42.8746, 74.5698], 'Ош': [40.5283, 72.7985],
  'Душанбе': [38.5598, 68.7870], 'Худжанд': [40.2828, 69.6219],
  'Ашхабад': [37.9601, 58.3261], 'Тбилиси': [41.7151, 44.8271],
  'Ереван': [40.1792, 44.4991], 'Баку': [40.4093, 49.8671],
  'Минск': [53.9006, 27.5590], 'Стамбул': [41.0082, 28.9784],
  'Гамбург': [53.5511, 9.9937], 'Берлин': [52.5200, 13.4050],
  'Варшава': [52.2297, 21.0122], 'Дубай': [25.2048, 55.2708],
};

const cleanRouteToken = (value) => String(value || '')
  .split(',')[0]
  .replace(/[📍🚩]/g, '')
  .trim();

const BAKHTY_NAMES = new Set(['Бахты', 'Bakhty']);
const TACHENG_NAMES = new Set(['Чугучак', 'Chuguchak', 'Тачэн', 'Tacheng']);

const isBakhtyTachengBorderPair = (tokens, raw) => (
  String(raw || '').includes('↔')
  && tokens.some((name) => BAKHTY_NAMES.has(name))
  && tokens.some((name) => TACHENG_NAMES.has(name))
);

// Парсит как простое название («Москва, 🇷🇺»), так и составной узел
// («Бахты ↔ Чугучак»). Для одиночного результата берём первую известную точку.
export const parseCity = (str) => {
  if (!str) return null;
  const tokens = String(str)
    .split(/[↔→—–]/)
    .map(cleanRouteToken)
    .filter(Boolean);
  for (const name of tokens) {
    if (CITIES[name]) return CITIES[name];
  }
  const name = cleanRouteToken(str);
  return CITIES[name] || null;
};

// Возвращает известные дорожные точки из строки маршрута в порядке следования.
// Важное исключение: «Бахты ↔ Чугучак» — это один погранпереход, а не две
// последовательные остановки. Если передать обе точки в Yandex MultiRoute,
// весь международный запрос может упасть и карта рисует прямую fallback-линию.
// Для дорожной части UrTruck используем казахстанский автомобильный КПП Бахты;
// сам Чугучак остаётся в названии маршрута/КПП, но не ломает road routing.
export const parseRouteCities = (str) => {
  if (!str) return [];
  const raw = String(str);
  const tokens = raw.split(/[↔→—–]/).map(cleanRouteToken).filter(Boolean);

  if (isBakhtyTachengBorderPair(tokens, raw)) {
    return [CITIES['Бахты']];
  }

  const seen = new Set();
  const out = [];
  for (const token of tokens) {
    const coord = CITIES[token];
    if (!coord) continue;
    const key = coord.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(coord);
  }
  return out;
};

// Расстояние по формуле Haversine (км по большому кругу)
export const distance = (a, b) => {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
};

// Расчёт расстояния и примерного времени для маршрута
// Дальнобой: ~600 км/день (учёт отдыха, границ)
export const routeStats = (fromStr, toStr, transitStr) => {
  const from = parseCity(fromStr);
  const to = parseCity(toStr);
  if (!from || !to) return null;
  let km = distance(from, to);
  if (transitStr) {
    const tr = parseCity(transitStr);
    if (tr) km = distance(from, tr) + distance(tr, to);
  }
  // Маршрут по дороге обычно на 25% длиннее по прямой
  km = Math.round(km * 1.25);
  const days = Math.ceil(km / 600);
  return { km, days };
};

// Геозоны: проверка близости (для авто-статусов)
// borderCities — массив координат границ
export const BORDER_CITIES = {
  'Хоргос': [44.2113, 80.4137],
  'Достык': [45.2333, 82.6500],
  'Бахты': [46.679365, 82.776816],
};

export const isNearBorder = (lat, lon, radiusKm = 5) => {
  for (const [name, coord] of Object.entries(BORDER_CITIES)) {
    if (distance([lat, lon], coord) < radiusKm) return name;
  }
  return null;
};

// Линейная интерполяция между двумя точками (для симуляции движения)
export const interpolate = (from, to, progress) => {
  if (!from || !to) return null;
  return [
    from[0] + (to[0] - from[0]) * progress,
    from[1] + (to[1] - from[1]) * progress,
  ];
};
