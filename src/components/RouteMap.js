import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { localizePlace } from '../utils/places';
import { marketAPI } from '../utils/marketAPI';
import TruckMap from './TruckMap';

// Координаты основных городов [lat, lon]
const CITIES = {
  // Казахстан
  'Алматы': [43.2220, 76.8512], 'Almaty': [43.2220, 76.8512],
  'Астана': [51.1694, 71.4491], 'Astana': [51.1694, 71.4491], 'Нур-Султан': [51.1694, 71.4491],
  'Шымкент': [42.3417, 69.5901], 'Караганда': [49.8047, 73.1094],
  'Актобе': [50.2839, 57.1660], 'Атырау': [47.0945, 51.9238],
  'Усть-Каменогорск': [49.9787, 82.6086], 'Павлодар': [52.2871, 76.9669],
  'Семей': [50.4111, 80.2275], 'Тараз': [42.9000, 71.3667],
  'Костанай': [53.2189, 63.6356], 'Кызылорда': [44.8488, 65.4823],
  'Уральск': [51.2333, 51.3667], 'Актау': [43.6500, 51.1800],
  'Петропавловск': [54.8650, 69.1500], 'Кокшетау': [53.2833, 69.3833],
  // Пограничные переходы КЗ↔КНР (обе стороны — для построения маршрута)
  'Хоргос': [44.2113, 80.4137], 'Нур Жолы': [44.2113, 80.4137], 'Нур жолы': [44.2113, 80.4137],
  'Достык': [45.2553, 82.4820], 'Алашанькоу': [45.1717, 82.5686],
  'Майкапчагай': [47.4300, 85.5600], 'Зимунай': [47.4300, 85.7900], 'Джеминай': [47.4300, 85.7900],
  'Бахты': [46.7500, 82.7000], 'Тачэн': [46.7500, 82.9800],
  // Россия
  'Москва': [55.7558, 37.6176], 'Moscow': [55.7558, 37.6176],
  'Санкт-Петербург': [59.9311, 30.3609], 'СПб': [59.9311, 30.3609],
  'Новосибирск': [55.0084, 82.9357], 'Екатеринбург': [56.8431, 60.6454],
  'Казань': [55.8304, 49.0661], 'Нижний Новгород': [56.2965, 43.9361],
  'Челябинск': [55.1644, 61.4368], 'Самара': [53.2415, 50.2212],
  'Омск': [54.9885, 73.3242], 'Уфа': [54.7388, 55.9721],
  'Красноярск': [56.0153, 92.8932], 'Воронеж': [51.6720, 39.1843],
  'Волгоград': [48.7194, 44.5018], 'Ростов-на-Дону': [47.2357, 39.7015],
  'Краснодар': [45.0355, 38.9753], 'Иркутск': [52.2864, 104.2807],
  'Владивосток': [43.1198, 131.8869], 'Хабаровск': [48.4827, 135.0838],
  // Китай
  'Иу': [29.3079, 120.0762], 'Yiwu': [29.3079, 120.0762],
  'Гуанчжоу': [23.1291, 113.2644], 'Guangzhou': [23.1291, 113.2644],
  'Шэньчжэнь': [22.5431, 114.0579], 'Shenzhen': [22.5431, 114.0579],
  'Пекин': [39.9042, 116.4074], 'Beijing': [39.9042, 116.4074],
  'Шанхай': [31.2304, 121.4737], 'Ханчжоу': [30.2741, 120.1551],
  'Урумчи': [43.8256, 87.6168], 'Циндао': [36.0671, 120.3826],
  'Чэнду': [30.5728, 104.0668], 'Чунцин': [29.4316, 106.9123],
  'Тяньцзинь': [39.3434, 117.3616],
  // Узбекистан
  'Ташкент': [41.2995, 69.2401], 'Tashkent': [41.2995, 69.2401],
  'Самарканд': [39.6542, 66.9597], 'Бухара': [39.7747, 64.4286],
  'Андижан': [40.7821, 72.3442], 'Наманган': [40.9983, 71.6726],
  'Фергана': [40.3842, 71.7843], 'Нукус': [42.4531, 59.6103],
  // Кыргызстан
  'Бишкек': [42.8746, 74.5698], 'Bishkek': [42.8746, 74.5698],
  'Ош': [40.5283, 72.7985], 'Каракол': [42.4905, 78.3937],
  // Таджикистан, Туркменистан
  'Душанбе': [38.5598, 68.7870], 'Худжанд': [40.2828, 69.6219],
  'Ашхабад': [37.9601, 58.3261],
  // Грузия, Армения, Азербайджан
  'Тбилиси': [41.7151, 44.8271], 'Батуми': [41.6168, 41.6367],
  'Ереван': [40.1792, 44.4991], 'Баку': [40.4093, 49.8671],
  // Беларусь
  'Минск': [53.9006, 27.5590], 'Брест': [52.0975, 23.7340],
  // Турция
  'Стамбул': [41.0082, 28.9784], 'Анкара': [39.9334, 32.8597],
  'Измир': [38.4192, 27.1287],
  // Германия, Польша
  'Гамбург': [53.5511, 9.9937], 'Hamburg': [53.5511, 9.9937],
  'Берлин': [52.5200, 13.4050], 'Мюнхен': [48.1351, 11.5820],
  'Франкфурт': [50.1109, 8.6821], 'Варшава': [52.2297, 21.0122],
  'Гданьск': [54.3520, 18.6466],
  // ОАЭ
  'Дубай': [25.2048, 55.2708],
};

