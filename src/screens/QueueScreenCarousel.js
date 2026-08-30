import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { useV1Colors } from '../theme/designV1';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import { API_BASE } from '../config/env';
import { storage } from '../utils/storage';
import { useSafeRefresh } from '../hooks/useSafeRefresh';

const BASE = `${API_BASE}/borders`;
const LEGACY_PLATE_KEY = 'ur_queue_plate';
const SAVED_PLATES_KEY = 'ur_border_saved_plates_v1';
const FAVORITES_KEY = 'ur_border_favorites_v1';
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const DEFAULT_COUNTRY = 'CN';
const COUNTRY_ORDER = ['CN', 'KG', 'RU', 'UZ', 'TM'];

const COPY = {
  RU: {
    title: 'Граница', subtitle: 'Очереди и бронь на пунктах пропуска', chooseCheckpoint: 'Выберите КПП',
    checkQueue: 'Проверить свою очередь', platePlaceholder: 'Госномер, например 123ABC02', check: 'Проверить',
    myVehicles: 'Мои машины', myCheckpoints: 'Мои КПП', bestNow: 'Лучший сейчас', favorites: 'Избранные переходы',
    where: 'Куда едете?', all: 'Все', vehicles: 'машин', queueNow: 'Очередь сейчас', nearestBooking: 'Ближайшая бронь',
    waitingArea: 'В зоне ожидания', dailyLimit: 'Лимит', perDay: '/сутки', free: 'Свободно', moderate: 'Умеренно',
    busy: 'Загружено', very_busy: 'Очень загружено', stale: 'Данные устарели', no_data: 'Нет актуальных данных',
    closed: 'Закрыто', updated: 'Обновлено', source: 'Источник', official: 'CGR · официальный реестр', cgr: 'CGR · официальный реестр',
    partner: 'Партнёрские данные', urtruck: 'Данные UrTruck', driver_reports: 'По сообщениям водителей', estimated: 'Прогноз UrTruck',
    noCurrent: 'Нет актуальных данных', sourceUnavailable: 'Источник временно недоступен', retry: 'Повторить',
    activeNotFound: 'Активная очередь по этому номеру не найдена', lookupError: 'Не удалось обновить данные',
    status: 'Статус', checkpoint: 'Пункт пропуска', queueStatus: 'Статус в очереди', queueTime: 'Время очереди',
    remove: 'Удалить', details: 'Подробнее', back: 'Назад', lastValue: 'Последнее значение',
    favoriteAdded: 'В избранном', favoriteAdd: 'В избранное', openCgr: 'Открыть CarGoRuqsat', refresh: 'Обновить',
    availabilityPending: 'CGR пока не отдал значение', selectHint: 'Листайте и нажмите нужный пункт',
  },
  KK: {
    title: 'Шекара', subtitle: 'Өткізу бекеттеріндегі кезек пен бронь', chooseCheckpoint: 'Өткізу бекетін таңдаңыз',
    checkQueue: 'Өз кезегіңізді тексеру', platePlaceholder: 'Мемлекеттік нөмір, мысалы 123ABC02', check: 'Тексеру',
    myVehicles: 'Менің көліктерім', myCheckpoints: 'Менің бекеттерім', bestNow: 'Қазір ең тиімді', favorites: 'Таңдаулы бекеттер',
    where: 'Қайда барасыз?', all: 'Барлығы', vehicles: 'көлік', queueNow: 'Қазір кезекте', nearestBooking: 'Жақын бронь',
    waitingArea: 'Күту аймағында', dailyLimit: 'Лимит', perDay: '/тәулік', free: 'Бос', moderate: 'Орташа',
    busy: 'Жүктелген', very_busy: 'Өте жүктелген', stale: 'Деректер ескірген', no_data: 'Өзекті дерек жоқ', closed: 'Жабық',
    updated: 'Жаңартылды', source: 'Дереккөз', official: 'CGR · ресми тізілім', cgr: 'CGR · ресми тізілім',
    partner: 'Серіктес деректері', urtruck: 'UrTruck деректері', driver_reports: 'Жүргізушілер мәліметі', estimated: 'UrTruck болжамы',
    noCurrent: 'Өзекті дерек жоқ', sourceUnavailable: 'Дереккөз уақытша қолжетімсіз', retry: 'Қайталау',
    activeNotFound: 'Бұл нөмір бойынша белсенді кезек табылмады', lookupError: 'Деректерді жаңарту мүмкін болмады',
    status: 'Күйі', checkpoint: 'Өткізу бекеті', queueStatus: 'Кезектегі күйі', queueTime: 'Кезек уақыты', remove: 'Жою',
    details: 'Толығырақ', back: 'Артқа', lastValue: 'Соңғы мән', favoriteAdded: 'Таңдаулыда', favoriteAdd: 'Таңдаулыға',
    openCgr: 'CarGoRuqsat ашу', refresh: 'Жаңарту', availabilityPending: 'CGR әзірге мәнді бермеді',
    selectHint: 'Жылжытып, қажет бекетті басыңыз',
  },
  EN: {
    title: 'Border', subtitle: 'Queues and booking at checkpoints', chooseCheckpoint: 'Choose checkpoint',
    checkQueue: 'Check your queue', platePlaceholder: 'Plate number, e.g. 123ABC02', check: 'Check', myVehicles: 'My vehicles',
    myCheckpoints: 'My checkpoints', bestNow: 'Best now', favorites: 'Favorite crossings', where: 'Where are you going?', all: 'All',
    vehicles: 'vehicles', queueNow: 'Queue now', nearestBooking: 'Nearest booking', waitingArea: 'Waiting area', dailyLimit: 'Limit', perDay: '/day',
    free: 'Free', moderate: 'Moderate', busy: 'Busy', very_busy: 'Very busy', stale: 'Data is stale', no_data: 'No current data', closed: 'Closed',
    updated: 'Updated', source: 'Source', official: 'CGR · official registry', cgr: 'CGR · official registry', partner: 'Partner data',
    urtruck: 'UrTruck data', driver_reports: 'Driver reports', estimated: 'UrTruck forecast', noCurrent: 'No current data',
    sourceUnavailable: 'Source temporarily unavailable', retry: 'Retry', activeNotFound: 'No active queue found for this plate',
    lookupError: 'Could not refresh data', status: 'Status', checkpoint: 'Checkpoint', queueStatus: 'Queue status', queueTime: 'Queue time',
    remove: 'Remove', details: 'Details', back: 'Back', lastValue: 'Last value', favoriteAdded: 'Favorite', favoriteAdd: 'Add favorite',
    openCgr: 'Open CarGoRuqsat', refresh: 'Refresh', availabilityPending: 'CGR has not provided this value yet',
    selectHint: 'Swipe and tap the checkpoint you need',
  },
  ZH: {
    title: '边境', subtitle: '口岸排队与预约', chooseCheckpoint: '选择口岸', checkQueue: '查询我的排队',
    platePlaceholder: '车牌号，例如 123ABC02', check: '查询', myVehicles: '我的车辆', myCheckpoints: '我的口岸', bestNow: '当前最佳',
    favorites: '收藏口岸', where: '您要去哪里？', all: '全部', vehicles: '辆车', queueNow: '当前排队', nearestBooking: '最近预约',
    waitingArea: '等候区', dailyLimit: '限额', perDay: '/天', free: '畅通', moderate: '一般', busy: '拥堵', very_busy: '严重拥堵',
    stale: '数据已过期', no_data: '暂无实时数据', closed: '关闭', updated: '更新时间', source: '数据来源', official: 'CGR · 官方登记',
    cgr: 'CGR · 官方登记', partner: '合作方数据', urtruck: 'UrTruck 数据', driver_reports: '司机上报', estimated: 'UrTruck 预测',
    noCurrent: '暂无实时数据', sourceUnavailable: '数据源暂时不可用', retry: '重试', activeNotFound: '未找到该车牌的有效排队',
    lookupError: '无法更新数据', status: '状态', checkpoint: '口岸', queueStatus: '排队状态', queueTime: '排队时间', remove: '删除',
    details: '详情', back: '返回', lastValue: '最近数值', favoriteAdded: '已收藏', favoriteAdd: '收藏', openCgr: '打开 CarGoRuqsat',
    refresh: '刷新', availabilityPending: 'CGR 暂未提供该值', selectHint: '左右滑动并点击需要的口岸',
  },
};

