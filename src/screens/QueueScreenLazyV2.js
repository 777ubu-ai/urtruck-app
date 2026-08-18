import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
    choose: 'Выберите КПП', hint: 'Листайте и нажмите нужный пункт — данные загрузятся только для него',
    tap: 'Нажмите на КПП, чтобы увидеть реальную обстановку', loading: 'Получаем данные CGR…',
    nearest: 'Ближайшая свободная бронь', places: 'свободных мест', standard: '1 МРП', premium: '100 МРП',
    premiumNearest: 'Ближайшая бронь за 100 МРП', noStandard: 'Свободных мест за 1 МРП в доступном календаре нет',
    board: 'Сейчас на табло', limit: 'Лимит', perDay: '/сутки', calendar: 'Календарь загрузки', noPlaces: 'Нет мест',
    dayOff: 'Выходной', updated: 'CGR обновлено', refresh: 'Обновить', details: 'Открыть CGR', favorite: 'В избранное',
    favorited: 'В избранном', sourceError: 'Не удалось получить данные CGR. Повторите.', checkQueue: 'Проверить свою очередь',
    platePlaceholder: 'Госномер, например 123ABC02', check: 'Проверить', notFound: 'Активная очередь не найдена',
    lookupError: 'Не удалось проверить номер', checkpoint: 'КПП', queueTime: 'Время очереди', status: 'Статус',
    cached: 'из кэша UrTruck', live: 'живые данные', selected: 'Выбрано', swipeCalendar: 'Листайте даты →',
  },
  KK: {
    title: 'Шекара', subtitle: 'CGR нақты жүктемесі және қолжетімді бронь', where: 'Қайда барасыз?', all: 'Барлығы',
    choose: 'Өткізу бекетін таңдаңыз', hint: 'Жылжытып, қажет бекетті басыңыз — деректер тек сол бекетке жүктеледі',
    tap: 'Нақты жағдайды көру үшін бекетті басыңыз', loading: 'CGR деректері жүктелуде…', nearest: 'Ең жақын бос бронь',
    places: 'бос орын', standard: '1 АЕК', premium: '100 АЕК', premiumNearest: '100 АЕК бойынша жақын бронь',
    noStandard: 'Қолжетімді күнтізбеде 1 АЕК бойынша бос орын жоқ', board: 'Қазір таблода', limit: 'Лимит', perDay: '/тәулік',
    calendar: 'Жүктеме күнтізбесі', noPlaces: 'Орын жоқ', dayOff: 'Демалыс', updated: 'CGR жаңартылды', refresh: 'Жаңарту',
    details: 'CGR ашу', favorite: 'Таңдаулыға', favorited: 'Таңдаулыда', sourceError: 'CGR деректерін алу мүмкін болмады.',
    checkQueue: 'Өз кезегіңізді тексеру', platePlaceholder: 'Мемлекеттік нөмір, мысалы 123ABC02', check: 'Тексеру',
    notFound: 'Белсенді кезек табылмады', lookupError: 'Нөмірді тексеру мүмкін болмады', checkpoint: 'Бекет', queueTime: 'Кезек уақыты',
    status: 'Күйі', cached: 'UrTruck кэшінен', live: 'нақты дерек', selected: 'Таңдалды', swipeCalendar: 'Күндерді жылжытыңыз →',
  },
  EN: {
    title: 'Border', subtitle: 'Real CGR load and booking availability', where: 'Where are you going?', all: 'All',
    choose: 'Choose checkpoint', hint: 'Swipe and tap a checkpoint — data loads only for that checkpoint',
    tap: 'Tap a checkpoint to see the real situation', loading: 'Loading CGR data…', nearest: 'Nearest free booking',
    places: 'free slots', standard: '1 MCI', premium: '100 MCI', premiumNearest: 'Nearest 100 MCI booking',
    noStandard: 'No 1 MCI slots in the published calendar', board: 'On live board now', limit: 'Limit', perDay: '/day',
    calendar: 'Load calendar', noPlaces: 'No slots', dayOff: 'Day off', updated: 'CGR updated', refresh: 'Refresh', details: 'Open CGR',
    favorite: 'Favorite', favorited: 'Favorited', sourceError: 'Could not load CGR data. Try again.', checkQueue: 'Check your queue',
    platePlaceholder: 'Plate number, e.g. 123ABC02', check: 'Check', notFound: 'No active queue found', lookupError: 'Could not check plate',
    checkpoint: 'Checkpoint', queueTime: 'Queue time', status: 'Status', cached: 'UrTruck cache', live: 'live data', selected: 'Selected',
    swipeCalendar: 'Swipe dates →',
  },
  ZH: {
    title: '边境', subtitle: 'CGR 实时负载与预约空位', where: '您要去哪里？', all: '全部', choose: '选择口岸',
    hint: '左右滑动并点击口岸 — 只加载所选口岸的数据', tap: '点击口岸查看实时情况', loading: '正在获取 CGR 数据…',
    nearest: '最近可预约日期', places: '个空位', standard: '1 MCI', premium: '100 MCI', premiumNearest: '最近 100 MCI 预约',
    noStandard: '公开日历内暂无 1 MCI 空位', board: '当前电子屏', limit: '每日限额', perDay: '/天', calendar: '负载日历',
    noPlaces: '无空位', dayOff: '休息日', updated: 'CGR 更新时间', refresh: '刷新', details: '打开 CGR', favorite: '收藏',
    favorited: '已收藏', sourceError: '无法获取 CGR 数据，请重试。', checkQueue: '查询我的排队', platePlaceholder: '车牌号，例如 123ABC02',
    check: '查询', notFound: '未找到有效排队', lookupError: '无法查询车牌', checkpoint: '口岸', queueTime: '排队时间', status: '状态',
    cached: 'UrTruck 缓存', live: '实时数据', selected: '已选择', swipeCalendar: '左右滑动日期 →',
  },
};