// Чистим строку от флагов/эмодзи/📍 и хвоста ", страна" → голое имя города.
const EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;
const cleanName = (str) => String(str || '')
  .split(',')[0]                     // отбрасываем ", KZ" / ", 🇰🇿"
  .replace(EMOJI_RE, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Кандидаты для поиска координат: полное имя + части составного названия
// перехода ("Нур Жолы ↔ Хоргос" → ["...", "Нур Жолы", "Хоргос"];
// "Алашанькоу-сухой порт" → ["...", "Алашанькоу", "сухой порт"]).
const cityTokens = (str) => {
  const base = cleanName(str);
  if (!base) return [];
  const parts = base.split(/[↔—–/-]/).map((x) => x.trim()).filter(Boolean);
  return [base, ...parts];
};

const parseCity = (str) => {
  for (const tok of cityTokens(str)) {
    if (CITIES[tok]) return CITIES[tok];
  }
  return null;
};

// Расстояние по прямой (Haversine, км) — та же формула, что и в utils/geo.js
// (два независимых справочника городов, RouteMap.js исторически шире).
const haversine = (a, b) => {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
};

// RouteMap — единая карточка маршрута внутри UrTruck. До старта она показывает
// план; после «Начать» сама подтягивает защищённую точку сделки и заменяет план
// живой картой. Пользователь не уходит в Яндекс/Google Maps.
export default function RouteMap({ from, to, transit, dealId, dealStatus, driverName }) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const [location, setLocation] = React.useState(null);
  const [locationLoading, setLocationLoading] = React.useState(false);
  const fromCoord = parseCity(from);
  const toCoord = parseCity(to);
  const transitCoord = transit ? parseCity(transit) : null;
  const trackingActive = Boolean(dealId && ['in_progress', 'at_border', 'delivered'].includes(dealStatus));

  React.useEffect(() => {
    if (!trackingActive) {
      setLocation(null);
      setLocationLoading(false);
      return undefined;
    }
    let alive = true;
    const load = async () => {
      setLocationLoading((current) => current || !location);
      const result = await marketAPI.getDealLocation(dealId);
      if (!alive) return;
      if (result?.has_location && result.location) setLocation(result.location);
      setLocationLoading(false);
    };
    load();
    const interval = setInterval(load, 10000);
    return () => { alive = false; clearInterval(interval); };
  }, [dealId, trackingActive]);

  let km = null, days = null;
  if (fromCoord && toCoord) {
    km = transitCoord
      ? haversine(fromCoord, transitCoord) + haversine(transitCoord, toCoord)
      : haversine(fromCoord, toCoord);
    // Маршрут по дороге обычно на 25% длиннее по прямой; ~600 км/день с
    // учётом отдыха и границ — та же прикидка, что и в utils/geo.js.
    km = Math.round(km * 1.25);
    days = Math.ceil(km / 600);
  }

  const lat = location ? Number(location.lat) : null;
  const lng = location ? Number(location.lng) : null;
  const hasLivePoint = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]} testID="planned-route-card">
      <View style={s.headerRow}>
        <Feather name="map" size={14} color={theme.textMuted} />
        <Text style={[s.title, { color: theme.textMuted }]}>{t(hasLivePoint ? 'live_route_title' : 'planned_route_title')}</Text>
      </View>
      <Text style={[s.route, { color: theme.text }]} numberOfLines={2}>
        {localizePlace(from, lang)}
        {transit ? `  ·  ${t('trip_via')} ${localizePlace(transit, lang)}` : ''}
        {'  →  '}
        {localizePlace(to, lang)}
      </Text>
      {km != null ? (
        <Text style={[s.stats, { color: theme.textMuted }]}>
          📏 ~{km} {t('km_short')}   ⏱ ~{days} {t('days_short')}
        </Text>
      ) : null}
      {hasLivePoint ? (
        <View style={s.liveMap} testID="trip-live-map">
          <TruckMap lat={lat} lng={lng} title={driverName || t('track_truck_marker')} />
        </View>
      ) : locationLoading ? (
        <View style={s.waitingMap} testID="trip-live-map-loading">
          <ActivityIndicator color="#168759" />
          <Text style={[s.waitingText, { color: theme.textMuted }]}>{t('track_truck_waiting')}</Text>
        </View>
      ) : (
        <View style={[s.plannedMap, { backgroundColor: theme.bg }]} testID="trip-planned-map">
          <View style={s.planLine} />
          <View style={[s.planDot, s.planStart]} />
          <View style={[s.planDot, s.planEnd]} />
          <Feather name="truck" size={25} color="#0F6B47" />
        </View>
      )}
      <View style={s.disclaimerRow}>
        <Feather name={trackingActive ? 'navigation' : 'map-pin'} size={11} color={theme.textDim} />
        <Text style={[s.disclaimer, { color: theme.textDim }]} numberOfLines={2}>
          {hasLivePoint ? t('tracking_live_here') : trackingActive ? t('track_truck_waiting_desc') : t('tracking_starts_after_start')}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  route: { fontSize: 14, fontWeight: '700' },
  stats: { fontSize: 12, fontWeight: '600' },
  liveMap: { height: 240, borderRadius: 12, overflow: 'hidden' },
  waitingMap: { height: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  waitingText: { fontSize: 12, fontWeight: '700' },
  plannedMap: { height: 150, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  planLine: { position: 'absolute', width: '72%', height: 5, borderRadius: 3, backgroundColor: '#168759', transform: [{ rotate: '-12deg' }] },
  planDot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFFFFF', borderWidth: 4 },
  planStart: { left: '12%', bottom: '28%', borderColor: '#EF4444' },
  planEnd: { right: '12%', top: '28%', borderColor: '#168759' },
  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 2 },
  disclaimer: { fontSize: 11, flex: 1, flexShrink: 1 },
});
