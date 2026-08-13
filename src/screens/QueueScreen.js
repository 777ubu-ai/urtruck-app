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

const BASE = `${API_BASE}/borders`;
const LEGACY_PLATE_KEY = 'ur_queue_plate';
const SAVED_PLATES_KEY = 'ur_border_saved_plates_v1';
const FAVORITES_KEY = 'ur_border_favorites_v1';
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

const COPY = {
  RU: {
    title: 'Граница',
    subtitle: 'Очереди и ситуация на пунктах пропуска',
    checkQueue: 'Проверить свою очередь',
    platePlaceholder: 'Госномер, например 123ABC02',
    check: 'Проверить',
    myVehicles: 'Мои машины',
    addPlateHint: 'Введите госномер выше — он появится здесь и будет обновляться.',
    bestNow: 'Лучший вариант сейчас',
    favorites: 'Избранные переходы',
    where: 'Куда едете?',
    crossings: 'переходов',
    crossing: 'переход',
    vehicles: 'машин',
    free: 'Свободно',
    moderate: 'Умеренно',
    busy: 'Загружено',
    very_busy: 'Очень загружено',
    stale: 'Данные устарели',
    no_data: 'Нет актуальных данных',
    closed: 'Закрыто',
    updated: 'Обновлено',
    source: 'Источник',
    official: 'CGR · официальный реестр',
    cgr: 'CGR · официальный реестр',
    partner: 'Партнёрские данные',
    urtruck: 'Данные UrTruck',
    driver_reports: 'По сообщениям водителей',
    estimated: 'Прогноз UrTruck',
    noCurrent: 'Нет актуальных данных',
    sourceUnavailable: 'Источник временно недоступен',
    retry: 'Повторить',
    activeNotFound: 'Активная очередь по этому номеру не найдена',
    lookupError: 'Не удалось обновить данные',
    status: 'Статус',
    checkpoint: 'Пункт пропуска',
    queueStatus: 'Статус в очереди',
    queueTime: 'Время очереди',
    tracking: 'Слежение включено',
    remove: 'Удалить',
    details: 'Подробнее',
    back: 'Назад',
    countryLive: 'С актуальными данными',
    countryNoData: 'Нет свежих данных',
    allCrossings: 'Пункты пропуска',
    lastValue: 'Последнее значение',
    favoriteAdded: 'В избранном',
    favoriteAdd: 'В избранное',
    openCgr: 'Открыть CarGoRuqsat',
    live: 'Актуально',
    refresh: 'Обновить',
  },
  KK: {
    title: 'Шекара',
    subtitle: 'Өткізу бекеттеріндегі кезек пен жағдай',
    checkQueue: 'Өз кезегіңізді тексеру',
    platePlaceholder: 'Мемлекеттік нөмір, мысалы 123ABC02',
    check: 'Тексеру',
    myVehicles: 'Менің көліктерім',
    addPlateHint: 'Нөмірді жоғарыда енгізіңіз — ол осында сақталып, жаңарып тұрады.',
    bestNow: 'Қазір ең тиімді нұсқа',
    favorites: 'Таңдаулы өткізу бекеттері',
    where: 'Қайда барасыз?',
    crossings: 'бекет', crossing: 'бекет', vehicles: 'көлік',
    free: 'Бос', moderate: 'Орташа', busy: 'Жүктелген', very_busy: 'Өте жүктелген',
    stale: 'Деректер ескірген', no_data: 'Өзекті дерек жоқ', closed: 'Жабық',
    updated: 'Жаңартылды', source: 'Дереккөз', official: 'CGR · ресми тізілім', cgr: 'CGR · ресми тізілім',
    partner: 'Серіктес деректері', urtruck: 'UrTruck деректері', driver_reports: 'Жүргізушілер мәліметі', estimated: 'UrTruck болжамы',
    noCurrent: 'Өзекті дерек жоқ', sourceUnavailable: 'Дереккөз уақытша қолжетімсіз', retry: 'Қайталау',
    activeNotFound: 'Бұл нөмір бойынша белсенді кезек табылмады', lookupError: 'Деректерді жаңарту мүмкін болмады',
    status: 'Күйі', checkpoint: 'Өткізу бекеті', queueStatus: 'Кезектегі күйі', queueTime: 'Кезек уақыты',
    tracking: 'Бақылау қосылды', remove: 'Жою', details: 'Толығырақ', back: 'Артқа',
    countryLive: 'Өзекті деректер бар', countryNoData: 'Жаңа дерек жоқ', allCrossings: 'Өткізу бекеттері',
    lastValue: 'Соңғы мән', favoriteAdded: 'Таңдаулыда', favoriteAdd: 'Таңдаулыға', openCgr: 'CarGoRuqsat ашу', live: 'Өзекті', refresh: 'Жаңарту',
  },
  EN: {
    title: 'Border', subtitle: 'Queues and checkpoint conditions', checkQueue: 'Check your queue',
    platePlaceholder: 'Plate number, e.g. 123ABC02', check: 'Check', myVehicles: 'My vehicles',
    addPlateHint: 'Enter a plate above — it will be saved here and kept updated.', bestNow: 'Best option now',
    favorites: 'Favorite crossings', where: 'Where are you going?', crossings: 'crossings', crossing: 'crossing', vehicles: 'vehicles',
    free: 'Free', moderate: 'Moderate', busy: 'Busy', very_busy: 'Very busy', stale: 'Data is stale', no_data: 'No current data', closed: 'Closed',
    updated: 'Updated', source: 'Source', official: 'CGR · official registry', cgr: 'CGR · official registry', partner: 'Partner data',
    urtruck: 'UrTruck data', driver_reports: 'Driver reports', estimated: 'UrTruck forecast', noCurrent: 'No current data',
    sourceUnavailable: 'Source temporarily unavailable', retry: 'Retry', activeNotFound: 'No active queue found for this plate', lookupError: 'Could not refresh data',
    status: 'Status', checkpoint: 'Checkpoint', queueStatus: 'Queue status', queueTime: 'Queue time', tracking: 'Tracking enabled', remove: 'Remove', details: 'Details', back: 'Back',
    countryLive: 'Current data available', countryNoData: 'No fresh data', allCrossings: 'Border crossings', lastValue: 'Last value',
    favoriteAdded: 'Favorite', favoriteAdd: 'Add favorite', openCgr: 'Open CarGoRuqsat', live: 'Live', refresh: 'Refresh',
  },
  ZH: {
    title: '边境', subtitle: '口岸排队与通行情况', checkQueue: '查询我的排队', platePlaceholder: '车牌号，例如 123ABC02', check: '查询',
    myVehicles: '我的车辆', addPlateHint: '在上方输入车牌号，系统会保存并持续更新。', bestNow: '当前最佳选择', favorites: '收藏口岸', where: '您要去哪里？',
    crossings: '个口岸', crossing: '口岸', vehicles: '辆车', free: '畅通', moderate: '一般', busy: '拥堵', very_busy: '严重拥堵',
    stale: '数据已过期', no_data: '暂无实时数据', closed: '关闭', updated: '更新时间', source: '数据来源', official: 'CGR · 官方登记', cgr: 'CGR · 官方登记',
    partner: '合作方数据', urtruck: 'UrTruck 数据', driver_reports: '司机上报', estimated: 'UrTruck 预测', noCurrent: '暂无实时数据', sourceUnavailable: '数据源暂时不可用', retry: '重试',
    activeNotFound: '未找到该车牌的有效排队', lookupError: '无法更新数据', status: '状态', checkpoint: '口岸', queueStatus: '排队状态', queueTime: '排队时间',
    tracking: '已开启跟踪', remove: '删除', details: '详情', back: '返回', countryLive: '有实时数据', countryNoData: '暂无新数据', allCrossings: '边境口岸',
    lastValue: '最近数值', favoriteAdded: '已收藏', favoriteAdd: '收藏', openCgr: '打开 CarGoRuqsat', live: '实时', refresh: '刷新',
  },
};

