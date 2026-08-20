import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { useV1Colors } from '../theme/designV1';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import { API_BASE } from '../config/env';
import { storage } from '../utils/storage';
import { localizePlace } from '../utils/places';

const BASE = `${API_BASE}/borders`;
const FAVORITES_KEY = 'ur_border_favorites_v2';
const DEFAULT_COUNTRY = 'CN';
const COUNTRY_ORDER = ['CN', 'KG', 'RU', 'UZ', 'TM', 'CASPIAN'];

const COUNTRY = {
  CN: { flag: '🇨🇳', RU: 'Китай', KK: 'Қытай', EN: 'China', ZH: '中国' },
  KG: { flag: '🇰🇬', RU: 'Кыргызстан', KK: 'Қырғызстан', EN: 'Kyrgyzstan', ZH: '吉尔吉斯斯坦' },
  RU: { flag: '🇷🇺', RU: 'Россия', KK: 'Ресей', EN: 'Russia', ZH: '俄罗斯' },
  UZ: { flag: '🇺🇿', RU: 'Узбекистан', KK: 'Өзбекстан', EN: 'Uzbekistan', ZH: '乌兹别克斯坦' },
  TM: { flag: '🇹🇲', RU: 'Туркменистан', KK: 'Түрікменстан', EN: 'Turkmenistan', ZH: '土库曼斯坦' },
  CASPIAN: { flag: '⚓️', RU: 'Каспий', KK: 'Каспий', EN: 'Caspian', ZH: '里海' },
};