function normalizePlate(value) { return String(value || '').trim().toUpperCase().replace(/\s+/g, ''); }
function jsonArray(raw) { if (!raw) return []; try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
async function fetchJson(url) {
  const response = await fetch(url);
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.detail || `HTTP ${response.status}`);
  return body;
}
function localeFor(lang) { return lang === 'KK' ? 'kk-KZ' : lang === 'EN' ? 'en-GB' : lang === 'ZH' ? 'zh-CN' : 'ru-RU'; }
function formatDate(iso, lang) {
  if (!iso) return '—';
  const date = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return iso;
  try { return new Intl.DateTimeFormat(localeFor(lang), { day: 'numeric', month: 'long' }).format(date); } catch { return iso; }
}
function formatShortDate(iso, lang) {
  if (!iso) return '—';
  const date = new Date(`${iso}T12:00:00`);
  try { return new Intl.DateTimeFormat(localeFor(lang), { day: 'numeric', month: 'short' }).format(date); } catch { return iso; }
}
function formatSourceTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// The nearest booking fields are also official backend data. Defensively merge
// them into the horizontal calendar so the hero can never say "20 Sep" while
// the carousel visually ends on "17 Sep" because an upstream grid omitted a row.
export function completeBookingCalendar(live) {
  if (!live) return [];
  const byDate = new Map();
  for (const row of Array.isArray(live.booking_calendar) ? live.booking_calendar : []) {
    if (row?.date) byDate.set(row.date, { ...row });
  }
  if (live.nearest_booking && !byDate.has(live.nearest_booking)) {
    byDate.set(live.nearest_booking, {
      date: live.nearest_booking,
      standard_free: live.nearest_booking_free ?? null,
      premium_free: null,
      is_day_off: false,
    });
  }
  if (live.nearest_premium_booking) {
    const current = byDate.get(live.nearest_premium_booking) || {
      date: live.nearest_premium_booking, standard_free: null, premium_free: null, is_day_off: false,
    };
    if (current.premium_free == null) current.premium_free = live.nearest_premium_free ?? null;
    byDate.set(live.nearest_premium_booking, current);
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 31);
}