const COUNTRY = {
  CN: { flag: '🇨🇳', RU: 'Китай', KK: 'Қытай', EN: 'China', ZH: '中国' },
  RU: { flag: '🇷🇺', RU: 'Россия', KK: 'Ресей', EN: 'Russia', ZH: '俄罗斯' },
  UZ: { flag: '🇺🇿', RU: 'Узбекистан', KK: 'Өзбекстан', EN: 'Uzbekistan', ZH: '乌兹别克斯坦' },
  KG: { flag: '🇰🇬', RU: 'Кыргызстан', KK: 'Қырғызстан', EN: 'Kyrgyzstan', ZH: '吉尔吉斯斯坦' },
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
  };
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
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedCrossing, setSelectedCrossing] = useState(null);
  const [best, setBest] = useState(null);
  const [countries, setCountries] = useState([]);
  const [allCrossings, setAllCrossings] = useState([]);
  const [countryCrossings, setCountryCrossings] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [savedPlates, setSavedPlates] = useState([]);
  const [vehicleStates, setVehicleStates] = useState({});
  const [plate, setPlate] = useState('');
  const [lookup, setLookup] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [countryLoading, setCountryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const countryName = useCallback((code) => {
    const meta = COUNTRY[code] || { flag: '🌐', RU: code, KZ: code, EN: code, CN: code };
    return `${meta.flag || '🌐'} ${meta[lang] || meta.RU || code}`;
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
    setFavorites(jsonArray(favRaw));
    let localPlates = jsonArray(platesRaw).map(normalizePlate).filter(Boolean);
    if (legacy) localPlates = [...new Set([normalizePlate(legacy), ...localPlates].filter(Boolean))];

    if (token) {
      try {
        const data = await fetchJson(`${BASE}/watch`, { headers: { Authorization: `Bearer ${token}` } });
        const server = (data.watches || []).map((w) => normalizePlate(w.plate)).filter(Boolean);
        localPlates = [...new Set([...server, ...localPlates])];
      } catch { /* local list remains useful offline */ }
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadHome({ spin: false }), refreshVehicles()]);
    if (view === 'country' && selectedCountry) {
      try {
        const d = await fetchJson(`${BASE}?country=${encodeURIComponent(selectedCountry)}`);
        setCountryCrossings((d.borders || []).map(normalizeCrossing));
      } catch { /* keep previous country data */ }
    }
    setRefreshing(false);
  }, [loadHome, refreshVehicles, view, selectedCountry]);

  const openCountry = useCallback(async (code) => {
    setSelectedCountry(code);
    setView('country');
    setCountryLoading(true);
    setCountryCrossings([]);
    try {
      const data = await fetchJson(`${BASE}?country=${encodeURIComponent(code)}`);
      setCountryCrossings((data.borders || []).map(normalizeCrossing));
    } catch {
      setCountryCrossings([]);
    } finally { setCountryLoading(false); }
  }, []);

  const orderedCrossings = useMemo(() => [...countryCrossings].sort((a, b) => {
    const rank = (x) => x.load_status === 'closed' ? 4 : x.load_status === 'no_data' ? 3 : x.load_status === 'stale' ? 2 : 0;
    const ar = rank(a), br = rank(b);
    if (ar !== br) return ar - br;
    if (ar === 0) return (a.trucks_in_queue ?? Number.MAX_SAFE_INTEGER) - (b.trucks_in_queue ?? Number.MAX_SAFE_INTEGER);
    return (toMs(b.updated_at) || 0) - (toMs(a.updated_at) || 0);
  }), [countryCrossings]);

  const favoriteCrossings = useMemo(() => {
    const map = new Map(allCrossings.map((c) => [String(c.id), c]));
    return favorites.map((id) => map.get(String(id))).filter(Boolean).slice(0, 5);
  }, [favorites, allCrossings]);

  const toggleFavorite = useCallback((crossing) => {
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

  const goBack = () => {
    if (view === 'detail') { setView('country'); setSelectedCrossing(null); return; }
    if (view === 'country') { setView('home'); setSelectedCountry(null); return; }
    navigation.goBack();
  };

  const renderQueueValue = (crossing, large = false) => {
    const current = crossing?.trucks_in_queue;
    const staleValue = crossing?.last_queue_value;
    if (current != null) {
      return (
        <View style={styles.queueLine}>
          <Text style={[large ? styles.queueBig : styles.queueNum, { color: theme.text }]}>{current}</Text>
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

  const CrossingCard = ({ crossing, featured = false }) => {
    const fav = favorites.includes(String(crossing.id));
    return (
      <TouchableOpacity
        activeOpacity={0.86}
        onPress={() => { setSelectedCrossing(crossing); setSelectedCountry(crossing.country || selectedCountry); setView('detail'); }}
        style={[styles.card, featured && styles.featureCard, { backgroundColor: theme.card, borderColor: featured ? '#9FD8BD' : theme.border }]}
        testID="border-crossing-card"
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTitleWrap}>
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>{crossing.name}</Text>
            {crossing.country ? <Text style={[styles.meta, { color: theme.textMuted }]}>{countryName(crossing.country)}</Text> : null}
          </View>
          <TouchableOpacity
            onPress={(e) => { e?.stopPropagation?.(); toggleFavorite(crossing); }}
            style={styles.starButton}
            accessibilityRole="button"
            accessibilityLabel={fav ? L.favoriteAdded : L.favoriteAdd}
          >
            <Feather name="star" size={20} color={fav ? '#168759' : theme.textDim} fill={fav ? '#168759' : 'transparent'} />
          </TouchableOpacity>
        </View>
        <View style={styles.statusQueueRow}>
          <StatusPill status={crossing.load_status} text={statusText(crossing.load_status)} compact />
          {renderQueueValue(crossing)}
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: theme.textDim }]}>{L.updated}: {humanAge(crossing.updated_at, lang)}</Text>
          <Text style={[styles.meta, { color: theme.textDim }]}>{sourceText(crossing.source_type)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderVehicle = (p) => {
    const state = vehicleStates[p];
    const color = LOOKUP_STATUS_COLOR[state?.status] || theme.textMuted;
    return (
      <View key={p} style={[styles.vehicleCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.plate, { color: theme.text }]}>{p}</Text>
          {!state ? <Text style={[styles.meta, { color: theme.textMuted }]}>{L.refresh}…</Text> : null}
          {state?.error ? <Text style={[styles.meta, { color: theme.textMuted }]}>{L.lookupError}</Text> : null}
          {state && !state.error && state.found === false ? <Text style={[styles.meta, { color: theme.textMuted }]}>{L.activeNotFound}</Text> : null}
          {state?.found ? (
            <>
              <Text style={[styles.vehicleStatus, { color }]}>{state.status_raw || state.status || L.status}</Text>
              {state.checkpoint ? <Text style={[styles.meta, { color: theme.textMuted }]}>{state.checkpoint}</Text> : null}
            </>
          ) : null}
        </View>
        <TouchableOpacity onPress={() => removePlate(p)} style={styles.iconButton} accessibilityLabel={L.remove}>
          <Feather name="x" size={18} color={theme.textDim} />
        </TouchableOpacity>
      </View>
    );
  };

  const SectionTitle = ({ children }) => <Text style={[styles.sectionTitle, { color: theme.text }]}>{children}</Text>;

  const Home = () => (
    <>
      <View style={[styles.hero, { backgroundColor: theme.card, borderColor: theme.border }]}> 
        <View style={styles.heroIcon}><Feather name="navigation" size={20} color="#168759" /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heroTitle, { color: theme.text }]}>{L.title}</Text>
          <Text style={[styles.heroSub, { color: theme.textMuted }]}>{L.subtitle}</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.iconButton} accessibilityLabel={L.refresh}>
          <Feather name="refresh-cw" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

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
      </View>

      <SectionTitle>{L.myVehicles}</SectionTitle>
      {savedPlates.length ? (
        <View style={[styles.grid, wide && styles.gridWide]}>{savedPlates.slice(0, 6).map(renderVehicle)}</View>
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="truck" size={20} color={theme.textDim} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>{L.addPlateHint}</Text>
        </View>
      )}

      {best ? (
        <>
          <SectionTitle>{L.bestNow}</SectionTitle>
          <CrossingCard crossing={best} featured />
        </>
      ) : null}

      {favoriteCrossings.length ? (
        <>
          <SectionTitle>{L.favorites}</SectionTitle>
          <View style={[styles.grid, wide && styles.gridWide]}>{favoriteCrossings.map((c) => <CrossingCard key={c.id} crossing={c} />)}</View>
        </>
      ) : null}

      <SectionTitle>{L.where}</SectionTitle>
      {error ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="wifi-off" size={20} color={theme.textDim} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>{error}</Text>
          <TouchableOpacity onPress={() => loadHome()}><Text style={styles.retryText}>{L.retry}</Text></TouchableOpacity>
        </View>
      ) : null}
      <View style={[styles.countryGrid, wide && styles.countryGridWide]}>
        {countries.map((c) => {
          const meta = COUNTRY[c.country] || { flag: '🌐' };
          const liveCount = Number(c.free || 0) + Number(c.moderate || 0) + Number(c.busy || 0) + Number(c.very_busy || 0);
          return (
            <TouchableOpacity key={c.country} onPress={() => openCountry(c.country)} style={[styles.countryCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID={`border-country-${c.country}`}>
              <Text style={styles.flag}>{meta.flag || '🌐'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.countryName, { color: theme.text }]}>{(meta[lang] || meta.RU || c.country)}</Text>
                <Text style={[styles.meta, { color: theme.textMuted }]}>{c.crossings} {L.crossings}</Text>
                <Text style={[styles.countryLive, { color: liveCount > 0 ? '#168759' : theme.textDim }]}>{liveCount > 0 ? `${L.countryLive}: ${liveCount}` : L.countryNoData}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={theme.textDim} />
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity onPress={() => Linking.openURL('https://cgr.qoldau.kz/ru/start').catch(() => {})} style={[styles.portalButton, { borderColor: theme.border }]}>
        <Feather name="external-link" size={16} color="#168759" />
        <Text style={styles.portalText}>{L.openCgr}</Text>
      </TouchableOpacity>
    </>
  );

  const CountryView = () => (
    <>
      <View style={styles.pageHeading}>
        <TouchableOpacity onPress={goBack} style={styles.backButton}><Feather name="arrow-left" size={20} color={theme.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pageTitle, { color: theme.text }]}>{countryName(selectedCountry)}</Text>
          <Text style={[styles.heroSub, { color: theme.textMuted }]}>{L.allCrossings}</Text>
        </View>
      </View>
      {countryLoading ? <ActivityIndicator style={{ marginTop: 50 }} color="#168759" /> : null}
      {!countryLoading && !orderedCrossings.length ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="database" size={20} color={theme.textDim} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>{L.noCurrent}</Text>
        </View>
      ) : null}
      <View style={[styles.grid, wide && styles.gridWide]}>{orderedCrossings.map((c) => <CrossingCard key={c.id} crossing={c} />)}</View>
    </>
  );

  const DetailView = () => {
    const c = selectedCrossing;
    if (!c) return null;
    const fav = favorites.includes(String(c.id));
    return (
      <>
        <View style={styles.pageHeading}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}><Feather name="arrow-left" size={20} color={theme.text} /></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: theme.text }]}>{c.name}</Text>
            <Text style={[styles.heroSub, { color: theme.textMuted }]}>{c.country ? countryName(c.country) : ''}</Text>
          </View>
          <TouchableOpacity onPress={() => toggleFavorite(c)} style={styles.iconButton}>
            <Feather name="star" size={22} color={fav ? '#168759' : theme.textDim} fill={fav ? '#168759' : 'transparent'} />
          </TouchableOpacity>
        </View>
        <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-crossing-detail">
          <StatusPill status={c.load_status} text={statusText(c.load_status)} />
          <View style={styles.detailQueue}>{renderQueueValue(c, true)}</View>
          <View style={[styles.separator, { backgroundColor: theme.border }]} />
          <View style={styles.detailField}><Text style={[styles.detailLabel, { color: theme.textMuted }]}>{L.updated}</Text><Text style={[styles.detailValue, { color: theme.text }]}>{humanAge(c.updated_at, lang)}</Text></View>
          <View style={styles.detailField}><Text style={[styles.detailLabel, { color: theme.textMuted }]}>{L.source}</Text><Text style={[styles.detailValue, { color: theme.text }]}>{sourceText(c.source_type)}</Text></View>
          {c.name_en && lang !== 'EN' ? <View style={styles.detailField}><Text style={[styles.detailLabel, { color: theme.textMuted }]}>EN</Text><Text style={[styles.detailValue, { color: theme.text }]}>{c.name_en}</Text></View> : null}
        </View>
        <TouchableOpacity onPress={() => Linking.openURL('https://cgr.qoldau.kz/ru/start').catch(() => {})} style={[styles.portalButton, { borderColor: theme.border }]}>
          <Feather name="external-link" size={16} color="#168759" />
          <Text style={styles.portalText}>{L.openCgr}</Text>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: v1.bg }]} edges={['top']}>
      <View style={[styles.topBar, { borderBottomColor: theme.border, backgroundColor: v1.bg }]}> 
        {view === 'home' ? <View style={{ width: 42 }} /> : <TouchableOpacity onPress={goBack} style={styles.topBack}><Feather name="arrow-left" size={20} color={theme.text} /></TouchableOpacity>}
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
          {view === 'home' ? <Home /> : view === 'country' ? <CountryView /> : <DetailView />}
          <View style={{ height: 28 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { height: 56, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800' },
  topBack: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 18, width: '100%' },
  contentWide: { maxWidth: 1040, alignSelf: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { borderWidth: 1, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#E8F6EF', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 22, fontWeight: '850' },
  heroSub: { marginTop: 3, fontSize: 13, lineHeight: 18 },
  searchBox: { marginTop: 14, borderWidth: 1, borderRadius: 18, padding: 15 },
  blockTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  searchRow: { gap: 9 },
  searchRowWide: { flexDirection: 'row' },
  inputWrap: { minHeight: 48, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flex: 1 },
  input: { flex: 1, fontSize: 15, marginLeft: 8, paddingVertical: 10 },
  primaryButton: { minHeight: 48, minWidth: 118, borderRadius: 13, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  buttonDisabled: { opacity: 0.45 },
  lookupResult: { marginTop: 13, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth },
  resultTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  resultText: { fontSize: 13, lineHeight: 19 },
  lookupStatus: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  lookupStatusText: { fontSize: 12, fontWeight: '800' },
  sectionTitle: { marginTop: 22, marginBottom: 10, fontSize: 16, fontWeight: '850' },
  grid: { gap: 10 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { borderWidth: 1, borderRadius: 17, padding: 14, minWidth: 0, flexGrow: 1, flexBasis: 320 },
  featureCard: { borderWidth: 1.5 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitleWrap: { flex: 1 },
  cardTitle: { fontSize: 16, lineHeight: 21, fontWeight: '850' },
  starButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  statusQueueRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  pillCompact: { paddingHorizontal: 9, paddingVertical: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: '800' },
  queueLine: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  queueNum: { fontSize: 18, fontWeight: '900' },
  queueBig: { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  queueUnit: { fontSize: 12, fontWeight: '650' },
  noData: { fontSize: 12, fontWeight: '700' },
  lastValue: { marginTop: 3, fontSize: 11 },
  metaRow: { marginTop: 12, gap: 3 },
  meta: { fontSize: 12, lineHeight: 17 },
  emptyCard: { borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyText: { flex: 1, fontSize: 13, lineHeight: 18 },
  retryText: { color: '#168759', fontWeight: '800', fontSize: 13 },
  vehicleCard: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', minWidth: 0, flexGrow: 1, flexBasis: 300 },
  plate: { fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  vehicleStatus: { marginTop: 4, fontSize: 12, fontWeight: '800' },
  countryGrid: { gap: 9 },
  countryGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  countryCard: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 82, flexGrow: 1, flexBasis: 300 },
  flag: { fontSize: 27 },
  countryName: { fontSize: 16, fontWeight: '850' },
  countryLive: { marginTop: 3, fontSize: 11, fontWeight: '700' },
  portalButton: { marginTop: 18, borderWidth: 1, borderRadius: 14, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  portalText: { color: '#168759', fontWeight: '800', fontSize: 13 },
  pageHeading: { marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '900' },
  detailCard: { borderWidth: 1, borderRadius: 18, padding: 17 },
  detailQueue: { marginTop: 20 },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: 18 },
  detailField: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 11 },
  detailLabel: { fontSize: 13, flex: 0.38 },
  detailValue: { fontSize: 13, fontWeight: '750', flex: 0.62, textAlign: 'right' },
});