const COPY = {
  RU: {
    title: 'Граница', subtitle: 'Реальная загрузка и доступная бронь CGR', where: 'Куда едете?', all: 'Все',
    choose: 'Выберите КПП', hint: 'Листайте и нажмите нужный пункт — данные CGR загрузятся только для него',
    tap: 'Нажмите на КПП, чтобы увидеть реальную обстановку', loading: 'Получаем данные CGR…',
    nearest: 'Ближайшая свободная бронь', places: 'свободных мест', standard: '1 МРП', premium: '100 МРП',
    premiumNearest: 'Ближайшая бронь за 100 МРП', noStandard: 'Свободных мест за 1 МРП в доступном календаре нет',
    board: 'Сейчас на табло', limit: 'Лимит', perDay: '/сутки', calendar: 'Календарь загрузки', noPlaces: 'Нет мест',
    dayOff: 'Выходной', updated: 'CGR обновлено', refresh: 'Обновить', details: 'Открыть CGR', favorite: 'В избранное',
    favorited: 'В избранном', sourceError: 'Не удалось получить данные CGR. Повторите.', checkQueue: 'Проверить свою очередь',
    platePlaceholder: 'Госномер, например 123ABC02', check: 'Проверить', notFound: 'Активная очередь не найдена',
    lookupError: 'Не удалось проверить номер', checkpoint: 'КПП', queueTime: 'Время очереди', status: 'Статус',
    cached: 'из кэша UrTruck', live: 'живые данные', selected: 'Выбрано', open: 'Нажать',
    statusInQueue: 'В очереди', statusCalled: 'Вызван на КПП', statusCrossed: 'КПП пройден', statusRevoked: 'Пропуск отозван',
    statusPayment: 'Ожидается оплата', statusNotPaid: 'Не оплачено', statusValidating: 'Проверяется', statusReviewFailed: 'Требуется проверка', statusUnknown: 'Статус неизвестен',
  },
  KK: {
    title: 'Шекара', subtitle: 'CGR нақты жүктемесі және қолжетімді бронь', where: 'Қайда барасыз?', all: 'Барлығы',
    choose: 'Өткізу бекетін таңдаңыз', hint: 'Жылжытып, қажет бекетті басыңыз — CGR деректері тек сол бекетке жүктеледі',
    tap: 'Нақты жағдайды көру үшін бекетті басыңыз', loading: 'CGR деректері жүктелуде…', nearest: 'Ең жақын бос бронь',
    places: 'бос орын', standard: '1 АЕК', premium: '100 АЕК', premiumNearest: '100 АЕК бойынша жақын бронь',
    noStandard: 'Қолжетімді күнтізбеде 1 АЕК бойынша бос орын жоқ', board: 'Қазір таблода', limit: 'Лимит', perDay: '/тәулік',
    calendar: 'Жүктеме күнтізбесі', noPlaces: 'Орын жоқ', dayOff: 'Демалыс', updated: 'CGR жаңартылды', refresh: 'Жаңарту',
    details: 'CGR ашу', favorite: 'Таңдаулыға', favorited: 'Таңдаулыда', sourceError: 'CGR деректерін алу мүмкін болмады.',
    checkQueue: 'Өз кезегіңізді тексеру', platePlaceholder: 'Мемлекеттік нөмір, мысалы 123ABC02', check: 'Тексеру',
    notFound: 'Белсенді кезек табылмады', lookupError: 'Нөмірді тексеру мүмкін болмады', checkpoint: 'Бекет', queueTime: 'Кезек уақыты',
    status: 'Күйі', cached: 'UrTruck кэшінен', live: 'нақты дерек', selected: 'Таңдалды', open: 'Ашу',
    statusInQueue: 'Кезекте', statusCalled: 'Өткізу бекетіне шақырылды', statusCrossed: 'Өткізу бекетінен өтті', statusRevoked: 'Рұқсат жойылды',
    statusPayment: 'Төлем күтілуде', statusNotPaid: 'Төленбеген', statusValidating: 'Тексерілуде', statusReviewFailed: 'Қосымша тексеру қажет', statusUnknown: 'Күйі белгісіз',
  },
  EN: {
    title: 'Border', subtitle: 'Real CGR load and booking availability', where: 'Where are you going?', all: 'All',
    choose: 'Choose checkpoint', hint: 'Swipe and tap a checkpoint — CGR data loads only for that checkpoint',
    tap: 'Tap a checkpoint to see the real situation', loading: 'Loading CGR data…', nearest: 'Nearest free booking',
    places: 'free slots', standard: '1 MCI', premium: '100 MCI', premiumNearest: 'Nearest 100 MCI booking',
    noStandard: 'No 1 MCI slots in the published calendar', board: 'On live board now', limit: 'Limit', perDay: '/day',
    calendar: 'Load calendar', noPlaces: 'No slots', dayOff: 'Day off', updated: 'CGR updated', refresh: 'Refresh', details: 'Open CGR',
    favorite: 'Favorite', favorited: 'Favorited', sourceError: 'Could not load CGR data. Try again.', checkQueue: 'Check your queue',
    platePlaceholder: 'Plate number, e.g. 123ABC02', check: 'Check', notFound: 'No active queue found', lookupError: 'Could not check plate',
    checkpoint: 'Checkpoint', queueTime: 'Queue time', status: 'Status', cached: 'UrTruck cache', live: 'live data', selected: 'Selected', open: 'Open',
    statusInQueue: 'In queue', statusCalled: 'Called to checkpoint', statusCrossed: 'Checkpoint crossed', statusRevoked: 'Pass revoked',
    statusPayment: 'Payment pending', statusNotPaid: 'Not paid', statusValidating: 'Validating', statusReviewFailed: 'Review required', statusUnknown: 'Status unknown',
  },
  ZH: {
    title: '边境', subtitle: 'CGR 实时负载与预约空位', where: '您要去哪里？', all: '全部', choose: '选择口岸',
    hint: '左右滑动并点击口岸 — 只加载所选口岸的 CGR 数据', tap: '点击口岸查看实时情况', loading: '正在获取 CGR 数据…',
    nearest: '最近可预约日期', places: '个空位', standard: '1 MCI', premium: '100 MCI', premiumNearest: '最近 100 MCI 预约',
    noStandard: '公开日历内暂无 1 MCI 空位', board: '当前电子屏', limit: '每日限额', perDay: '/天', calendar: '负载日历',
    noPlaces: '无空位', dayOff: '休息日', updated: 'CGR 更新时间', refresh: '刷新', details: '打开 CGR', favorite: '收藏',
    favorited: '已收藏', sourceError: '无法获取 CGR 数据，请重试。', checkQueue: '查询我的排队', platePlaceholder: '车牌号，例如 123ABC02',
    check: '查询', notFound: '未找到有效排队', lookupError: '无法查询车牌', checkpoint: '口岸', queueTime: '排队时间', status: '状态',
    cached: 'UrTruck 缓存', live: '实时数据', selected: '已选择', open: '查看',
    statusInQueue: '排队中', statusCalled: '已叫号，请前往口岸', statusCrossed: '已通过口岸', statusRevoked: '通行许可已撤销',
    statusPayment: '等待付款', statusNotPaid: '未付款', statusValidating: '审核中', statusReviewFailed: '需要复核', statusUnknown: '状态未知',
  },
};