export default function QueueScreenLazyV2({ navigation, route }) {
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
    } finally { setCatalogLoading(false); }
  }, []);

  useEffect(() => {
    loadCatalog().catch(() => setCatalogLoading(false));
    storage.get(FAVORITES_KEY).then((raw) => setFavorites(jsonArray(raw).map(String))).catch(() => {});
  }, [loadCatalog]);

  const countryCodes = useMemo(() => {
    const available = new Set(countries.map((item) => item.country).filter(Boolean));
    const ordered = COUNTRY_ORDER.filter((code) => available.has(code) || ['CN', 'KG', 'RU'].includes(code));
    for (const code of available) if (!ordered.includes(code)) ordered.push(code);
    return ordered;
  }, [countries]);

  const visible = useMemo(() => {
    const rows = selectedCountry === 'ALL' ? catalog : catalog.filter((item) => item.country === selectedCountry);
    return [...rows].sort((a, b) => {
      const af = favorites.includes(String(a.id)) ? 0 : 1;
      const bf = favorites.includes(String(b.id)) ? 0 : 1;
      return af !== bf ? af - bf : String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    });
  }, [catalog, selectedCountry, favorites]);

  const selected = useMemo(() => catalog.find((item) => String(item.id) === String(selectedId)) || null, [catalog, selectedId]);
  const live = selectedId ? liveById[String(selectedId)] : null;
  const calendarRows = useMemo(() => completeBookingCalendar(live), [live]);

  const loadLive = useCallback(async (checkpoint, force = false) => {
    if (!checkpoint || liveLoading) return;
    setSelectedId(checkpoint.id);
    setLiveLoading(true);
    setLiveError('');
    try {
      const data = await fetchJson(`${BASE}/live/${encodeURIComponent(checkpoint.id)}${force ? '?force=true' : ''}`);
      setLiveById((previous) => ({ ...previous, [String(checkpoint.id)]: data }));
    } catch { setLiveError(L.sourceError); }
    finally { setLiveLoading(false); }
  }, [liveLoading, L.sourceError]);

  const selectCountry = useCallback((code) => {
    setSelectedCountry(code);
    setSelectedId(null);
    setLiveError('');
    checkpointCarouselX.current = 0;
    checkpointCarouselRef.current?.scrollTo({ x: 0, animated: false });
  }, []);

  const toggleFavorite = useCallback(async () => {
    if (!selectedId) return;
    const id = String(selectedId);
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [id, ...favorites.filter((value) => value !== id)].slice(0, 12);
    setFavorites(next);
    await storage.set(FAVORITES_KEY, JSON.stringify(next));
  }, [selectedId, favorites]);

  const searchPlate = useCallback(async () => {
    const normalized = normalizePlate(plate);
    if (normalized.length < 3 || lookupLoading) return;
    setPlate(normalized);
    setLookupLoading(true);
    setLookup(null);
    try { setLookup(await fetchJson(`${BASE}/lookup?plate=${encodeURIComponent(normalized)}`)); }
    catch { setLookup({ error: true }); }
    finally { setLookupLoading(false); }
  }, [plate, lookupLoading]);

  const nearestText = live?.nearest_booking ? formatDate(live.nearest_booking, lang) : '—';
  const premiumText = live?.nearest_premium_booking ? formatDate(live.nearest_premium_booking, lang) : null;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: v1.bg }]} edges={['top']} testID="border-screen-v2">
      <View style={[s.topBar, { borderBottomColor: theme.border, backgroundColor: v1.bg }]}> 
        <View style={{ width: 42 }} />
        <Text style={[s.topTitle, { color: theme.text }]} testID="queue-title">{L.title}</Text>
        <HeaderMenuButton navigation={navigation} role={role} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        <Text style={[s.subtitle, { color: theme.textMuted }]}>{L.subtitle}</Text>
        <Text style={[s.label, { color: theme.text }]}>{L.where}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} testID="border-country-filter">
          {countryCodes.map((code) => {
            const active = selectedCountry === code;
            return (
              <TouchableOpacity key={code} onPress={() => selectCountry(code)} style={[s.countryChip, { borderColor: active ? '#168759' : theme.border, backgroundColor: active ? '#168759' : theme.card }]} testID={`border-country-${code}`}>
                <Text style={[s.countryText, { color: active ? '#FFFFFF' : theme.text }]}>{countryName(code)}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={() => selectCountry('ALL')} style={[s.countryChip, { borderColor: selectedCountry === 'ALL' ? '#168759' : theme.border, backgroundColor: selectedCountry === 'ALL' ? '#168759' : theme.card }]} testID="border-country-ALL">
            <Text style={[s.countryText, { color: selectedCountry === 'ALL' ? '#FFFFFF' : theme.text }]}>🌐 {L.all}</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={s.selectorHead}>
          <View style={{ flex: 1 }}><Text style={[s.sectionTitle, { color: theme.text }]}>{L.choose}</Text><Text style={[s.hint, { color: theme.textDim }]}>{L.hint}</Text></View>
          <TouchableOpacity onPress={() => {
            const next = checkpointCarouselX.current + 300;
            checkpointCarouselRef.current?.scrollTo({ x: next, animated: true });
            checkpointCarouselX.current = next;
          }} style={s.carouselNext} testID="border-checkpoint-next"><Feather name="chevrons-right" size={21} color="#168759" /></TouchableOpacity>
        </View>

        {catalogLoading ? <View style={s.center}><ActivityIndicator color="#168759" /></View> : (
          <ScrollView ref={checkpointCarouselRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.carousel} onScroll={(event) => { checkpointCarouselX.current = event.nativeEvent.contentOffset.x; }} scrollEventThrottle={16} testID="border-checkpoint-carousel">
            {visible.map((checkpoint) => {
              const active = String(selectedId) === String(checkpoint.id);
              const loaded = liveById[String(checkpoint.id)];
              return (
                <TouchableOpacity key={String(checkpoint.id)} onPress={() => loadLive(checkpoint)} style={[s.cpCard, { backgroundColor: theme.card, borderColor: active ? '#168759' : theme.border }, active && s.cpCardActive]} testID="border-checkpoint-chip">
                  <View style={s.cpTop}><Text style={[s.cpName, { color: theme.text }]} numberOfLines={1}>{String(checkpoint.name || '').split(' - ')[0]}</Text>{favorites.includes(String(checkpoint.id)) ? <Feather name="star" size={14} color="#168759" fill="#168759" /> : null}</View>
                  <Text style={[s.cpRoute, { color: theme.textDim }]} numberOfLines={1}>{checkpoint.name}</Text>
                  {loaded?.nearest_booking ? <Text style={s.cpLoadedText}>📅 {formatShortDate(loaded.nearest_booking, lang)}</Text> : <Text style={[s.tapText, { color: active ? '#168759' : theme.textDim }]}>{active ? L.selected : 'Нажать'}</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {!selected ? <View style={[s.promptCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-lazy-prompt"><Feather name="mouse-pointer" size={20} color="#168759" /><Text style={[s.promptText, { color: theme.textMuted }]}>{L.tap}</Text></View> : null}
        {selected && liveLoading && !live ? <View style={[s.liveCard, { backgroundColor: theme.card, borderColor: '#A7DCC3' }]} testID="border-live-loading"><ActivityIndicator color="#168759" size="large" /><Text style={[s.loadingText, { color: theme.textMuted }]}>{L.loading}</Text></View> : null}
        {selected && liveError ? <View style={[s.errorCard, { backgroundColor: theme.card }]}><Feather name="alert-circle" size={20} color="#B42318" /><Text style={[s.errorText, { color: theme.textMuted }]}>{liveError}</Text><TouchableOpacity onPress={() => loadLive(selected, true)}><Text style={s.retry}>{L.refresh}</Text></TouchableOpacity></View> : null}

        {selected && live ? (
          <View style={[s.liveCard, { backgroundColor: theme.card, borderColor: '#9FD8BD' }]} testID="border-selected-card">
            <View style={s.liveHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}><Text style={[s.liveTitle, { color: theme.text }]}>{live.name || selected.name}</Text><Text style={[s.liveCountry, { color: theme.textMuted }]}>{selected.country ? countryName(selected.country) : ''}</Text></View>
              <TouchableOpacity onPress={toggleFavorite} style={[s.iconButton, { borderColor: theme.border }]}><Feather name="star" size={19} color="#168759" fill={favorites.includes(String(selectedId)) ? '#168759' : 'transparent'} /></TouchableOpacity>
            </View>

            <View style={s.heroBooking}>
              <Text style={[s.heroLabel, { color: theme.textMuted }]}>{L.nearest}</Text>
              <Text style={s.heroDate}>{nearestText}</Text>
              {live.nearest_booking_free != null ? <View style={s.freeBadge}><Text style={s.freeBadgeText}>{live.nearest_booking_free} {L.places} · {L.standard}</Text></View> : <Text style={[s.noBooking, { color: theme.textMuted }]}>{L.noStandard}</Text>}
            </View>

            {premiumText ? <View style={[s.premiumRow, { borderColor: theme.border }]}><Text style={[s.metricLabel, { color: theme.textMuted }]}>{L.premiumNearest}</Text><Text style={[s.premiumValue, { color: theme.text }]}>{premiumText} · {live.nearest_premium_free ?? '—'} {L.places}</Text></View> : null}

            <View style={[s.metrics, { borderColor: theme.border }]}>
              <View style={s.metric}><Text style={[s.metricLabel, { color: theme.textMuted }]}>{L.board}</Text><Text style={[s.metricValue, { color: theme.text }]}>{live.current_board_count ?? '—'}</Text></View>
              <View style={[s.metricDivider, { backgroundColor: theme.border }]} />
              <View style={s.metric}><Text style={[s.metricLabel, { color: theme.textMuted }]}>{L.limit}</Text><Text style={[s.metricValue, { color: theme.text }]}>{live.daily_capacity != null ? `${live.daily_capacity}${L.perDay}` : '—'}</Text></View>
            </View>

            <View style={s.calendarHead}><Text style={[s.sectionTitleSmall, { color: theme.text }]}>{L.calendar}</Text><Text style={[s.swipeHint, { color: theme.textDim }]}>{L.swipeCalendar}</Text></View>
            <FlatList
              horizontal
              data={calendarRows}
              keyExtractor={(item) => item.date}
              renderItem={({ item }) => {
                const standardFree = Number(item.standard_free || 0);
                const premiumFree = Number(item.premium_free || 0);
                const hasStandard = standardFree > 0;
                const hasPremium = !hasStandard && premiumFree > 0;
                return (
                  <View style={[s.dateCard, { borderColor: item.is_day_off ? theme.border : hasStandard ? '#70C49B' : hasPremium ? '#E4B35A' : '#E5B8B8', backgroundColor: item.is_day_off ? v1.bg : hasStandard ? '#F0FBF6' : hasPremium ? '#FFF8E8' : '#FFF7F7' }]} testID="border-booking-date-card">
                    <Text style={[s.dateText, { color: theme.text }]}>{formatShortDate(item.date, lang)}</Text>
                    {item.is_day_off ? <Text style={[s.dateState, { color: theme.textDim }]}>{L.dayOff}</Text> : hasStandard ? <><Text style={s.dateFree}>{standardFree}</Text><Text style={[s.dateState, { color: '#168759' }]}>{L.standard}</Text></> : hasPremium ? <><Text style={s.datePremium}>{premiumFree}</Text><Text style={[s.dateState, { color: '#B7791F' }]}>{L.premium}</Text></> : <Text style={[s.dateState, { color: '#B42318' }]}>{L.noPlaces}</Text>}
                  </View>
                );
              }}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.dateStrip}
              ListFooterComponent={<View style={{ width: 30 }} />}
              nestedScrollEnabled
              directionalLockEnabled
              removeClippedSubviews={false}
              initialNumToRender={12}
              windowSize={15}
              style={s.calendarList}
              testID="border-booking-calendar"
            />

            <View style={s.sourceRow}><Text style={[s.source, { color: theme.textDim }]}>{L.updated}: {formatSourceTime(live.source_updated_at || live.fetched_at)}</Text><TouchableOpacity onPress={() => loadLive(selected, true)} disabled={liveLoading} style={s.refreshButton}>{liveLoading ? <ActivityIndicator size="small" color="#168759" /> : <Feather name="refresh-cw" size={16} color="#168759" />}<Text style={s.refreshText}>{L.refresh}</Text></TouchableOpacity></View>
            <TouchableOpacity onPress={() => Linking.openURL(live.official_url || 'https://cgr.qoldau.kz/ru/start').catch(() => {})} style={s.cgrButton}><Feather name="external-link" size={17} color="#FFFFFF" /><Text style={s.cgrButtonText}>{L.details}</Text></TouchableOpacity>
          </View>
        ) : null}

        <View style={[s.searchCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="border-plate-search">
          <Text style={[s.sectionTitle, { color: theme.text }]}>{L.checkQueue}</Text>
          <View style={s.searchRow}><View style={[s.inputWrap, { backgroundColor: v1.bg, borderColor: theme.border }]}><Feather name="truck" size={17} color={theme.textMuted} /><TextInput value={plate} onChangeText={(value) => { setPlate(value.toUpperCase()); setLookup(null); }} onSubmitEditing={searchPlate} placeholder={L.platePlaceholder} placeholderTextColor={theme.textDim} autoCapitalize="characters" autoCorrect={false} style={[s.input, { color: theme.text }]} testID="border-plate-input" /></View><TouchableOpacity onPress={searchPlate} disabled={normalizePlate(plate).length < 3 || lookupLoading} style={[s.checkButton, (normalizePlate(plate).length < 3 || lookupLoading) && s.disabled]} testID="border-plate-check">{lookupLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.checkText}>{L.check}</Text>}</TouchableOpacity></View>
          {lookup ? <View style={[s.lookup, { borderTopColor: theme.border }]}>{lookup.error ? <Text style={[s.lookupText, { color: '#B42318' }]}>{L.lookupError}</Text> : lookup.found ? <><Text style={[s.lookupPlate, { color: theme.text }]}>{lookup.plate || normalizePlate(plate)}</Text>{lookup.status_raw || lookup.status ? <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.status}: {lookup.status_raw || lookup.status}</Text> : null}{lookup.checkpoint ? <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.checkpoint}: {lookup.checkpoint}</Text> : null}{lookup.queue_datetime ? <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.queueTime}: {lookup.queue_datetime}</Text> : null}</> : <Text style={[s.lookupText, { color: theme.textMuted }]}>{L.notFound}</Text>}</View> : null}
        </View>
        <View style={{ height: 34 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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
  sectionTitle: { fontSize: 17, fontWeight: '850' },
  sectionTitleSmall: { fontSize: 15, fontWeight: '850' },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 3, paddingRight: 12 },
  carouselNext: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF8F1' },
  carousel: { gap: 10, paddingRight: 28, paddingBottom: 4 },
  cpCard: { width: 140, minHeight: 94, borderWidth: 1, borderRadius: 16, padding: 12 },
  cpCardActive: { borderWidth: 2, padding: 11, shadowColor: '#168759', shadowOpacity: 0.09, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  cpTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 5 },
  cpName: { fontSize: 15, fontWeight: '850', flex: 1 },
  cpRoute: { fontSize: 10.5, marginTop: 5 },
  cpLoadedText: { color: '#168759', fontSize: 12, fontWeight: '800', marginTop: 10 },
  tapText: { fontSize: 11, fontWeight: '700', marginTop: 11 },
  center: { height: 100, alignItems: 'center', justifyContent: 'center' },
  promptCard: { borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  promptText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '650' },
  liveCard: { borderWidth: 1, borderRadius: 20, padding: 17, marginTop: 16, overflow: 'hidden' },
  loadingText: { textAlign: 'center', marginTop: 10, fontSize: 13 },
  liveHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  liveTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900' },
  liveCountry: { fontSize: 13, marginTop: 4 },
  iconButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroBooking: { backgroundColor: '#F2FBF6', borderRadius: 16, padding: 16, marginTop: 15, alignItems: 'flex-start' },
  heroLabel: { fontSize: 12.5, fontWeight: '750' },
  heroDate: { color: '#126C49', fontSize: 31, lineHeight: 37, fontWeight: '950', marginTop: 4 },
  freeBadge: { backgroundColor: '#168759', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginTop: 9 },
  freeBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  noBooking: { fontSize: 12, marginTop: 8 },
  premiumRow: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  premiumValue: { fontSize: 14, fontWeight: '800', marginTop: 3 },
  metrics: { flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderRadius: 15, marginTop: 12, overflow: 'hidden' },
  metric: { flex: 1, paddingVertical: 13, paddingHorizontal: 14 },
  metricDivider: { width: 1 },
  metricLabel: { fontSize: 11.5, fontWeight: '700' },
  metricValue: { fontSize: 22, fontWeight: '900', marginTop: 3 },
  calendarHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 17, marginBottom: 9 },
  swipeHint: { fontSize: 10.5, fontWeight: '650' },
  calendarList: { width: '100%', overflow: 'visible' },
  dateStrip: { gap: 8, paddingRight: 4, paddingBottom: 4 },
  dateCard: { width: 90, minHeight: 88, borderWidth: 1, borderRadius: 13, padding: 9, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: 12, fontWeight: '850' },
  dateFree: { color: '#168759', fontSize: 20, fontWeight: '950', marginTop: 5 },
  datePremium: { color: '#B7791F', fontSize: 20, fontWeight: '950', marginTop: 5 },
  dateState: { fontSize: 9.5, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15 },
  source: { fontSize: 11 },
  refreshButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  refreshText: { color: '#168759', fontWeight: '800', fontSize: 12 },
  cgrButton: { minHeight: 46, borderRadius: 14, backgroundColor: '#168759', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  cgrButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '850' },
  errorCard: { borderWidth: 1, borderColor: '#F2C7C7', borderRadius: 16, marginTop: 16, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  retry: { color: '#168759', fontWeight: '850' },
  searchCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 18 },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  inputWrap: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, fontSize: 14, minHeight: 44 },
  checkButton: { minWidth: 94, minHeight: 46, borderRadius: 13, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 },
  checkText: { color: '#FFFFFF', fontSize: 13, fontWeight: '850' },
  disabled: { opacity: 0.45 },
  lookup: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12 },
  lookupPlate: { fontSize: 17, fontWeight: '900', marginBottom: 5 },
  lookupText: { fontSize: 12.5, lineHeight: 19 },
});