const COUNTRY = {
  CN: { flag: '🇨🇳', RU: 'Китай', KK: 'Қытай', EN: 'China', ZH: '中国' },
  KG: { flag: '🇰🇬', RU: 'Кыргызстан', KK: 'Қырғызстан', EN: 'Kyrgyzstan', ZH: '吉尔吉斯斯坦' },
  RU: { flag: '🇷🇺', RU: 'Россия', KK: 'Ресей', EN: 'Russia', ZH: '俄罗斯' },
  UZ: { flag: '🇺🇿', RU: 'Узбекистан', KK: 'Өзбекстан', EN: 'Uzbekistan', ZH: '乌兹别克斯坦' },
  TM: { flag: '🇹🇲', RU: 'Туркменистан', KK: 'Түрікменстан', EN: 'Turkmenistan', ZH: '土库曼斯坦' },
};

const STATUS_COLOR = {
  free: '#168759', moderate: '#D97706', busy: '#EA580C', very_busy: '#DC2626',
  stale: '#6B7280', no_data: '#6B7280', closed: '#4B5563',
};

const LOOKUP_STATUS_COLOR = {
  in_queue: '#168759', called: '#D97706', crossed: '#168759', revoked: '#DC2626',
};

function jsonArray(raw) {
  if (!raw) return [];
  try { const value = JSON.parse(raw); return Array.isArray(value) ? value : []; } catch { return []; }
}