function localizeCheckpointName(raw, lang) {
  const value = String(raw || '').trim();
  if (!value) return value;
  const parts = value.split(/\s+(?:-|–|—)\s+/).filter(Boolean);
  if (parts.length > 1) return parts.map((part) => localizePlace(part, lang)).join(' — ');
  return localizePlace(value, lang);
}

function localizedQueueStatus(lookup, L, lang) {
  const code = String(lookup?.status || '').trim().toLowerCase();
  const byCode = {
    in_queue: L.statusInQueue,
    called: L.statusCalled,
    crossed: L.statusCrossed,
    revoked: L.statusRevoked,
    payment: L.statusPayment,
    not_paid: L.statusNotPaid,
    validating: L.statusValidating,
    review_failed: L.statusReviewFailed,
  };
  if (byCode[code]) return byCode[code];
  if (lang === 'RU' && lookup?.status_raw) return String(lookup.status_raw);
  return L.statusUnknown;
}

function normalizePlate(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function jsonArray(raw) {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

async function fetchJson(url) {
  const res = await fetch(url);
  let body = {};
  try { body = await res.json(); } catch { body = {}; }
  if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`);
  return body;
}

function formatDate(iso, lang) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return iso;
  const locale = lang === 'KK' ? 'kk-KZ' : lang === 'EN' ? 'en-GB' : lang === 'ZH' ? 'zh-CN' : 'ru-RU';
  try { return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(d); } catch { return iso; }
}

function formatShortDate(iso, lang) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  const locale = lang === 'KK' ? 'kk-KZ' : lang === 'EN' ? 'en-GB' : lang === 'ZH' ? 'zh-CN' : 'ru-RU';
  try { return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(d); } catch { return iso; }
}

function formatSourceTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function QueueScreenLazy({ navigation, route }) {
  const { theme } = useTheme();
  const v1 = useV1Colors();
  const { lang } = useI18n();
  const L = COPY[lang] || COPY.RU;
  const role = route?.params?.role || 'driver';

  const [catalog, setCatalog] = useState([]);
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [selectedId, setSelectedId] = useState(null);
  const [liveById, setLiveById] = useState({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [plate, setPlate] = useState('');
  const [lookup, setLookup] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const checkpointCarouselRef = useRef(null);
  const checkpointCarouselX = useRef(0);

  const countryName = useCallback((code) => {
    const meta = COUNTRY[code] || { flag: '🌐', RU: code, KK: code, EN: code, ZH: code };
    return `${meta.flag || '🌐'} ${meta[lang] || meta.RU || code}`;
  }, [lang]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const data = await fetchJson(`${BASE}/catalog`);
      setCatalog(Array.isArray(data?.checkpoints) ? data.checkpoints : []);
      setCountries(Array.isArray(data?.countries) ? data.countries : []);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog().catch(() => setCatalogLoading(false));
    storage.get(FAVORITES_KEY).then((raw) => setFavorites(jsonArray(raw).map(String))).catch(() => {});
  }, [loadCatalog]);

  const countryCodes = useMemo(() => {
    const available = new Set(countries.map((c) => c.country).filter(Boolean));
    const ordered = COUNTRY_ORDER.filter((code) => available.has(code) || ['CN', 'KG', 'RU'].includes(code));
    for (const code of available) if (!ordered.includes(code)) ordered.push(code);
    return ordered;
  }, [countries]);

  const visible = useMemo(() => {
    const rows = selectedCountry === 'ALL' ? catalog : catalog.filter((c) => c.country === selectedCountry);
    return [...rows].sort((a, b) => {
      const af = favorites.includes(String(a.id)) ? 0 : 1;
      const bf = favorites.includes(String(b.id)) ? 0 : 1;
      if (af !== bf) return af - bf;
      return localizeCheckpointName(a.name, lang).localeCompare(localizeCheckpointName(b.name, lang));
    });
  }, [catalog, selectedCountry, favorites, lang]);

  const selected = useMemo(() => catalog.find((c) => String(c.id) === String(selectedId)) || null, [catalog, selectedId]);
  const live = selectedId ? liveById[String(selectedId)] : null;

  const loadLive = useCallback(async (checkpoint, force = false) => {
    if (!checkpoint || liveLoading) return;
    setSelectedId(checkpoint.id);
    setLiveLoading(true);
    setLiveError('');
    try {
      const data = await fetchJson(`${BASE}/live/${encodeURIComponent(checkpoint.id)}${force ? '?force=true' : ''}`);
      setLiveById((prev) => ({ ...prev, [String(checkpoint.id)]: data }));
    } catch {
      setLiveError(L.sourceError);
    } finally {
      setLiveLoading(false);
    }
  }, [liveLoading, L.sourceError]);

  const selectCountry = useCallback((code) => {
    setSelectedCountry(code);
    setSelectedId(null);
    setLiveError('');
    checkpointCarouselX.current = 0;
    checkpointCarouselRef.current?.scrollTo({ x: 0, animated: false });
  }, []);

  const scrollCheckpointCarousel = useCallback(() => {
    const nextX = checkpointCarouselX.current + 300;
    checkpointCarouselRef.current?.scrollTo({ x: nextX, animated: true });
    checkpointCarouselX.current = nextX;
  }, []);

  const toggleFavorite = useCallback(async () => {
    if (!selectedId) return;
    const id = String(selectedId);
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [id, ...favorites.filter((x) => x !== id)].slice(0, 12);
    setFavorites(next);
    await storage.set(FAVORITES_KEY, JSON.stringify(next));
  }, [selectedId, favorites]);

  const searchPlate = useCallback(async () => {
    const p = normalizePlate(plate);
    if (p.length < 3 || lookupLoading) return;
    setPlate(p);
    setLookupLoading(true);
    setLookup(null);
    try {
      const data = await fetchJson(`${BASE}/lookup?plate=${encodeURIComponent(p)}`);
      setLookup(data);
    } catch {
      setLookup({ error: true });
    } finally {
      setLookupLoading(false);
    }
  }, [plate, lookupLoading]);

  const nearestText = live?.nearest_booking ? formatDate(live.nearest_booking, lang) : '—';
  const nearestFree = live?.nearest_booking_free;
  const premiumText = live?.nearest_premium_booking ? formatDate(live.nearest_premium_booking, lang) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: v1.bg }]} edges={['top']}>
      <View style={[styles.topBar, { borderBottomColor: theme.border, backgroundColor: v1.bg }]}> 
        <View style={{ width: 42 }} />
        <Text style={[styles.topTitle, { color: theme.text }]} testID="queue-title">{L.title}</Text>
        <HeaderMenuButton navigation={navigation} role={role} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>{L.subtitle}</Text>

        <Text style={[styles.label, { color: theme.text }]}>{L.where}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} testID="border-country-filter">
          {countryCodes.map((code) => {
            const active = selectedCountry === code;
            return (
              <TouchableOpacity key={code} onPress={() => selectCountry(code)} style={[styles.countryChip, { borderColor: active ? '#168759' : theme.border, backgroundColor: active ? '#168759' : theme.card }]} testID={`border-country-${code}`}>
                <Text style={[styles.countryText, { color: active ? '#fff' : theme.text }]}>{countryName(code)}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={() => selectCountry('ALL')} style={[styles.countryChip, { borderColor: selectedCountry === 'ALL' ? '#168759' : theme.border, backgroundColor: selectedCountry === 'ALL' ? '#168759' : theme.card }]} testID="border-country-ALL">
            <Text style={[styles.countryText, { color: selectedCountry === 'ALL' ? '#fff' : theme.text }]}>🌐 {L.all}</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.selectorHead}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{L.choose}</Text>
            <Text style={[styles.hint, { color: theme.textDim }]}>{L.hint}</Text>
          </View>
          <TouchableOpacity onPress={scrollCheckpointCarousel} style={styles.carouselNext} accessibilityLabel={L.hint} testID="border-checkpoint-next">
            <Feather name="chevrons-right" size={21} color="#168759" />
          </TouchableOpacity>
        </View>

        {catalogLoading ? (
          <View style={styles.center}><ActivityIndicator color="#168759" /></View>
        ) : (
          <ScrollView
            ref={checkpointCarouselRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
            onScroll={(event) => { checkpointCarouselX.current = event.nativeEvent.contentOffset.x; }}
            scrollEventThrottle={16}
            testID="border-checkpoint-carousel"
          >
            {visible.map((cp) => {
              const active = String(selectedId) === String(cp.id);
              const loaded = liveById[String(cp.id)];
              return (
                <TouchableOpacity key={String(cp.id)} onPress={() => loadLive(cp)} activeOpacity={0.86} style={[styles.cpCard, { backgroundColor: theme.card, borderColor: active ? '#168759' : theme.border }, active && styles.cpCardActive]} testID="border-checkpoint-chip">
                  <View style={styles.cpTop}>
                    <Text style={[styles.cpName, { color: theme.text }]} numberOfLines={1}>{localizeCheckpointName(cp.name, lang).split(' — ')[0]}</Text>
                    {favorites.includes(String(cp.id)) ? <Feather name="star" size={14} color="#168759" fill="#168759" /> : null}
                  </View>
                  <Text style={[styles.cpRoute, { color: theme.textDim }]} numberOfLines={1}>{localizeCheckpointName(cp.name, lang)}</Text>
                  {loaded?.nearest_booking ? (
                    <View style={styles.cpLoadedRow}>
                      <Feather name="calendar" size={13} color="#168759" />
                      <Text style={styles.cpLoadedText}>{formatShortDate(loaded.nearest_booking, lang)}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.tapText, { color: active ? '#168759' : theme.textDim }]}>{active ? L.selected : L.open}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {!selected ? (
          <View style={[styles.promptCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-lazy-prompt">
            <View style={styles.promptIcon}><Feather name="mouse-pointer" size={20} color="#168759" /></View>
            <Text style={[styles.promptText, { color: theme.textMuted }]}>{L.tap}</Text>
          </View>
        ) : null}

        {selected && liveLoading && !live ? (
          <View style={[styles.liveCard, { backgroundColor: theme.card, borderColor: '#A7DCC3' }]} testID="border-live-loading">
            <ActivityIndicator color="#168759" size="large" />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>{L.loading}</Text>
          </View>
        ) : null}

        {selected && liveError ? (
          <View style={[styles.errorCard, { backgroundColor: theme.card, borderColor: '#F2C7C7' }]}>
            <Feather name="alert-circle" size={20} color="#B42318" />
            <Text style={[styles.errorText, { color: theme.textMuted }]}>{liveError}</Text>
            <TouchableOpacity onPress={() => loadLive(selected, true)}><Text style={styles.retry}>{L.refresh}</Text></TouchableOpacity>
          </View>
        ) : null}

        {selected && live ? (
          <View style={[styles.liveCard, { backgroundColor: theme.card, borderColor: '#9FD8BD' }]} testID="border-selected-card">
            <View style={styles.liveHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.liveTitle, { color: theme.text }]}>{localizeCheckpointName(live.name || selected.name, lang)}</Text>
                <Text style={[styles.liveCountry, { color: theme.textMuted }]}>{selected.country ? countryName(selected.country) : ''}</Text>
              </View>
              <TouchableOpacity onPress={toggleFavorite} style={[styles.iconButton, { borderColor: theme.border }]} accessibilityLabel={favorites.includes(String(selectedId)) ? L.favorited : L.favorite}>
                <Feather name="star" size={19} color="#168759" fill={favorites.includes(String(selectedId)) ? '#168759' : 'transparent'} />
              </TouchableOpacity>
            </View>

            <View style={styles.heroBooking}>
              <Text style={[styles.heroLabel, { color: theme.textMuted }]}>{L.nearest}</Text>
              <Text style={styles.heroDate}>{nearestText}</Text>
              {nearestFree != null ? (
                <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>{nearestFree} {L.places} · {L.standard}</Text></View>
              ) : <Text style={[styles.noBooking, { color: theme.textMuted }]}>{L.noStandard}</Text>}
            </View>

            {premiumText ? (
              <View style={[styles.premiumRow, { borderColor: theme.border }]}> 
                <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{L.premiumNearest}</Text>
                <Text style={[styles.premiumValue, { color: theme.text }]}>{premiumText} · {live.nearest_premium_free ?? '—'} {L.places}</Text>
              </View>
            ) : null}

            <View style={[styles.metrics, { borderColor: theme.border }]}> 
              <View style={[styles.metric, { borderRightColor: theme.border }]}> 
                <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{L.board}</Text>
                <Text style={[styles.metricValue, { color: theme.text }]}>{live.current_board_count ?? '—'}</Text>
              </View>
              <View style={styles.metric}>
                <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{L.limit}</Text>
                <Text style={[styles.metricValue, { color: theme.text }]}>{live.daily_capacity != null ? `${live.daily_capacity}${L.perDay}` : '—'}</Text>
              </View>
            </View>

            <View style={styles.calendarHead}>
              <Text style={[styles.sectionTitleSmall, { color: theme.text }]}>{L.calendar}</Text>
              <Text style={[styles.cacheText, { color: theme.textDim }]}>{live.cache_hit ? L.cached : L.live}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip} testID="border-booking-calendar">
              {(live.booking_calendar || []).slice(0, 31).map((d) => {
                const standardFree = d.standard_free || 0;
                const premiumFree = d.premium_free || 0;
                const hasStandard = standardFree > 0;
                const hasPremium = !hasStandard && premiumFree > 0;
                return (
                  <View key={d.date} style={[styles.dateCard, { borderColor: d.is_day_off ? theme.border : hasStandard ? '#70C49B' : hasPremium ? '#E4B35A' : '#E5B8B8', backgroundColor: d.is_day_off ? v1.bg : hasStandard ? '#F0FBF6' : hasPremium ? '#FFF8E8' : '#FFF7F7' }]}>
                    <Text style={[styles.dateText, { color: theme.text }]}>{formatShortDate(d.date, lang)}</Text>
                    {d.is_day_off ? (
                      <Text style={[styles.dateState, { color: theme.textDim }]}>{L.dayOff}</Text>
                    ) : hasStandard ? (
                      <><Text style={styles.dateFree}>{standardFree}</Text><Text style={[styles.dateState, { color: '#168759' }]}>{L.standard}</Text></>
                    ) : hasPremium ? (
                      <><Text style={styles.datePremium}>{premiumFree}</Text><Text style={[styles.dateState, { color: '#B7791F' }]}>{L.premium}</Text></>
                    ) : (
                      <Text style={[styles.dateState, { color: '#B42318' }]}>{L.noPlaces}</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.sourceRow}>
              <Text style={[styles.source, { color: theme.textDim }]}>{L.updated}: {formatSourceTime(live.source_updated_at || live.fetched_at)}</Text>
              <TouchableOpacity onPress={() => loadLive(selected, true)} disabled={liveLoading} style={styles.refreshButton}>
                {liveLoading ? <ActivityIndicator size="small" color="#168759" /> : <Feather name="refresh-cw" size={16} color="#168759" />}
                <Text style={styles.refreshText}>{L.refresh}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => Linking.openURL(live.official_url || 'https://cgr.qoldau.kz/ru/start').catch(() => {})} style={styles.cgrButton}>
              <Feather name="external-link" size={17} color="#fff" />
              <Text style={styles.cgrButtonText}>{L.details}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={[styles.searchCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-plate-search">
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{L.checkQueue}</Text>
          <View style={styles.searchRow}>
            <View style={[styles.inputWrap, { backgroundColor: v1.bg, borderColor: theme.border }]}> 
              <Feather name="truck" size={17} color={theme.textMuted} />
              <TextInput
                value={plate}
                onChangeText={(v) => { setPlate(v.toUpperCase()); setLookup(null); }}
                onSubmitEditing={searchPlate}
                placeholder={L.platePlaceholder}
                placeholderTextColor={theme.textDim}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.input, { color: theme.text }]}
                testID="border-plate-input"
              />
            </View>
            <TouchableOpacity onPress={searchPlate} disabled={normalizePlate(plate).length < 3 || lookupLoading} style={[styles.checkButton, (normalizePlate(plate).length < 3 || lookupLoading) && styles.disabled]} testID="border-plate-check">
              {lookupLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.checkText}>{L.check}</Text>}
            </TouchableOpacity>
          </View>
          {lookup ? (
            <View style={[styles.lookup, { borderTopColor: theme.border }]}> 
              {lookup.error ? <Text style={[styles.lookupText, { color: '#B42318' }]}>{L.lookupError}</Text> : lookup.found ? (
                <>
                  <Text style={[styles.lookupPlate, { color: theme.text }]}>{lookup.plate || normalizePlate(plate)}</Text>
                  {lookup.status_raw || lookup.status ? <Text style={[styles.lookupText, { color: theme.textMuted }]}>{L.status}: {localizedQueueStatus(lookup, L, lang)}</Text> : null}
                  {lookup.checkpoint ? <Text style={[styles.lookupText, { color: theme.textMuted }]}>{L.checkpoint}: {localizeCheckpointName(lookup.checkpoint, lang)}</Text> : null}
                  {lookup.queue_datetime ? <Text style={[styles.lookupText, { color: theme.textMuted }]}>{L.queueTime}: {lookup.queue_datetime}</Text> : null}
                </>
              ) : <Text style={[styles.lookupText, { color: theme.textMuted }]}>{L.notFound}</Text>}
            </View>
          ) : null}
        </View>
        <View style={{ height: 34 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { height: 56, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  topTitle: { fontSize: 20, fontWeight: '800' },
  content: { paddingHorizontal: 18, paddingTop: 15 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 18 },
  label: { fontSize: 15, fontWeight: '800', marginBottom: 9 },
  chips: { gap: 8, paddingRight: 18, paddingBottom: 5 },
  countryChip: { minHeight: 38, borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  countryText: { fontSize: 13, fontWeight: '700' },
  selectorHead: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10 },
  carouselNext: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF8F1' },
  sectionTitle: { fontSize: 17, fontWeight: '850' },
  sectionTitleSmall: { fontSize: 15, fontWeight: '850' },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 3, paddingRight: 12 },
  carousel: { gap: 10, paddingRight: 20, paddingBottom: 4 },
  cpCard: { width: 140, minHeight: 94, borderWidth: 1, borderRadius: 16, padding: 12 },
  cpCardActive: { borderWidth: 2, padding: 11, shadowColor: '#168759', shadowOpacity: 0.09, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  cpTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 5 },
  cpName: { fontSize: 15, fontWeight: '850', flex: 1 },
  cpRoute: { fontSize: 10.5, marginTop: 5 },
  cpLoadedRow: { flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: 11 },
  cpLoadedText: { color: '#168759', fontSize: 12, fontWeight: '800' },
  tapText: { fontSize: 11, fontWeight: '700', marginTop: 11 },
  center: { height: 100, alignItems: 'center', justifyContent: 'center' },
  promptCard: { borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  promptIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EAF8F1', alignItems: 'center', justifyContent: 'center' },
  promptText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '650' },
  liveCard: { borderWidth: 1, borderRadius: 20, padding: 17, marginTop: 16 },
  loadingText: { textAlign: 'center', marginTop: 10, fontSize: 13 },
  liveHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  liveTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900' },
  liveCountry: { fontSize: 13, marginTop: 4 },
  iconButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroBooking: { backgroundColor: '#F2FBF6', borderRadius: 16, padding: 16, marginTop: 15, alignItems: 'flex-start' },
  heroLabel: { fontSize: 12.5, fontWeight: '750' },
  heroDate: { color: '#126C49', fontSize: 31, lineHeight: 37, fontWeight: '950', marginTop: 4 },
  freeBadge: { backgroundColor: '#168759', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginTop: 9 },
  freeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  noBooking: { fontSize: 12, marginTop: 8 },
  premiumRow: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  premiumValue: { fontSize: 14, fontWeight: '800', marginTop: 3 },
  metrics: { flexDirection: 'row', borderWidth: 1, borderRadius: 15, overflow: 'hidden', marginTop: 12 },
  metric: { flex: 1, paddingVertical: 13, paddingHorizontal: 14, borderRightWidth: 0 },
  metricLabel: { fontSize: 11.5, fontWeight: '700' },
  metricValue: { fontSize: 22, fontWeight: '900', marginTop: 3 },
  calendarHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 17, marginBottom: 9 },
  cacheText: { fontSize: 10.5 },
  dateStrip: { gap: 8, paddingRight: 10 },
  dateCard: { width: 82, minHeight: 82, borderWidth: 1, borderRadius: 13, padding: 9, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: 12, fontWeight: '850' },
  dateFree: { color: '#168759', fontSize: 20, fontWeight: '950', marginTop: 5 },
  datePremium: { color: '#B7791F', fontSize: 20, fontWeight: '950', marginTop: 5 },
  dateState: { fontSize: 9.5, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15 },
  source: { fontSize: 11 },
  refreshButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  refreshText: { color: '#168759', fontWeight: '800', fontSize: 12 },
  cgrButton: { minHeight: 46, borderRadius: 14, backgroundColor: '#168759', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  cgrButtonText: { color: '#fff', fontSize: 14, fontWeight: '850' },
  errorCard: { borderWidth: 1, borderRadius: 16, marginTop: 16, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  retry: { color: '#168759', fontWeight: '850' },
  searchCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 18 },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  inputWrap: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, fontSize: 14, minHeight: 44 },
  checkButton: { minWidth: 94, minHeight: 46, borderRadius: 13, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 },
  checkText: { color: '#fff', fontSize: 13, fontWeight: '850' },
  disabled: { opacity: 0.45 },
  lookup: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12 },
  lookupPlate: { fontSize: 17, fontWeight: '900', marginBottom: 5 },
  lookupText: { fontSize: 12.5, lineHeight: 19 },
});
