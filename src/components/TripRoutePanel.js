import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Location from 'expo-location';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { localizePlace } from '../utils/places';
import { parseRouteCities } from '../utils/geo';
import { routingAPI } from '../utils/routingAPI';
import { fetchRates } from '../utils/exchangeRates';

const COPY = {
  RU: {
    tools: 'Полезное в пути', route: 'Маршрут', distance: 'Расстояние',
    duration: 'Время в пути', rates: 'Курсы', weather: 'Погода',
    border: 'Граница', gps: 'GPS сделки', loading: 'Рассчитываем маршрут…',
    unavailable: 'Расчёт маршрута временно недоступен', retry: 'Повторить',
    weatherUnavailable: 'Нет данных', ratesUnavailable: 'Нет данных', cached: 'кэш', gpsPending: 'После начала рейса',
  },
  EN: {
    tools: 'On-road tools', route: 'Route', distance: 'Distance',
    duration: 'Travel time', rates: 'Rates', weather: 'Weather',
    border: 'Border', gps: 'Deal GPS', loading: 'Calculating route…',
    unavailable: 'Route calculation is temporarily unavailable', retry: 'Retry',
    weatherUnavailable: 'No data', ratesUnavailable: 'No data', cached: 'cached', gpsPending: 'After trip start',
  },
  KK: {
    tools: 'Жолдағы пайдалы ақпарат', route: 'Бағыт', distance: 'Қашықтық',
    duration: 'Жол уақыты', rates: 'Бағамдар', weather: 'Ауа райы',
    border: 'Шекара', gps: 'Мәміле GPS', loading: 'Бағыт есептелуде…',
    unavailable: 'Бағытты есептеу уақытша қолжетімсіз', retry: 'Қайталау',
    weatherUnavailable: 'Дерек жоқ', ratesUnavailable: 'Дерек жоқ', cached: 'кэш', gpsPending: 'Рейс басталғаннан кейін',
  },
  ZH: {
    tools: '行程工具', route: '路线', distance: '距离',
    duration: '预计时间', rates: '汇率', weather: '天气',
    border: '口岸', gps: '订单定位', loading: '正在计算路线…',
    unavailable: '暂时无法计算路线', retry: '重试',
    weatherUnavailable: '暂无数据', ratesUnavailable: '暂无数据', cached: '缓存', gpsPending: '行程开始后可用',
  },
};