function normalizePlate(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function toMs(value) {
  if (!value) return null;
  const normalized = /Z$|[+-]\d\d:?\d\d$/.test(String(value)) ? String(value) : `${String(value).replace(' ', 'T')}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function ageMinutes(value) {
  const ms = toMs(value);
  if (ms == null) return null;
  return Math.max(0, Math.round((Date.now() - ms) / 60000));
}

function isStale(value) {
  const ms = toMs(value);
  return ms == null || Date.now() - ms > STALE_AFTER_MS;
}

function humanAge(value, lang) {
  const mins = ageMinutes(value);
  if (mins == null) return '—';
  if (mins < 1) return lang === 'ZH' ? '刚刚' : lang === 'EN' ? 'just now' : lang === 'KK' ? 'жаңа ғана' : 'только что';
  if (mins < 60) return lang === 'ZH' ? `${mins}分钟前` : lang === 'EN' ? `${mins} min ago` : lang === 'KK' ? `${mins} мин бұрын` : `${mins} мин назад`;
  const h = Math.floor(mins / 60);
  return lang === 'ZH' ? `${h}小时前` : lang === 'EN' ? `${h} h ago` : lang === 'KK' ? `${h} сағ бұрын` : `${h} ч назад`;
}

function firstValue(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && obj?.[key] !== '') return obj[key];
  }
  return null;
}

function formatBookingValue(value, lang) {
  if (value == null || value === '') return '—';
  if (typeof value !== 'string') return String(value);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  try {
    const locale = lang === 'KK' ? 'kk-KZ' : lang === 'EN' ? 'en-GB' : lang === 'ZH' ? 'zh-CN' : 'ru-RU';
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(ms));
  } catch { return value; }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) {
    const message = typeof body?.detail === 'string' ? body.detail : `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

function normalizeCrossing(raw) {
  const source = raw?.source_type || raw?.source || null;
  const updatedAt = raw?.updated_at || raw?.last_updated || null;
  const stale = isStale(updatedAt);
  const hasOfficialCurrentSource = source === 'cgr' || source === 'official';
  const rawQueue = raw?.trucks_in_queue ?? raw?.queue_count ?? null;
  let status = raw?.load_status || null;
  if (!hasOfficialCurrentSource) status = 'no_data';
  else if (stale) status = 'stale';
  else if (!status) {
    if (rawQueue == null) status = 'no_data';
    else if (rawQueue <= 15) status = 'free';
    else if (rawQueue <= 40) status = 'moderate';
    else if (rawQueue <= 80) status = 'busy';
    else status = 'very_busy';
  }
  const queue = status === 'stale' || status === 'no_data' || status === 'closed' ? null : rawQueue;
  return {
    ...raw,
    id: raw?.id || raw?.code || raw?.name,
    name: raw?.name || raw?.name_ru || raw?.code || '—',
    source_type: source,
    updated_at: updatedAt,
    load_status: status,
    trucks_in_queue: queue,
    last_queue_value: rawQueue,
    next_booking: firstValue(raw, ['next_available_booking', 'first_available_booking', 'available_booking_at', 'nearest_booking']),
    waiting_area_count: firstValue(raw, ['waiting_area_count', 'trucks_in_waiting_area', 'waiting_count']),
    daily_capacity: firstValue(raw, ['daily_capacity', 'capacity_per_day', 'daily_limit', 'limit_per_day']),
  };
}

function pickBest(list) {
  const reliable = (list || []).filter((c) => c.trucks_in_queue != null && !['stale', 'no_data', 'closed'].includes(c.load_status));
  if (reliable.length) return [...reliable].sort((a, b) => a.trucks_in_queue - b.trucks_in_queue)[0];
  return (list || [])[0] || null;
}

function StatusPill({ status, text, compact = false }) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.no_data;
  return (
    <View style={[styles.pill, compact && styles.pillCompact, { backgroundColor: `${color}16` }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

export default function QueueScreen({ navigation, route }) {
  const { theme } = useTheme();
  const v1 = useV1Colors();
  const { lang } = useI18n();
  const { width } = useWindowDimensions();
  const L = COPY[lang] || COPY.RU;
  const role = route?.params?.role || 'driver';
  const wide = width >= 760;

  const [view, setView] = useState('home');
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [selectedCrossing, setSelectedCrossing] = useState(null);
  const [best, setBest] = useState(null);
  const [countries, setCountries] = useState([]);
  const [allCrossings, setAllCrossings] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [savedPlates, setSavedPlates] = useState([]);
  const [vehicleStates, setVehicleStates] = useState({});
  const [plate, setPlate] = useState('');
  const [lookup, setLookup] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const countryName = useCallback((code, withFlag = true) => {
    const meta = COUNTRY[code] || { flag: '🌐', RU: code, KK: code, EN: code, ZH: code };
    const name = meta[lang] || meta.RU || code;
    return withFlag ? `${meta.flag || '🌐'} ${name}` : name;
  }, [lang]);

  const statusText = useCallback((status) => L[status] || L.no_data, [L]);
  const sourceText = useCallback((source) => L[source] || (source ? String(source).toUpperCase() : L.sourceUnavailable), [L]);

  const saveFavorites = useCallback(async (next) => {
    setFavorites(next);
    await storage.set(FAVORITES_KEY, JSON.stringify(next));
  }, []);

  const savePlates = useCallback(async (next) => {
    const unique = [...new Set(next.map(normalizePlate).filter((x) => x.length >= 3))].slice(0, 8);
    setSavedPlates(unique);
    await storage.set(SAVED_PLATES_KEY, JSON.stringify(unique));
  }, []);

  const loadSaved = useCallback(async () => {
    const [favRaw, platesRaw, legacy, token] = await Promise.all([
      storage.get(FAVORITES_KEY), storage.get(SAVED_PLATES_KEY), storage.get(LEGACY_PLATE_KEY), storage.get('ur_reg_token'),
    ]);
    setFavorites(jsonArray(favRaw).map(String));
    let localPlates = jsonArray(platesRaw).map(normalizePlate).filter(Boolean);
    if (legacy) localPlates = [...new Set([normalizePlate(legacy), ...localPlates].filter(Boolean))];
    if (token) {
      try {
        const data = await fetchJson(`${BASE}/watch`, { headers: { Authorization: `Bearer ${token}` } });
        const server = (data.watches || []).map((w) => normalizePlate(w.plate)).filter(Boolean);
        localPlates = [...new Set([...server, ...localPlates])];
      } catch { /* local list stays usable */ }
    }
    await savePlates(localPlates);
  }, [savePlates]);

  const refreshVehicles = useCallback(async (platesArg) => {
    const plates = platesArg || savedPlates;
    if (!plates.length) { setVehicleStates({}); return; }
    const entries = await Promise.all(plates.slice(0, 8).map(async (p) => {
      try { return [p, await fetchJson(`${BASE}/lookup?plate=${encodeURIComponent(p)}`)]; }
      catch { return [p, { error: true, plate: p }]; }
    }));
    setVehicleStates(Object.fromEntries(entries));
  }, [savedPlates]);

  const loadHome = useCallback(async ({ spin = true } = {}) => {
    if (spin) setLoading(true);
    setError('');
    try {
      const [bestData, countryData, crossingData] = await Promise.all([
        fetchJson(`${BASE}/best`),
        fetchJson(`${BASE}/countries`),
        fetchJson(`${BASE}?country=`),
      ]);
      setBest(bestData?.best ? normalizeCrossing(bestData.best) : null);
      setCountries(Array.isArray(countryData?.countries) ? countryData.countries : []);
      setAllCrossings((crossingData?.borders || []).map(normalizeCrossing));
    } catch {
      setError(L.sourceUnavailable);
      setBest(null);
      setCountries([]);
      setAllCrossings([]);
    } finally {
      if (spin) setLoading(false);
    }
  }, [L.sourceUnavailable]);

  useEffect(() => { loadSaved(); }, [loadSaved]);
  useEffect(() => { loadHome(); }, [loadHome]);
  useEffect(() => { refreshVehicles(); }, [savedPlates.join('|')]);
  useFocusEffect(useCallback(() => {
    loadSaved();
    loadHome({ spin: false });
  }, [loadSaved, loadHome]));

  const countryCodes = useMemo(() => {
    const available = new Set([
      ...countries.map((c) => c.country),
      ...allCrossings.map((c) => c.country),
    ].filter(Boolean));
    const ordered = COUNTRY_ORDER.filter((code) => available.has(code) || ['CN', 'KG', 'RU'].includes(code));
    for (const code of available) if (!ordered.includes(code)) ordered.push(code);
    return ordered;
  }, [countries, allCrossings]);

  const visibleCrossings = useMemo(() => {
    const list = selectedCountry === 'ALL'
      ? allCrossings
      : allCrossings.filter((c) => c.country === selectedCountry);
    const bestCandidate = pickBest(list);
    return [...list].sort((a, b) => {
      if (String(a.id) === String(bestCandidate?.id)) return -1;
      if (String(b.id) === String(bestCandidate?.id)) return 1;
      const af = favorites.includes(String(a.id)) ? 0 : 1;
      const bf = favorites.includes(String(b.id)) ? 0 : 1;
      if (af !== bf) return af - bf;
      const aq = a.trucks_in_queue == null ? Number.MAX_SAFE_INTEGER : a.trucks_in_queue;
      const bq = b.trucks_in_queue == null ? Number.MAX_SAFE_INTEGER : b.trucks_in_queue;
      return aq - bq;
    });
  }, [selectedCountry, allCrossings, favorites]);

  const bestVisible = useMemo(() => pickBest(visibleCrossings), [visibleCrossings]);

  useEffect(() => {
    if (!visibleCrossings.length) { setSelectedCrossing(null); return; }
    setSelectedCrossing((current) => {
      const refreshed = visibleCrossings.find((c) => String(c.id) === String(current?.id));
      return refreshed || bestVisible || visibleCrossings[0];
    });
  }, [visibleCrossings, bestVisible]);

  const favoriteCrossings = useMemo(() => {
    const map = new Map(allCrossings.map((c) => [String(c.id), c]));
    return favorites.map((id) => map.get(String(id))).filter(Boolean).slice(0, 6);
  }, [favorites, allCrossings]);

  const { refreshing, onRefresh } = useSafeRefresh(
    useCallback(() => Promise.all([loadHome({ spin: false }), refreshVehicles()]), [loadHome, refreshVehicles]),
  );

  const toggleFavorite = useCallback((crossing) => {
    if (!crossing) return;
    const id = String(crossing.id);
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [id, ...favorites.filter((x) => x !== id)].slice(0, 12);
    saveFavorites(next);
  }, [favorites, saveFavorites]);

  const searchPlate = useCallback(async (value = plate) => {
    const p = normalizePlate(value);
    if (p.length < 3 || lookupLoading) return;
    setPlate(p);
    setLookupLoading(true);
    setLookup(null);
    try {
      const data = await fetchJson(`${BASE}/lookup?plate=${encodeURIComponent(p)}`);
      setLookup(data);
      if (!savedPlates.includes(p)) await savePlates([p, ...savedPlates]);
      const token = await storage.get('ur_reg_token');
      if (token) {
        fetch(`${BASE}/watch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ plate: p }),
        }).catch(() => {});
      }
      setVehicleStates((prev) => ({ ...prev, [p]: data }));
    } catch {
      setLookup({ error: true, plate: p });
    } finally { setLookupLoading(false); }
  }, [plate, lookupLoading, savedPlates, savePlates]);

  const removePlate = useCallback(async (p) => {
    const normalized = normalizePlate(p);
    await savePlates(savedPlates.filter((x) => x !== normalized));
    setVehicleStates((prev) => { const next = { ...prev }; delete next[normalized]; return next; });
    if (normalizePlate(plate) === normalized) { setPlate(''); setLookup(null); }
    const token = await storage.get('ur_reg_token');
    if (token) {
      fetch(`${BASE}/watch?plate=${encodeURIComponent(normalized)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }, [savedPlates, savePlates, plate]);

  const renderQueueValue = (crossing, large = false) => {
    const current = crossing?.trucks_in_queue;
    const staleValue = crossing?.last_queue_value;
    if (current != null) {
      return (
        <View style={styles.queueLine}>
          <Text style={[large ? styles.queueBig : styles.queueNum, { color: STATUS_COLOR[crossing.load_status] || theme.text }]}>{current}</Text>
          <Text style={[styles.queueUnit, { color: theme.textMuted }]}>{L.vehicles}</Text>
        </View>
      );
    }
    return (
      <View>
        <Text style={[styles.noData, { color: theme.textMuted }]}>{L.noCurrent}</Text>
        {crossing?.load_status === 'stale' && staleValue != null ? (
          <Text style={[styles.lastValue, { color: theme.textDim }]}>{L.lastValue}: {staleValue} {L.vehicles}</Text>
        ) : null}
      </View>
    );
  };

  const renderMetricValue = (value, formatter) => {
    if (value == null || value === '') return <Text style={[styles.metricValue, { color: theme.textDim }]}>—</Text>;
    return <Text style={[styles.metricValue, { color: theme.text }]}>{formatter ? formatter(value) : String(value)}</Text>;
  };

  const SelectedCard = ({ crossing }) => {
    if (!crossing) return null;
    const fav = favorites.includes(String(crossing.id));
    const isBest = String(crossing.id) === String(bestVisible?.id);
    return (
      <View style={[styles.selectedCard, { backgroundColor: theme.card, borderColor: '#9FD8BD' }]} testID="border-selected-card">
        <View style={styles.selectedTop}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={styles.titleBadgeRow}>
              <Text style={[styles.selectedTitle, { color: theme.text }]} numberOfLines={2}>{crossing.name}</Text>
              {isBest ? <View style={styles.bestBadge}><Feather name="zap" size={12} color="#168759" /><Text style={styles.bestBadgeText}>{L.bestNow}</Text></View> : null}
            </View>
            {crossing.country ? <Text style={[styles.countryMeta, { color: theme.textMuted }]}>{countryName(crossing.country)}</Text> : null}
          </View>
          <StatusPill status={crossing.load_status} text={statusText(crossing.load_status)} compact />
        </View>

        <View style={[styles.metricGrid, { borderColor: theme.border }]}> 
          <View style={[styles.metricCell, styles.metricCellRight, styles.metricCellBottom, { borderColor: theme.border }]}> 
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{L.queueNow}</Text>
            {renderQueueValue(crossing, true)}
          </View>
          <View style={[styles.metricCell, styles.metricCellBottom, { borderColor: theme.border }]}> 
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{L.nearestBooking}</Text>
            {renderMetricValue(crossing.next_booking, (v) => formatBookingValue(v, lang))}
          </View>
          <View style={[styles.metricCell, styles.metricCellRight, { borderColor: theme.border }]}> 
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{L.waitingArea}</Text>
            {renderMetricValue(crossing.waiting_area_count)}
          </View>
          <View style={styles.metricCell}>
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{L.dailyLimit}</Text>
            {renderMetricValue(crossing.daily_capacity, (v) => `${v}${L.perDay}`)}
          </View>
        </View>

        <View style={styles.sourceRow}>
          <Text style={[styles.sourceText, { color: theme.textDim }]} numberOfLines={1}>
            {sourceText(crossing.source_type)} · {L.updated.toLowerCase()}: {humanAge(crossing.updated_at, lang)}
          </Text>
          <TouchableOpacity onPress={onRefresh} style={styles.miniIconButton} accessibilityLabel={L.refresh}>
            <Feather name="refresh-cw" size={15} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity onPress={() => { setSelectedCrossing(crossing); setView('detail'); }} style={[styles.secondaryButton, { borderColor: theme.border }]} testID="border-details-button">
            <Feather name="info" size={17} color={theme.text} />
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>{L.details}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => toggleFavorite(crossing)} style={[styles.secondaryButton, { borderColor: theme.border }]}>
            <Feather name="star" size={17} color="#168759" fill={fav ? '#168759' : 'transparent'} />
            <Text style={[styles.secondaryButtonText, { color: '#168759' }]}>{fav ? L.favoriteAdded : L.favoriteAdd}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const PlateSearch = () => (
    <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-plate-search">
      <Text style={[styles.blockTitle, { color: theme.text }]}>{L.checkQueue}</Text>
      <View style={[styles.searchRow, wide && styles.searchRowWide]}>
        <View style={[styles.inputWrap, { borderColor: theme.border, backgroundColor: v1.bg }]}> 
          <Feather name="truck" size={17} color={theme.textMuted} />
          <TextInput
            value={plate}
            onChangeText={(v) => { setPlate(v.toUpperCase()); if (lookup) setLookup(null); }}
            onSubmitEditing={() => searchPlate()}
            placeholder={L.platePlaceholder}
            placeholderTextColor={theme.textDim}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { color: theme.text }]}
            testID="border-plate-input"
          />
        </View>
        <TouchableOpacity
          onPress={() => searchPlate()}
          disabled={normalizePlate(plate).length < 3 || lookupLoading}
          style={[styles.primaryButton, (normalizePlate(plate).length < 3 || lookupLoading) && styles.buttonDisabled]}
          testID="border-plate-check"
        >
          {lookupLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{L.check}</Text>}
        </TouchableOpacity>
      </View>
      {lookup ? (
        <View style={[styles.lookupResult, { borderTopColor: theme.border }]}> 
          {lookup.error ? (
            <Text style={[styles.resultText, { color: '#B45309' }]}>{L.lookupError}</Text>
          ) : lookup.found ? (
            <>
              <View style={styles.resultTop}>
                <Text style={[styles.plate, { color: theme.text }]}>{lookup.plate || normalizePlate(plate)}</Text>
                <View style={[styles.lookupStatus, { backgroundColor: `${LOOKUP_STATUS_COLOR[lookup.status] || '#6B7280'}16` }]}> 
                  <Text style={[styles.lookupStatusText, { color: LOOKUP_STATUS_COLOR[lookup.status] || theme.textMuted }]}>{lookup.status_raw || lookup.status}</Text>
                </View>
              </View>
              {lookup.checkpoint ? <Text style={[styles.meta, { color: theme.textMuted }]}>{L.checkpoint}: {lookup.checkpoint}</Text> : null}
              {lookup.queue_datetime ? <Text style={[styles.meta, { color: theme.textMuted }]}>{L.queueTime}: {lookup.queue_datetime}</Text> : null}
            </>
          ) : <Text style={[styles.resultText, { color: theme.textMuted }]}>{L.activeNotFound}</Text>}
        </View>
      ) : null}

      {savedPlates.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedPlateRow}>
          {savedPlates.slice(0, 6).map((p) => {
            const state = vehicleStates[p];
            const color = LOOKUP_STATUS_COLOR[state?.status] || theme.textDim;
            return (
              <TouchableOpacity key={p} onPress={() => { setPlate(p); searchPlate(p); }} onLongPress={() => removePlate(p)} style={[styles.savedPlateChip, { borderColor: theme.border, backgroundColor: v1.bg }]}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <Text style={[styles.savedPlateText, { color: theme.text }]}>{p}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  const Home = () => (
    <>
      <View style={styles.introRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.introText, { color: theme.textMuted }]}>{L.subtitle}</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.iconButton} accessibilityLabel={L.refresh}>
          <Feather name="refresh-cw" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countryChips} testID="border-country-filter">
        {countryCodes.map((code) => {
          const selected = selectedCountry === code;
          return (
            <TouchableOpacity
              key={code}
              onPress={() => setSelectedCountry(code)}
              style={[styles.countryChip, { borderColor: selected ? '#168759' : theme.border, backgroundColor: selected ? '#168759' : theme.card }]}
              testID={`border-country-${code}`}
            >
              <Text style={styles.countryChipFlag}>{COUNTRY[code]?.flag || '🌐'}</Text>
              <Text style={[styles.countryChipText, { color: selected ? '#fff' : theme.text }]}>{countryName(code, false)}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={() => setSelectedCountry('ALL')}
          style={[styles.countryChip, { borderColor: selectedCountry === 'ALL' ? '#168759' : theme.border, backgroundColor: selectedCountry === 'ALL' ? '#168759' : theme.card }]}
          testID="border-country-ALL"
        >
          <Feather name="globe" size={15} color={selectedCountry === 'ALL' ? '#fff' : theme.textMuted} />
          <Text style={[styles.countryChipText, { color: selectedCountry === 'ALL' ? '#fff' : theme.text }]}>{L.all}</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.selectorHeading}>
        <View>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{L.chooseCheckpoint}</Text>
          <Text style={[styles.selectorHint, { color: theme.textDim }]}>{L.selectHint}</Text>
        </View>
        <Feather name="chevrons-right" size={18} color={theme.textDim} />
      </View>

      {error ? (
        <View style={[styles.errorCard, { backgroundColor: theme.card, borderColor: theme.border }]}> 
          <Feather name="wifi-off" size={18} color={theme.textDim} />
          <Text style={[styles.errorText, { color: theme.textMuted }]}>{error}</Text>
          <TouchableOpacity onPress={() => loadHome()}><Text style={styles.retryText}>{L.retry}</Text></TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
        decelerationRate="fast"
        testID="border-checkpoint-carousel"
      >
        {visibleCrossings.map((crossing) => {
          const active = String(selectedCrossing?.id) === String(crossing.id);
          const color = STATUS_COLOR[crossing.load_status] || STATUS_COLOR.no_data;
          return (
            <TouchableOpacity
              key={String(crossing.id)}
              activeOpacity={0.86}
              onPress={() => setSelectedCrossing(crossing)}
              style={[
                styles.carouselCard,
                { backgroundColor: theme.card, borderColor: active ? '#168759' : theme.border },
                active && styles.carouselCardActive,
              ]}
              testID="border-checkpoint-chip"
            >
              <Text style={[styles.carouselName, { color: theme.text }]} numberOfLines={1}>{crossing.name.split(' - ')[0]}</Text>
              <View style={styles.carouselQueueRow}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <Text style={[styles.carouselQueue, { color: crossing.trucks_in_queue != null ? color : theme.textDim }]}>{crossing.trucks_in_queue != null ? crossing.trucks_in_queue : '—'}</Text>
              </View>
              <Text style={[styles.carouselCountry, { color: theme.textDim }]} numberOfLines={1}>{crossing.country ? countryName(crossing.country, false) : '—'}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {visibleCrossings.length ? <SelectedCard crossing={selectedCrossing} /> : (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}> 
          <Feather name="database" size={19} color={theme.textDim} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>{L.noCurrent}</Text>
        </View>
      )}

      {favoriteCrossings.length ? (
        <View style={[styles.myCheckpointBox, { backgroundColor: theme.card, borderColor: theme.border }]}> 
          <Text style={[styles.blockTitle, { color: theme.text }]}>{L.myCheckpoints}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favoriteRow}>
            {favoriteCrossings.map((c) => (
              <TouchableOpacity key={String(c.id)} onPress={() => { setSelectedCountry(c.country || 'ALL'); setSelectedCrossing(c); }} style={[styles.favoriteChip, { borderColor: theme.border, backgroundColor: v1.bg }]}> 
                <View style={[styles.dot, { backgroundColor: STATUS_COLOR[c.load_status] || theme.textDim }]} />
                <Text style={[styles.favoriteText, { color: theme.text }]} numberOfLines={1}>{c.name.split(' - ')[0]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <PlateSearch />

      <TouchableOpacity onPress={() => Linking.openURL('https://cgr.qoldau.kz/ru/start').catch(() => {})} style={[styles.portalButton, { borderColor: theme.border }]}>
        <Feather name="external-link" size={16} color="#168759" />
        <Text style={styles.portalText}>{L.openCgr}</Text>
      </TouchableOpacity>
    </>
  );

  const DetailView = () => {
    const c = selectedCrossing;
    if (!c) return null;
    const fav = favorites.includes(String(c.id));
    return (
      <>
        <View style={styles.detailHeading}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.detailTitle, { color: theme.text }]}>{c.name}</Text>
            <Text style={[styles.introText, { color: theme.textMuted }]}>{c.country ? countryName(c.country) : ''}</Text>
          </View>
          <TouchableOpacity onPress={() => toggleFavorite(c)} style={styles.iconButton}>
            <Feather name="star" size={22} color={fav ? '#168759' : theme.textDim} fill={fav ? '#168759' : 'transparent'} />
          </TouchableOpacity>
        </View>

        <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-crossing-detail">
          <StatusPill status={c.load_status} text={statusText(c.load_status)} />
          <View style={styles.detailMetricRow}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>{L.queueNow}</Text>
            {renderQueueValue(c, true)}
          </View>
          <View style={[styles.separator, { backgroundColor: theme.border }]} />
          <View style={styles.detailField}><Text style={[styles.detailLabel, { color: theme.textMuted }]}>{L.nearestBooking}</Text><Text style={[styles.detailValue, { color: theme.text }]}>{formatBookingValue(c.next_booking, lang)}</Text></View>
          <View style={styles.detailField}><Text style={[styles.detailLabel, { color: theme.textMuted }]}>{L.waitingArea}</Text><Text style={[styles.detailValue, { color: theme.text }]}>{c.waiting_area_count ?? '—'}</Text></View>
          <View style={styles.detailField}><Text style={[styles.detailLabel, { color: theme.textMuted }]}>{L.dailyLimit}</Text><Text style={[styles.detailValue, { color: theme.text }]}>{c.daily_capacity != null ? `${c.daily_capacity}${L.perDay}` : '—'}</Text></View>
          <View style={styles.detailField}><Text style={[styles.detailLabel, { color: theme.textMuted }]}>{L.updated}</Text><Text style={[styles.detailValue, { color: theme.text }]}>{humanAge(c.updated_at, lang)}</Text></View>
          <View style={styles.detailField}><Text style={[styles.detailLabel, { color: theme.textMuted }]}>{L.source}</Text><Text style={[styles.detailValue, { color: theme.text }]}>{sourceText(c.source_type)}</Text></View>
          {(c.next_booking == null || c.waiting_area_count == null || c.daily_capacity == null) ? (
            <Text style={[styles.dataNote, { color: theme.textDim }]}>{L.availabilityPending}</Text>
          ) : null}
        </View>

        <TouchableOpacity onPress={() => Linking.openURL('https://cgr.qoldau.kz/ru/start').catch(() => {})} style={styles.cgrButton}>
          <Feather name="external-link" size={17} color="#fff" />
          <Text style={styles.cgrButtonText}>{L.openCgr}</Text>
        </TouchableOpacity>
      </>
    );
  };

  const goBack = () => {
    if (view === 'detail') { setView('home'); return; }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: v1.bg }]} edges={['top']}>
      <View style={[styles.topBar, { borderBottomColor: theme.border, backgroundColor: v1.bg }]}> 
        {view === 'home' ? <View style={{ width: 42 }} /> : (
          <TouchableOpacity onPress={goBack} style={styles.topBack} accessibilityLabel={L.back}>
            <Feather name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
        )}
        <Text style={[styles.topTitle, { color: theme.text }]} testID="queue-title">{L.title}</Text>
        <HeaderMenuButton navigation={navigation} role={role} />
      </View>
      {loading && view === 'home' ? (
        <View style={styles.loadingWrap}><ActivityIndicator color="#168759" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, wide && styles.contentWide]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#168759" />}
          keyboardShouldPersistTaps="handled"
        >
          {view === 'home' ? <Home /> : <DetailView />}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { height: 56, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 19, fontWeight: '850' },
  topBack: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 18, width: '100%' },
  contentWide: { maxWidth: 1040, alignSelf: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  introRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, marginBottom: 8 },
  introText: { fontSize: 13, lineHeight: 18 },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  miniIconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  countryChips: { gap: 8, paddingRight: 12, paddingVertical: 2 },
  countryChip: { height: 38, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  countryChipFlag: { fontSize: 15 },
  countryChipText: { fontSize: 13, fontWeight: '750' },

  selectorHeading: { marginTop: 18, marginBottom: 9, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '900' },
  selectorHint: { marginTop: 3, fontSize: 11.5, lineHeight: 16 },
  carouselContent: { gap: 9, paddingRight: 34, paddingBottom: 4 },
  carouselCard: { width: 116, minHeight: 94, borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 11, justifyContent: 'space-between' },
  carouselCardActive: { borderWidth: 1.7, shadowColor: '#168759', shadowOpacity: 0.09, shadowRadius: 8, elevation: 1 },
  carouselName: { fontSize: 13.5, fontWeight: '850' },
  carouselQueueRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  carouselQueue: { fontSize: 18, fontWeight: '900' },
  carouselCountry: { marginTop: 4, fontSize: 11.5 },

  selectedCard: { marginTop: 12, borderWidth: 1.4, borderRadius: 18, padding: 14 },
  selectedTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleBadgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  selectedTitle: { fontSize: 19, lineHeight: 24, fontWeight: '900', flexShrink: 1 },
  countryMeta: { marginTop: 4, fontSize: 12.5 },
  bestBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EAF7F0', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999 },
  bestBadgeText: { color: '#168759', fontSize: 10.5, fontWeight: '800' },

  metricGrid: { marginTop: 13, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  metricCell: { width: '50%', minHeight: 86, padding: 12, justifyContent: 'center' },
  metricCellRight: { borderRightWidth: StyleSheet.hairlineWidth },
  metricCellBottom: { borderBottomWidth: StyleSheet.hairlineWidth },
  metricLabel: { fontSize: 11.5, lineHeight: 16, marginBottom: 5 },
  metricValue: { fontSize: 20, lineHeight: 25, fontWeight: '900' },
  sourceRow: { marginTop: 10, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceText: { flex: 1, fontSize: 11.5 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 7 },
  secondaryButton: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
  secondaryButtonText: { fontSize: 12.5, fontWeight: '800' },

  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  pillCompact: { paddingHorizontal: 8, paddingVertical: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 11.5, fontWeight: '800' },
  queueLine: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  queueNum: { fontSize: 18, fontWeight: '900' },
  queueBig: { fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.4 },
  queueUnit: { fontSize: 11.5, fontWeight: '650' },
  noData: { fontSize: 12, fontWeight: '700' },
  lastValue: { marginTop: 3, fontSize: 10.5 },

  searchBox: { marginTop: 14, borderWidth: 1, borderRadius: 17, padding: 14 },
  blockTitle: { fontSize: 15, fontWeight: '850', marginBottom: 10 },
  searchRow: { gap: 8 },
  searchRowWide: { flexDirection: 'row' },
  inputWrap: { minHeight: 47, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flex: 1 },
  input: { flex: 1, fontSize: 14.5, marginLeft: 8, paddingVertical: 9 },
  primaryButton: { minHeight: 47, minWidth: 112, borderRadius: 12, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryButtonText: { color: '#fff', fontSize: 13.5, fontWeight: '850' },
  buttonDisabled: { opacity: 0.45 },
  lookupResult: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  resultTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  resultText: { fontSize: 12.5, lineHeight: 18 },
  lookupStatus: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  lookupStatusText: { fontSize: 11.5, fontWeight: '800' },
  plate: { fontSize: 15.5, fontWeight: '900', letterSpacing: 0.4 },
  meta: { fontSize: 12, lineHeight: 17 },
  savedPlateRow: { gap: 7, paddingTop: 11, paddingRight: 10 },
  savedPlateChip: { height: 34, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  savedPlateText: { fontSize: 11.5, fontWeight: '800' },

  myCheckpointBox: { marginTop: 12, borderWidth: 1, borderRadius: 16, padding: 13 },
  favoriteRow: { gap: 7, paddingRight: 10 },
  favoriteChip: { maxWidth: 142, height: 36, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  favoriteText: { flexShrink: 1, fontSize: 12, fontWeight: '750' },

  errorCard: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 },
  errorText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  retryText: { color: '#168759', fontWeight: '800', fontSize: 12.5 },
  emptyCard: { marginTop: 12, borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyText: { flex: 1, fontSize: 12.5, lineHeight: 18 },

  portalButton: { marginTop: 13, borderWidth: 1, borderRadius: 13, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  portalText: { color: '#168759', fontWeight: '800', fontSize: 12.5 },

  detailHeading: { marginBottom: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailTitle: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  detailCard: { borderWidth: 1, borderRadius: 18, padding: 16 },
  detailMetricRow: { marginTop: 18 },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  detailField: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 },
  detailLabel: { fontSize: 12.5, flex: 0.44 },
  detailValue: { fontSize: 13, fontWeight: '800', flex: 0.56, textAlign: 'right' },
  dataNote: { marginTop: 4, fontSize: 11.5, lineHeight: 17 },
  cgrButton: { marginTop: 12, minHeight: 48, borderRadius: 13, backgroundColor: '#168759', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cgrButtonText: { color: '#fff', fontSize: 13.5, fontWeight: '850' },
});