const dedupePoints = (points) => {
  const seen = new Set();
  return points.filter((point) => {
    if (!Array.isArray(point) || point.length < 2) return false;
    const key = `${point[0]}:${point[1]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const formatDistance = (meters, lang) => {
  const value = Number(meters);
  if (!Number.isFinite(value) || value < 0) return null;
  const km = value / 1000;
  const rounded = km >= 100 ? Math.round(km) : Math.round(km * 10) / 10;
  const text = String(rounded).replace('.', lang === 'EN' ? '.' : ',');
  return `${text} ${lang === 'ZH' ? '公里' : 'км'}`;
};

const formatDuration = (seconds, lang) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  const minutes = Math.max(1, Math.round(value / 60));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (lang === 'ZH') return days ? `${days}天 ${hours}小时` : hours ? `${hours}小时 ${mins}分` : `${mins}分`;
  if (lang === 'EN') return days ? `${days} d ${hours} h` : hours ? `${hours} h ${mins} min` : `${mins} min`;
  return days ? `${days} д. ${hours} ч.` : hours ? `${hours} ч. ${mins} мин.` : `${mins} мин.`;
};

const WEATHER_LABELS = {
  RU: ['Ясно', 'Облачно', 'Туман', 'Дождь', 'Снег', 'Гроза'],
  EN: ['Clear', 'Cloudy', 'Fog', 'Rain', 'Snow', 'Thunderstorm'],
  KK: ['Ашық', 'Бұлтты', 'Тұман', 'Жаңбыр', 'Қар', 'Найзағай'],
  ZH: ['晴', '多云', '雾', '雨', '雪', '雷暴'],
};
const weatherLabel = (code, lang) => {
  const labels = WEATHER_LABELS[lang] || WEATHER_LABELS.RU;
  const value = Number(code);
  if (value === 0) return labels[0];
  if (value >= 1 && value <= 3) return labels[1];
  if (value === 45 || value === 48) return labels[2];
  if ((value >= 51 && value <= 67) || (value >= 80 && value <= 82)) return labels[3];
  if ((value >= 71 && value <= 77) || (value >= 85 && value <= 86)) return labels[4];
  if (value >= 95) return labels[5];
  return '';
};

export default function TripRoutePanel({
  from, to, transit, capacityTons, weather = null, role,
  onOpenRates, onOpenWeather, onOpenBorder, onOpenTracking,
}) {
  const { theme } = useTheme();
  const { lang } = useI18n();
  const copy = COPY[lang] || COPY.RU;
  const [state, setState] = React.useState('loading');
  const [summary, setSummary] = React.useState(null);
  const [retry, setRetry] = React.useState(0);
  const [liveWeather, setLiveWeather] = React.useState(null);
  const [fx, setFx] = React.useState(null);

  const routePoints = React.useMemo(() => dedupePoints([
    ...parseRouteCities(from),
    ...(transit ? parseRouteCities(transit) : []),
    ...parseRouteCities(to),
  ]), [from, to, transit]);

  const vehicle = React.useMemo(() => {
    const tons = Number(capacityTons);
    return Number.isFinite(tons) && tons > 0 ? { payload_t: tons } : null;
  }, [capacityTons]);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (routePoints.length < 2) {
      setSummary(null);
      setState('unavailable');
      return () => controller.abort();
    }
    setState('loading');
    routingAPI.roadRoute(routePoints, vehicle, { signal: controller.signal }).then((result) => {
      if (cancelled) return;
      const distanceText = formatDistance(result?.distance_m, lang);
      const durationText = formatDuration(result?.duration_s, lang);
      if (result?.ok && distanceText && durationText) {
        setSummary({ distanceText, durationText });
        setState('ready');
      } else {
        setSummary(null);
        setState('unavailable');
      }
    }).catch(() => {
      if (!cancelled) { setSummary(null); setState('unavailable'); }
    });
    return () => { cancelled = true; controller.abort(); };
  }, [routePoints, vehicle, lang, retry]);

  React.useEffect(() => {
    let cancelled = false;
    fetchRates().then((result) => { if (!cancelled) setFx(result); });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      if (role !== 'driver') return;
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;
      let position = await Location.getLastKnownPositionAsync({ maxAge: 15 * 60 * 1000, requiredAccuracy: 5000 });
      if (!position) position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (cancelled || !position?.coords) return;
      const { latitude, longitude } = position.coords;
      const places = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []);
      const place = places?.[0];
      const city = place?.city || place?.district || place?.subregion || place?.region || '';
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`;
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        const temperature = Number(data?.current?.temperature_2m);
        const code = Number(data?.current?.weather_code);
        if (cancelled || !Number.isFinite(temperature) || !Number.isFinite(code)) return;
        const degrees = Math.round(temperature);
        const signed = degrees > 0 ? `+${degrees}` : String(degrees);
        const condition = weatherLabel(code, lang);
        setLiveWeather({
          text: [city, `${signed}°`, condition].filter(Boolean).join(' · '),
          source: 'open-meteo.com',
        });
      } finally {
        clearTimeout(timeout);
      }
    };
    load().catch(() => {});
    return () => { cancelled = true; controller.abort(); };
  }, [lang, role]);

  const serverWeatherText = weather?.current_label || weather?.current || weather?.now || '';
  const weatherText = liveWeather?.text || serverWeatherText || copy.weatherUnavailable;
  const ratesText = fx?.rates
    ? `${fx.stale ? `${copy.cached} · ` : ''}₸${Math.round(Number(fx.rates.KZT))} · ¥${Number(fx.rates.CNY).toFixed(2)} · ₽${Math.round(Number(fx.rates.RUB))}`
    : copy.ratesUnavailable;
  const actions = [
    { key: 'rates', icon: 'dollar-sign', label: copy.rates, meta: ratesText, onPress: onOpenRates, available: Boolean(fx?.rates) },
    { key: 'weather', icon: 'cloud', label: copy.weather, meta: weatherText, onPress: onOpenWeather, available: Boolean(liveWeather?.text || serverWeatherText) },
    { key: 'border', icon: 'map-pin', label: copy.border, meta: 'CGR', onPress: onOpenBorder, available: true },
    { key: 'gps', icon: 'navigation', label: copy.gps, meta: onOpenTracking ? '' : copy.gpsPending, onPress: onOpenTracking, available: Boolean(onOpenTracking) },
  ];

  return (
    <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]} testID="trip-route-panel">
      <View style={s.header}>
        <Text style={[s.eyebrow, { color: theme.textMuted }]}>{copy.tools}</Text>
        <View style={s.menuGrid}>
          {actions.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[s.menuItem, { backgroundColor: theme.bg, borderColor: theme.border }, !item.onPress && !item.available && s.menuDisabled]}
              onPress={item.onPress}
              disabled={!item.onPress}
              activeOpacity={0.82}
              accessibilityRole="button"
              testID={`trip-tool-${item.key}`}
            >
              <View style={[s.menuIcon, { backgroundColor: theme.card }]}>
                <Feather name={item.icon} size={18} color={item.onPress || item.available ? '#168759' : theme.textMuted} />
              </View>
              <Text style={[s.menuLabel, { color: theme.text }]} numberOfLines={1}>{item.label}</Text>
              {item.meta ? <Text style={[s.menuMeta, { color: theme.textMuted }]} numberOfLines={1}>{item.meta}</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[s.routeBlock, { borderTopColor: theme.border }]}>
        <View style={s.routeTitleRow}>
          <Feather name="navigation" size={16} color="#168759" />
          <Text style={[s.routeTitle, { color: theme.textMuted }]}>{copy.route}</Text>
        </View>
        <Text style={[s.routeText, { color: theme.text }]} numberOfLines={2}>
          {localizePlace(from, lang)}
          {transit ? `  →  ${localizePlace(transit, lang)}` : ''}
          {'  →  '}
          {localizePlace(to, lang)}
        </Text>

        {state === 'loading' ? (
          <View style={s.loadingRow} testID="trip-route-loading">
            <ActivityIndicator size="small" color="#168759" />
            <Text style={[s.stateText, { color: theme.textMuted }]}>{copy.loading}</Text>
          </View>
        ) : summary ? (
          <View style={s.metrics} testID="trip-route-real-metrics">
            <View style={[s.metric, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <Text style={[s.metricLabel, { color: theme.textMuted }]}>{copy.distance}</Text>
              <Text style={[s.metricValue, { color: theme.text }]}>{summary.distanceText}</Text>
            </View>
            <View style={[s.metric, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <Text style={[s.metricLabel, { color: theme.textMuted }]}>{copy.duration}</Text>
              <Text style={[s.metricValue, { color: theme.text }]}>{summary.durationText}</Text>
            </View>
          </View>
        ) : (
          <View style={s.errorRow} testID="trip-route-unavailable">
            <Text style={[s.stateText, { color: theme.textMuted }]}>{copy.unavailable}</Text>
            <TouchableOpacity onPress={() => setRetry((value) => value + 1)} style={s.retry} testID="trip-route-retry">
              <Text style={s.retryText}>{copy.retry}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 10 },
  header: { padding: 13, gap: 10 },
  eyebrow: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.45 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  menuItem: { flexGrow: 1, flexBasis: '47%', minHeight: 74, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 10, justifyContent: 'center' },
  menuDisabled: { opacity: 0.58 },
  menuIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  menuLabel: { fontSize: 13, fontWeight: '900' },
  menuMeta: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  routeBlock: { borderTopWidth: StyleSheet.hairlineWidth, padding: 13 },
  routeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  routeTitle: { fontSize: 11.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  routeText: { fontSize: 18, fontWeight: '900', marginTop: 7, lineHeight: 23 },
  loadingRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stateText: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  metrics: { flexDirection: 'row', gap: 9, marginTop: 12 },
  metric: { flex: 1, minHeight: 72, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 10, justifyContent: 'space-between' },
  metricLabel: { fontSize: 11, fontWeight: '800' },
  metricValue: { fontSize: 17, fontWeight: '900', marginTop: 5, fontVariant: ['tabular-nums'] },
  errorRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  retry: { minHeight: 44, paddingHorizontal: 15, borderRadius: 12, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
