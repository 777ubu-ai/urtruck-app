import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, RefreshControl, ScrollView } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useI18n } from '../utils/useI18n';
import { formatBids, formatStatus, formatTruckType, t as tGlobal } from '../utils/i18n';
import { useTheme } from '../utils/ThemeContext';
import { getCargos, getUnreadNotifications, subscribe } from '../utils/store';
import { marketAPI } from '../utils/marketAPI';
import { useToast } from '../components/Toast';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS, useAuth } from '../utils/AuthContext';
import { SkeletonCard } from '../components/Skeleton';
import { normalizeTrip, formatPrice, sanitizeForDisplay } from '../utils/normalizers';
import { localizePlace } from '../utils/places';
import { routeStats } from '../utils/geo';
import { matchTruckTypes } from '../utils/truckSynonyms';
import FeedCard from '../components/ui/v1/FeedCard';
import SearchBar from '../components/ui/v1/SearchBar';
import FilterChips from '../components/ui/v1/FilterChips';
import LanguageSwitcher from '../components/LanguageSwitcher';
import PressableScale from '../components/PressableScale';
import { useMountedRef } from '../hooks/useMountedRef';
import BottomSheet from '../components/ui/v1/BottomSheet';
import DatePicker from '../components/DatePicker';
import LocationPickerModal from '../components/LocationPickerModal';
import { v1Colors, v1AccentFor, useV1Colors } from '../theme/designV1';
import { storage } from '../utils/storage';

// DD.MM.YYYY ↔ YYYY-MM-DD bridges. DatePicker stores DD.MM.YYYY
// (matches CreateCargo / CreateTrip and the rest of the app); the
// public-feed filter compares against ISO strings on items.pickup or
// items.departure, so we convert at the boundary.
const ddmmToIso = (s) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

const TCOLORS = {
  // Brand v3: tent (default truck) maps to brand emerald. ref/izoterm keep
  // teal/cyan because those are *semantic* refrigeration cues, not UI blue.
  tent: '#22C55E', ref: '#0891B2', platform: '#E06D00', auto: '#7C3AED', izoterm: '#059669',
  cont20: '#6366F1', cont40: '#4338CA', jumbo: '#EC4899', mega: '#DB2777',
  curtain: '#8B5CF6', lowloader: '#F97316', tanker: '#10B981', dumptruck: '#EAB308',
  grain: '#CA8A04', livestock: '#84CC16', logger: '#65A30D', hazmat: '#DC2626',
  open_truck: '#334155', closed: '#475569', longliner: '#7C3AED', microvan: '#64748B',
};
const TRUCK_KEYS = ['tent', 'ref', 'platform', 'auto', 'izoterm', 'cont20', 'cont40', 'jumbo', 'mega', 'curtain', 'lowloader', 'tanker', 'dumptruck', 'grain', 'livestock', 'logger', 'hazmat', 'open_truck', 'closed', 'longliner', 'microvan'];
const TRUCK_ICONS = {
  tent: '🚚', ref: '🧊', platform: '🛻', auto: '🚗', izoterm: '❄️',
  cont20: '📦', cont40: '📦', jumbo: '🚛', mega: '🚛',
  curtain: '🚛', lowloader: '🏗️', tanker: '🛢️', dumptruck: '🚜',
  grain: '🌾', livestock: '🐄', logger: '🪵', hazmat: '☢️',
  open_truck: '🚚', closed: '🚐', longliner: '🚛', microvan: '🚐',
};
const FLAGS = { KZ: '🇰🇿', UZ: '🇺🇿', RU: '🇷🇺', KG: '🇰🇬', CN: '🇨🇳', TJ: '🇹🇯', TR: '🇹🇷', TM: '🇹🇲', MN: '🇲🇳', DE: '🇩🇪', FR: '🇫🇷' };

// HOT-003: фильтр технического мусора из БД (остатки парсеров, init_db, стектрейсы)
const TRASH_PATTERNS = /init_db|phone_formatter|json_merger|bin_iin|SQL|sqlite|traceback|\bError:|File "[^"]+\.py"|line \d+|^```|stderr|\.py\b|SELECT |INSERT |UPDATE |DELETE |CREATE TABLE/gi;
// Stage 9: combine the legacy "tech-stack leak" filter with the new
// QA-marker scrub from normalizers, so a single helper hides both
// classes of garbage from public cards.
const sanitizeDesc = (s) => {
  if (!s) return tGlobal('desc_not_specified');
  const stage1 = String(s).replace(TRASH_PATTERNS, ' ');
  const stage2 = sanitizeForDisplay(stage1);
  return stage2 && stage2.length > 0
    ? stage2.slice(0, 200)
    : tGlobal('desc_not_specified');
};

// Pilot cleanup: removed hardcoded demo DRIVERS fallback. Public feed must
// only show server-returned drivers/trips; without records show empty state.
const DRIVERS = [];

export default function FeedScreen({ navigation, route }) {
  // Theme-aware tokens — used both inside the memoised stylesheet below
  // and at JSX inline overrides further down. Must be declared before
  // the stylesheet so React.useMemo's dependency [v1] resolves.
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  container: { flex: 1 },
  // v1 brand bar (UrTruck + FTL pill + bell). Replaces the old `header`
  // gradient title, which combined too many call-sites and mixed brand
  // hierarchy with action CTA.
  brandBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6,
  },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  brandText: { color: v1.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  ftlPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  ftlText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  bellBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: v1.surface },
  bellIcon: { fontSize: 18 },
  menuBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // Stage 45 guest toggle bar
  // RC2 fix: guestTabs/guestTab/guestTabText удалены вместе с
  // guestRole-toggle (см. JSX выше).
  // Title row with outline CTA on the right (macros 07/08).
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 12 },
  routeSelector: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, borderWidth: 1.5, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  routeSelHalf: { flex: 1 },
  routeSelLabel: { fontSize: 11, fontWeight: '700', marginBottom: 3, letterSpacing: 0.3 },
  routeSelValue: { fontSize: 15, fontWeight: '800' },
  routeSelArrow: { fontSize: 20, fontWeight: '900' },
  routeSelClear: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  titleHero: { color: v1.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  titleHeroSub: { color: v1.textMuted, fontSize: 11, marginTop: 2 },
  titleCta: { borderWidth: 0, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, shadowColor: '#FF8400', shadowOpacity: 0, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 0 },
  viewToggle: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: v1.border },
  titleCtaText: { fontSize: 13, fontWeight: '700' },
  footerNote: {
    marginTop: 16, marginBottom: 8,
    borderWidth: 1, borderRadius: 10,
    padding: 12,
    backgroundColor: v1.surface,
  },
  footerNoteText: { color: v1.textMuted, fontSize: 12, lineHeight: 17 },
  refreshBtn: { marginTop: 16, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  // Old layout helpers kept for the still-existing publish modal below.
  betaBar: { backgroundColor: '#FF8400', paddingVertical: 6, paddingHorizontal: 14, alignItems: 'center' },
  betaBarText: { color: '#0C0A09', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8, gap: 8 },
  title: { fontSize: 22, fontWeight: '900' },
  subtitle: { fontSize: 12 },
  actionBtn: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  actionBtnText: { fontSize: 12, fontWeight: '800' },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 10 },
  searchInput: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1 },
  clearBtn: { paddingHorizontal: 8 },
  saveRouteBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 4 },
  saveRouteFull: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14, minHeight: 44, justifyContent: 'center' },
  saveRouteFullText: { fontSize: 13, fontWeight: '700' },
  filterBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  activeChipsRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 6, alignItems: 'center' },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, maxWidth: 220 },
  activeChipText: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  activeChipClose: { color: '#fff', fontSize: 13, fontWeight: '800', marginLeft: 2 },
  filterSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40, maxHeight: '80%' },
  filterSheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  filterSectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  filterPillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', rowGap: 8 },
  filterPillWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', rowGap: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
  filterPillText: { fontSize: 12, fontWeight: '700' },
  filterInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 14 },
  filterActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  filterActionBtn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  filterActionText: { fontSize: 13, fontWeight: '700' },
  card: { borderRadius: 14, padding: 16, borderWidth: 1, borderColor: v1.border, backgroundColor: v1.surface },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  route: { fontSize: 17, fontWeight: '700', marginBottom: 5, letterSpacing: -0.2, color: v1.text },
  cargoName: { fontSize: 12, marginBottom: 8 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 16, fontSize: 11, fontWeight: '700', overflow: 'hidden' },
  price: { color: '#168A5B', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  bidsCount: { fontSize: 11, marginTop: 2 },
  driverName: { fontSize: 16, fontWeight: '700' },
  rating: { color: '#FBBF24', fontSize: 12, fontWeight: '700', marginVertical: 4 },
  tripBadge: { position: 'absolute', top: -1, right: 12, backgroundColor: '#168A5B', paddingHorizontal: 10, paddingVertical: 3, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  tripBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  mineBadge: { position: 'absolute', top: -1, right: 12, paddingHorizontal: 10, paddingVertical: 3, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  mineBadgeText: { color: '#0C0A09', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  quickChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  quickChipText: { fontSize: 11, fontWeight: '700' },
  tripRoute: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  tripDates: { fontSize: 11, marginTop: 2 },
  cargoPreview: { width: '100%', height: 140, borderRadius: 10, marginTop: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#44403C', alignSelf: 'center', marginBottom: 18 },
  formTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  fi: { borderRadius: 12, padding: 14, fontSize: 14, borderWidth: 1, marginBottom: 10 },
  frow: { flexDirection: 'row', gap: 8 },
  formLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6, marginTop: 4, textTransform: 'uppercase' },
  hintBox: { backgroundColor: '#22C55E15', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#22C55E30' },
  hintText: { fontSize: 11, lineHeight: 16 },
  typeCard: { width: 88, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 4 },
  typeCardText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  currChip: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  currChipText: { fontSize: 12, fontWeight: '700' },
  payModeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  payModeText: { fontSize: 13, fontWeight: '700' },
  fieldError: { color: '#EF4444', fontSize: 11, marginTop: -6, marginBottom: 8, fontWeight: '600' },
  photoPicker: { borderRadius: 14, padding: 20, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, minHeight: 120 },
  photoImg: { width: '100%', height: 140, borderRadius: 10 },
  photoText: { fontSize: 13, fontWeight: '600' },
  submitBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  }), [v1]);
  // RC2 fix (14 May): убран guestRole-toggle «Грузы/Рейсы» в шапке.
  // Гость и авторизованный юзер видят ленту по своей роли — без
  // segmented control в header. Если гость зашёл через "Смотреть
  // грузы без регистрации" — role='driver' (lookup-cargos view).
  // Авторизованный — session.user.role.
  const { session } = useAuth();
  const sessionRole = session?.user?.role || null;
  const isGuest = !sessionRole;
  // Гость по умолчанию = грузовладелец (client, оранжевый). Совпадает с
  // MainTabs и точками входа гостя (OnboardingV2 / RoleScreen).
  const role = sessionRole || route.params?.role || 'client';
  const isDriver = role === 'driver';
  // Brand v3: driver = emerald, client = orange. No blue.
  const accent = '#168A5B'; // redesign: единый зелёный для обеих ролей
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const myUserId = session?.user?.id;
  const listRef = React.useRef(null);
  const [, setTick] = useState(0);
  // showForm removed — publish flow now lives in CreateTripScreen / CreateCargoScreen.
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState(null);
  const [minRating, setMinRating] = useState(0); // 0 = все, 4 = 4★+, 5 = только 5★
  const [initialLoading, setInitialLoading] = useState(true);
  const mounted = useMountedRef();  // QA-аудит P1-8
  const [serverData, setServerData] = useState([]);
  // 3.7: пагинация ленты. onEndReached увеличивает лимит и перезагружает
  // (без append-логики — refetch заменяет данные, проще и без дублей).
  const [pageLimit, setPageLimit] = useState(50);
  const [sortBy, setSortBy] = useState('newest');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Избранные перевозчики (клиент) — id водителей. Быстрое сохранение из ленты.
  const [favIds, setFavIds] = useState(() => new Set());
  // activeFilter is the chip that's currently expanded into a bottom-sheet.
  // null → no sheet open. One sheet at a time, scoped to its own state slice.
  const [activeFilter, setActiveFilter] = useState(null); // 'dir' | 'date' | 'body' | 'price' | null
  const [dirFrom, setDirFrom] = useState('');
  const [dirTo, setDirTo] = useState('');
  // Полноэкранный выбор города (как в CreateCargo) вместо тесной шторки со
  // свободным вводом — можно искать любой город/погранпереход, а не только
  // те, что уже попали в ленту.
  const [showDirFromPicker, setShowDirFromPicker] = useState(false);
  const [showDirToPicker, setShowDirToPicker] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const closeFilter = () => setActiveFilter(null);

  // Вид ленты: компактный список (по умолчанию, помещается 5-6 карточек) ↔
  // крупные карточки. Выбор пользователя, запоминаем в storage.
  const [compact, setCompact] = useState(true);
  useEffect(() => {
    storage.get('ur_feed_compact').then((v) => { if (v === '0' || v === '1') setCompact(v === '1'); }).catch(() => {});
  }, []);
  const toggleCompact = () => setCompact((c) => {
    const next = !c;
    storage.set('ur_feed_compact', next ? '1' : '0').catch(() => {});
    return next;
  });

  // Загрузка данных С СЕРВЕРА (главное изменение!)
  const loadFromServer = async () => {
    setLoadError(false);
    try {
      if (isDriver) {
        const { cargos } = await marketAPI.listCargos({ cargoType: filterType || '', limit: pageLimit });
        // Driver feed: ТОЛЬКО чужие грузы (counterparty supply). Если
        // backend вернул груз с owner_id равным текущему user_id,
        // водитель не должен видеть свой же груз — для управления
        // своими грузами есть отдельный экран "Мои грузы" (MyTripsList).
        // Зеркально с shipper-веткой ниже, где my_cargos исключены.
        const mapped = (cargos || [])
          .filter(c => !myUserId || c.owner_id !== myUserId)
          .map(c => ({
          id: c.id,
          // Stage 50 (Bug 10): fallback на структурированный point_name,
          // если backend вернул from_city/to_city пустыми — иначе карточка
          // показывает "— → —" сразу после публикации.
          from: sanitizeForDisplay(c.from_city || c.from_point_name || ''),
          to:   sanitizeForDisplay(c.to_city   || c.to_point_name   || ''),
          // issue #6: страна для полного 2-строчного маршрута на карточке
          fromCountry: sanitizeForDisplay(c.from_country || ''),
          toCountry: sanitizeForDisplay(c.to_country || ''),
          cargo: c.cargo_desc, type: c.cargo_type,
          tons: c.weight_tons, m3: c.volume_m3,
          price: c.price,
          // PR-C1 (currency mapping): backend хранит cargos.currency
          // ('KZT'/'USD'/'RUB'/'CNY') и возвращает в GET /market/cargos.
          // Раньше mapping игнорировал поле → formatPrice падал на USD
          // fallback и пользователь видел «$700 000» там, где было
          // «700 000 ₸». Прокидываем явно.
          currency: c.currency,
          payment_type: c.payment_type,
          pickup: c.pickup_date,
          bids: c.bids_count, photos: c.photos,
          photo: c.photos?.[0], isMine: c.owner_id === myUserId,
          createdAt: c.created_at, _server: true,
        }));
        if (!mounted.current) return;  // QA-аудит P1-8
        setServerData(mapped);
      } else {
        // Клиент (shipper) feed: ТОЛЬКО рейсы водителей + доступные водители.
        // my_cargos сюда НЕ примешиваем — свои грузы живут в отдельном
        // экране «Мои грузы» (MyTripsScreen, tab "MyWork"). Раньше
        // shipper видел свои же грузы вперемешку с trips чужих
        // водителей — что и приводило к "Маршрут уточняется" и
        // навигации в DriverDetail с _profileMissing.
        const [tripsRes, driversRes] = await Promise.all([
          marketAPI.listTrips({ truckType: filterType || '', limit: pageLimit }),
          marketAPI.listDrivers({ truckType: filterType || '' }),
        ]);
        // Симметрично с driver-веткой: shipper не должен видеть
        // собственные рейсы в feed (если у пользователя двойная роль
        // driver+client). Свои рейсы видны через "Мои рейсы".
        const tripsMapped = ((tripsRes || {}).trips || [])
          .filter(rawT => !myUserId || rawT.driver_id !== myUserId)
          .map(rawT => {
          const n = normalizeTrip({ ...rawT, _server: true });
          // Card title fallback ladder. Most trips on the live feed have
          // driver_name=null because driver profiles aren't fully populated
          // yet. Раньше синтезировали хэш «Перевозчик #4F2A» — владельцу он
          // выглядел как «непонятное имя». Теперь без имени показываем
          // осмысленное: «Перевозчик UrTruck · <тип кузова>».
          const cardName = n.driverName
            || `${tGlobal('carrier_handle_prefix')} · ${formatTruckType(n.truckType || 'tent')}`;
          return {
            ...n,
            // Card-only fields kept alongside the canonical shape:
            name: cardName,
            type: n.truckType || 'tent',
            m3: n.availableM3 || 0,
            tons: n.capacityTons || 0,
            // Реальные данные водителя из бэка (list_trips обогащает). Больше
            // не выдумываем «★5.0 · Проверен» — показываем как есть.
            rating: rawT.driver_rating || 0,
            reviews: rawT.driver_reviews_count || 0,
            verified: !!rawT.driver_verified,
            tripRoute: `${n.from || '—'} → ${n.to || '—'}`,
            tripDates: n.departure && n.arrival ? `${n.departure} - ${n.arrival}` : (n.departure || ''),
          };
        });
        const driversMapped = ((driversRes || {}).drivers || []).map(d => ({
          id: d.id, name: d.full_name || tGlobal('driver_fallback'),
          country: 'KZ', type: d.vehicle_type || 'tent',
          m3: Math.round((d.vehicle_capacity_kg || 20000) / 250),
          tons: Math.round((d.vehicle_capacity_kg || 20000) / 1000),
          rating: d.rating || 0, reviews: d.reviews_count || 0,
          verified: true,
          plate_truck: d.vehicle_plate,
          phone: '***',
          _server: true, _isDriver: true,
        }));
        if (!mounted.current) return;  // QA-аудит P1-8
        // Решение владельца: лента «Рейсы» = ТОЛЬКО реальные рейсы с маршрутом
        // и ценой. Пустые карточки-профили водителей (без маршрута: «имя · тип»)
        // убраны — они путали («кто, куда, за сколько?»). driversMapped больше
        // не подмешиваем; заодно уходит и старый баг двойного ❤️ (профиль+рейс
        // одного водителя). Профиль водителя доступен из карточки его рейса.
        setServerData([...tripsMapped]);
      }
    } catch (e) {
      console.warn('[Feed] Server load failed:', e);
      if (mounted.current) setLoadError(true);
    } finally {
      if (mounted.current) setInitialLoading(false);
    }
  };

  useEffect(() => { loadFromServer(); }, [isDriver, filterType, pageLimit]);

  // Клиент: подтягиваем список избранных водителей, чтобы сердечки в ленте
  // отражали уже сохранённых. Гость/водитель — пропускаем.
  useEffect(() => {
    if (isDriver || !myUserId) return;
    let alive = true;
    (async () => {
      const r = await marketAPI.favList('driver').catch(() => null);
      if (alive && r?.favorites) setFavIds(new Set(r.favorites.map((f) => f.item_id)));
    })();
    return () => { alive = false; };
  }, [isDriver, myUserId]);

  // Тап по сердечку в карточке: сохранить/убрать перевозчика (оптимистично).
  // БАГ A: раньше catch ловил только throw, но favAdd/favRemove при HTTP-
  // ошибке (403/401) НЕ бросают — возвращают {ok:false}. Оптимистичное ❤️
  // оставалось гореть, а на сервере запись не появлялась → «Избранное пусто
  // в профиле». Теперь проверяем r.ok и откатываем + сообщаем при любой
  // неудаче (не только при исключении).
  const rollback = (id, has) => setFavIds((prev) => {
    const next = new Set(prev);
    if (has) next.add(id); else next.delete(id);
    return next;
  });
  const toggleFav = async (item) => {
    const id = item.driverId || item.id;
    if (!id) return;
    const has = favIds.has(id);
    setFavIds((prev) => {
      const next = new Set(prev);
      if (has) next.delete(id); else next.add(id);
      return next;
    });
    try {
      const r = has
        ? await marketAPI.favRemove('driver', id)
        : await marketAPI.favAdd('driver', id, { name: item.name, type: item.type, plate: item.plate_truck });
      if (!r || r.ok !== true) {
        rollback(id, has);
        toast(t('send_error'), 'error');
      }
    } catch {
      rollback(id, has);
      toast(t('send_error'), 'error');
    }
  };

  // Refetch when user comes back to feed (e.g. after publishing a trip/cargo)
  // so the new card appears immediately without manual pull-to-refresh.
  useFocusEffect(
    React.useCallback(() => {
      loadFromServer();
    }, [isDriver, filterType])
  );

  // Серверный поиск по маршруту. Разделитель больше не только «→»: водителю
  // тяжело набрать стрелку на телефоне. Принимаем «Алматы, Москва»,
  // «Алматы - Москва», «Алматы — Москва», «Алматы→Москва», «Алматы->Москва».
  // « - » (с пробелами) не ломает города через дефис («Алма-Ата»).
  useEffect(() => {
    const timer = setTimeout(() => {
      const SEPARATORS = ['→', '->', '—', ' - ', ','];
      const sep = SEPARATORS.find(x => search.includes(x));
      if (sep) {
        const [from, to] = search.split(sep).map(s => s.trim());
        if (from && to) {
          if (isDriver) {
            marketAPI.listCargos({ fromCity: from, toCity: to }).then(d => {
              if (!mounted.current) return;  // QA-аудит P1-8
              if (d.cargos?.length) {
                // Симметрично с главным loader: driver search-handler
                // тоже не должен показывать свои собственные грузы.
                const filtered = d.cargos.filter(c => !myUserId || c.owner_id !== myUserId);
                setServerData(filtered.map(c => ({
                  id: c.id,
                  // PR-A (P0-2 route mapping): search-handler раньше брал ТОЛЬКО
                  // from_city/to_city без fallback на structured point_name.
                  // Cargo, опубликованный через RoutePointPicker, мог иметь
                  // from_city='' и from_point_name='Чжэнчжоу' → search-результат
                  // показывал «Маршрут уточняется». Симметрия с главным loader.
                  from: sanitizeForDisplay(c.from_city || c.from_point_name || ''),
                  to:   sanitizeForDisplay(c.to_city   || c.to_point_name   || ''),
                  cargo: c.cargo_desc, type: c.cargo_type,
                  tons: c.weight_tons, m3: c.volume_m3,
                  price: c.price,
                  // PR-C1: currency mapping — см. главный loader выше.
                  currency: c.currency,
                  bids: c.bids_count,
                  photos: c.photos, photo: c.photos?.[0],
                  _server: true, createdAt: c.created_at,
                })));
              }
            }).catch(() => {});
          } else {
            marketAPI.listTrips({ fromCity: from, toCity: to }).then(d => {
              if (!mounted.current) return;  // QA-аудит P1-8
              if (d.trips?.length) {
                // Симметрично: shipper search-handler не должен показывать
                // собственные рейсы (если у пользователя двойная роль).
                const filteredTrips = d.trips.filter(t => !myUserId || t.driver_id !== myUserId);
                setServerData(prev => {
                  const existing = prev.filter(p => !filteredTrips.find(t => t.id === p.id));
                  return [...filteredTrips.map(t => {
                    // PR-A (P0-2): тот же fallback на point_name, что в главном
                    // loader. Trip без from_city, но с from_point_name больше
                    // не показывает "Маршрут уточняется" / "— → —".
                    const fromStr = sanitizeForDisplay(t.from_city || t.from_point_name || '');
                    const toStr = sanitizeForDisplay(t.to_city || t.to_point_name || '');
                    return {
                      id: t.id, name: t.driver_name || tGlobal('driver_fallback'),
                      type: t.truck_type, from: fromStr, to: toStr,
                      price: t.price,
                      // PR-C1: currency mapping (trips тоже хранят currency).
                      currency: t.currency,
                      isTrip: true, _server: true,
                      tripRoute: `${fromStr || '—'} → ${toStr || '—'}`,
                    };
                  }), ...existing];
                });
              }
            }).catch(() => {});
          }
        }
      }
    }, 500); // debounce 500ms
    return () => clearTimeout(timer);
  }, [search, isDriver]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Тост «🔄 Обновлено» убран (решение владельца 14.06) — RefreshControl и так
    // показывает спиннер; всплывающий баннер выглядел как ошибка/лишний шум.
    loadFromServer().finally(() => {
      setRefreshing(false);
    });
  }, [isDriver]);

  useEffect(() => {
    const unsub = subscribe(() => setTick(x => x + 1));
    return () => unsub();
  }, []);

  // Данные: серверные + локальные (для обратной совместимости)
  const localData = isDriver ? getCargos() : DRIVERS;
  const currentData = [...serverData, ...localData.filter(l => !serverData.find(s => s.id === l.id))];
  const filteredData = useMemo(() => {
    let data = [...currentData];
    // Stage 50 (Bug 11): отфильтровываем явно битые карточки —
    // без route (from/to) или с заглушками "—". В прод-ленте такие
    // не должны появляться, но если из БД прилетает мусор (старые
    // QA-записи / incomplete drafts) — не показываем "— → —" и
    // "0 отзывов" пользователю.
    data = data.filter(d => {
      if (d.isTrip || d.cargo !== undefined) {
        const f = (d.from || '').trim();
        const tt = (d.to || '').trim();
        if (!f || !tt || f === '—' || tt === '—') return false;
      }
      return true;
    });
    if (filterType) data = data.filter(d => d.type === filterType);
    if (minRating > 0) {
      data = data.filter(d => (d.rating || 0) >= minRating);
    }
    // Direction filter (city contains, case-insensitive)
    if (dirFrom.trim()) {
      const q = dirFrom.toLowerCase().trim();
      data = data.filter(d => (d.from || '').toLowerCase().includes(q));
    }
    if (dirTo.trim()) {
      const q = dirTo.toLowerCase().trim();
      data = data.filter(d => (d.to || '').toLowerCase().includes(q));
    }
    // Date window — driver feed sees cargos.pickup_date, client feed
    // sees trips.departure (mapped earlier into d.pickup or d.departure
    // if available). DatePicker stores DD.MM.YYYY; convert both sides
    // to ISO so a string compare works as a date compare.
    //
    // Stage 52 / P0-3: backend хранит pickup_date as-is. CreateCargoScreen
    // шлёт значение из DatePicker (DD.MM.YYYY), а раньше ymd() принимала
    // только YYYY-MM-DD, поэтому все mobile-cargos выпадали из фильтра.
    // Теперь принимаем оба формата на стороне фильтра.
    const dateField = (d) => d.pickup || d.departure || '';
    const ymd = (s) => {
      const str = String(s || '').trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
      const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(str);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      return '';
    };
    const fromIso = ddmmToIso(dateFrom);
    const toIso = ddmmToIso(dateTo);
    if (fromIso) {
      data = data.filter(d => { const v = ymd(dateField(d)); return v && v >= fromIso; });
    }
    if (toIso) {
      data = data.filter(d => { const v = ymd(dateField(d)); return v && v <= toIso; });
    }
    // Скрываем просроченные из ОБЩЕЙ ленты (Модель А: публикация живёт 3 дня —
    // день выезда + 2). Дальше убираем; у владельца остаётся в «Мои грузы/
    // рейсы» с «Срок истёк» и продлением одним тапом. Лента показывает грузы/
    // рейсы чужой роли, поэтому свои публикации у владельца тут не прячутся.
    {
      const g = new Date();
      g.setHours(0, 0, 0, 0);
      g.setDate(g.getDate() - 2);            // граница = день выезда + 2 (живёт 3 дня)
      // Локальная календарная дата (не toISOString/UTC) — согласовано с
      // MyTripsScreen.isExpiredItem, иначе утром граница уезжала на сутки.
      const graceIso = `${g.getFullYear()}-${String(g.getMonth() + 1).padStart(2, '0')}-${String(g.getDate()).padStart(2, '0')}`;
      data = data.filter(d => {
        const v = ymd(dateField(d));
        return !v || v >= graceIso;          // без даты не прячем
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      // Body-type synonyms: "тнт" → tent, "реф" → ref, "конт" → cont20/cont40.
      // If the query maps to one or more truck keys, match cards whose `type`
      // is in that set; otherwise fall back to text match across route/cargo/
      // driver name + the localized truck label.
      const truckMatches = matchTruckTypes(q);
      data = data.filter(d => {
        if (truckMatches.length > 0 && d.type && truckMatches.includes(d.type)) return true;
        const truckLabel = d.type ? String(t(d.type) || '').toLowerCase() : '';
        return (
          (d.from && d.from.toLowerCase().includes(q)) ||
          (d.to && d.to.toLowerCase().includes(q)) ||
          (d.cargo && d.cargo.toLowerCase().includes(q)) ||
          (d.name && d.name.toLowerCase().includes(q)) ||
          (truckLabel && truckLabel.includes(q))
        );
      });
    }
    // Сортировка
    if (sortBy === 'price-asc') data.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sortBy === 'price-desc') data.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sortBy === 'rating') data.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    // 'newest' — по умолчанию (как в массиве)
    // Защита от дубль-ключей в FlatList (тот же ключ, что в keyExtractor):
    // повтор id → одинаковый React-ключ → две карточки «слипаются» и реагируют
    // как одна (в т.ч. ❤️). Схлопываем строго по итоговому ключу.
    const seenKeys = new Set();
    data = data.filter((it) => {
      const ns = it.isTrip ? 't' : (it.isMine ? 'c' : 'd');
      const k = `${ns}:${it.id ?? ''}`;
      if (it.id == null) return true;      // без id не трогаем (fallback на idx)
      if (seenKeys.has(k)) return false;
      seenKeys.add(k);
      return true;
    });
    return data;
  }, [currentData, filterType, search, sortBy, minRating, dirFrom, dirTo, dateFrom, dateTo]);

  // Form state and submit handlers for trip / cargo creation moved to
  // dedicated screens (CreateTripScreen / CreateCargoScreen). FeedScreen
  // now only navigates to them via the title-row CTA. The publish modal
  // and its 100+ lines of mixed state were removed alongside.

  // Render cargo card under the v1 FeedCard component (macro 07).
  const renderCargo = ({ item }) => {
    const openCargo = async () => {
      // Stage 32: cargo feed = driver view (водитель смотрит грузы).
      // Передаём roleHint='driver' в gate — если пользователь не
      // авторизован, регистрация откроется сразу как «Регистрация
      // водителя» без промежуточного экрана выбора роли.
      const ok = await requireLevel(LEVELS.PHONE, 'open_detail', 'driver');
      if (!ok) return;
      const safePhotos = (item.photos || []).filter(p => typeof p === 'string' && p.length < 500);
      navigation.navigate('CargoDetail', { cargo: { ...item, photos: safePhotos, photo: null }, cargoId: item.id, role });
    };
    // Stage 17: meta pills lose their per-row emoji glyphs to match
    // Stage 16's quiet visual language — only one accent (the price)
    // per card, label/value pair carries the meaning on its own.
    // RC2 hotfix (P0-3): pickup_date должна быть видна на КАЖДОЙ карточке
    // груза. Если backend не вернул pickup — показываем "Дата уточняется",
    // а не скрываем пилюлю целиком. Иначе пользователь не понимает,
    // когда груз надо забирать.
    // Км и ставка-за-км — метрики №1 для решения «беру/не беру». routeStats
    // уже используется на CargoDetail; выносим на карточку, чтобы водитель
    // не открывал деталь ради двух цифр.
    const stats = routeStats(item.from, item.to);
    const km = (stats && stats.km) || 0;
    const priceNum = Number(item.price) || 0;
    const perKm = (km > 0 && priceNum > 0) ? priceNum / km : 0;
    const perKmStr = perKm >= 10 ? String(Math.round(perKm)) : perKm.toFixed(1);
    const meta = [
      { label: t('departure'), value: item.pickup || t('pickup_date_tbd') },
      km > 0 ? { label: t('distance'), value: `${km} км` } : null,
      perKm > 0 ? { label: t('per_km_short'), value: `${perKmStr} ${item.currency || ''}/км` } : null,
      (item.payment_type && item.payment_type !== 'any') ? { label: t('payment_type_label'), value: t('pay_' + item.payment_type) } : null,
      item.tons > 0 ? { label: t('weight'), value: `${item.tons} т` } : null,
      item.m3 > 0 ? { label: t('volume'), value: `${item.m3} м³` } : null,
    ].filter(Boolean);
    // Stage 9: feed cards used to show two buttons that both ran the
    // same `openCargo`. The pair gave the user two different verbs
    // for the same action and made it look like there were two flows.
    // Now the card has one primary button — "Подробнее" — and the
    // bid CTA lives on CargoDetail's sticky bar where it actually
    // opens the bid form.
    return (
      <FeedCard
        variant="cargo"
        accent={isDriver ? 'driver' : 'cargo'}
        route={{ from: item.from, to: item.to, fromCountry: item.fromCountry, toCountry: item.toCountry }}
        subtitle={sanitizeDesc(item.cargo)}
        meta={meta}
        priceText={formatPrice(item.price, item.currency, t)}
        priceCaption={t('per_trip')}
        responses={item.bids || 0}
        onPress={openCargo}
        bottomRight={{ label: t('details'), onPress: openCargo, filled: false, testID: 'feed-details-btn' }}
        compact={compact}
        testID="cargo-card"
      />
    );
  };

  // Render trip / driver card under FeedCard (macro 08).
  const renderDriver = ({ item }) => {
    const onPress = async () => {
      // Stage 32: trips/drivers feed = client view (грузовладелец
      // ищет машину). Передаём roleHint='client' — gate откроет
      // сразу «Регистрация грузовладельца».
      const ok = await requireLevel(LEVELS.PHONE, 'open_detail', 'client');
      if (!ok) return;
      if (item.isTrip) {
        navigation.navigate('TripDetail', { trip: normalizeTrip(item), tripId: item.id, role });
      } else {
        const hasFullProfile = !!(item.full_name || (item.name && item.name !== tGlobal('driver_fallback'))) && !!(item.plate_truck || item.vehicle_plate);
        if (hasFullProfile) {
          navigation.navigate('DriverDetail', {
            driver: { ...item, name: item.name || item.full_name, type: item.type || item.vehicle_type || 'tent', m3: item.m3 || 0, tons: item.tons || 0, rating: item.rating || 0, reviews: item.reviews || 0 },
            role,
          });
        } else {
          navigation.navigate('DriverDetail', {
            driver: { id: item.id, name: item.name, type: item.type || 'tent', _profileMissing: true },
            role,
          });
        }
      }
    };
    // Stage 17: same emoji-strip as cargo cards above.
    const meta = [
      item.tripDates ? { label: t('departure'), value: item.tripDates.split(' - ')[0] || item.tripDates } : null,
      item.tons > 0 ? { label: t('weight'), value: `${item.tons} т` } : null,
      item.m3 > 0 ? { label: t('volume'), value: `${item.m3} м³` } : null,
    ].filter(Boolean);
    // Same single-button logic as cargo cards — the card itself is
    // tappable and opens the detail; the secondary verb is gone so
    // the user doesn't see two roughly-equivalent CTAs.
    return (
      <FeedCard
        variant="trip"
        accent={isDriver ? 'driver' : 'cargo'}
        route={item.isTrip && item.tripRoute ? { from: item.from, to: item.to } : undefined}
        title={item.isTrip && item.tripRoute ? undefined : sanitizeForDisplay(item.name)}
        subtitle={item.verified ? `${formatTruckType(item.type)} · ${t('verified')}` : formatTruckType(item.type)}
        meta={meta}
        priceText={item.isTrip ? formatPrice(item.price, item.currency, t) : `★ ${item.rating || '—'}`}
        priceCaption={item.isTrip ? t('per_trip') : `${item.reviews || 0} ${t('reviews')}`}
        onPress={onPress}
        bottomRight={{ label: t('details'), onPress, filled: false, testID: 'feed-details-btn' }}
        favActive={!isDriver ? favIds.has(item.driverId || item.id) : undefined}
        onToggleFav={!isDriver && myUserId ? () => toggleFav(item) : undefined}
        compact={compact}
        testID={item.isTrip ? 'trip-card' : 'driver-card'}
      />
    );
  };

  // Filter chips (macros 07/08): Direction / Date / Body / Price.
  // Each chip opens its OWN bottom sheet — never the unified "all filters"
  // sheet. Direction edits dirFrom/dirTo, Date edits dateFrom/dateTo, Body
  // edits filterType, Price edits sortBy.
  const accentColor = isDriver ? v1Colors.driver : v1Colors.cargoOwner;
  const v1Accent = v1AccentFor(isDriver ? 'driver' : 'client');
  const chips = [
    // Stage 16: dropped per-chip emojis (🧭/📅/🚛/💰). Filter pills
    // now read as plain text + chevron — calmer strip, no four
    // colour spots competing with the price/CTA accent.
    // inDrive-стиль: «Направление» вынесено в крупный селектор «Откуда → Куда»
    // над поиском, поэтому в ряду мелких фильтров его больше нет.
    { key: 'date',  label: t('filter_date'),      active: !!(dateFrom || dateTo),     onPress: () => setActiveFilter('date') },
    { key: 'body',  label: t('filter_body'),      active: !!filterType,               onPress: () => setActiveFilter('body') },
    { key: 'price', label: t('filter_price'),     active: sortBy !== 'newest',        onPress: () => setActiveFilter('price') },
  ];

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      {/* Stage 16: brand bar simplified — UrTruck wordmark + bell only.
          The green "FTL" pill that used to sit next to the wordmark
          was the third bright emerald spot on a header that already
          carries the bell badge ring; cutting it removes one of the
          competing accents from the screen. */}
      <View style={s.brandBar}>
        {/* Stage 50: language switcher показывается ТОЛЬКО гостю —
            зарегистрированный пользователь меняет язык в Profile.
            Раньше pill был в шапке всегда и путал на рабочих экранах
            (мешал бизнес-действиям с грузом). */}
        {isGuest ? (
          <LanguageSwitcher testID="feed-lang-switch" compact />
        ) : (
          <View style={{ width: 40 }} />
        )}
        <View style={s.brandRow}>
          <Text style={[s.brandText, { color: v1.text }]}>UrTruck</Text>
        </View>
        {isGuest ? (
          // Гость не имеет профиля; placeholder чтобы заголовок
          // остался по центру.
          <View style={{ width: 40 }} />
        ) : (
          // ☰ (top-right) → профиль и меню (как в inDrive / Yandex Go).
          // Колокольчик уехал вниз в таб-бар как вкладка «Дела».
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile', { role })}
            style={s.menuBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID="feed-menu-btn"
            accessibilityLabel={t('tab_profile')}
          >
            <Feather name="menu" size={24} color={v1.text} />
          </TouchableOpacity>
        )}
      </View>

      {/* RC2 fix (14 May): гостевой toggle Грузы/Рейсы убран. Гость
          видит ленту по дефолтной роли (driver = lookup cargos), без
          segmented control. Переключение роли — через регистрацию
          из RoleScreen. */}

      {/* Title row — заголовок и подзаголовок. */}
      <View style={s.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[s.titleHero, { color: v1.text }]}>{isDriver ? t('cargos') : t('trucks')}</Text>
          <Text style={[s.titleHeroSub, { color: v1.textMuted }]}>{isDriver ? t('feed_driver_subtitle') : t('feed_client_subtitle')}</Text>
        </View>
        {/* Переключатель вида ленты: компактный список ↔ крупные карточки.
            Иконка меняется на противоположный режим (подсказка «что будет»). */}
        <TouchableOpacity
          onPress={toggleCompact}
          style={s.viewToggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="feed-view-toggle"
          accessibilityLabel={compact ? t('feed_view_large') : t('feed_view_compact')}
        >
          {/* Иконка подсказывает, КУДА переключимся: в компактном режиме
              показываем «крупные карточки» (grid), в крупном — «список»
              (list). Пустой квадрат был непонятен. */}
          <Feather name={compact ? 'grid' : 'list'} size={20} color={v1.textMuted} />
        </TouchableOpacity>
        {/* Для КЛИЕНТА публикация груза — главное действие, а безымянный
            «+» в таббаре не находится. Показываем явную кнопку «+Груз».
            У водителя лента = основная работа (берёт грузы), поэтому CTA
            публикации рейса ему на ленту не выносим (остаётся «+» в баре). */}
        {!isDriver ? (
          <PressableScale
            style={[s.titleCta, { backgroundColor: 'transparent', borderWidth: 1, borderColor: accentColor }]}
            onPress={() => navigation.navigate('CreateCargo', { role })}
            testID="publish-cargo-button"
            accessibilityRole="button"
            accessibilityLabel={t('postCargo')}
          >
            <Text style={[s.titleCtaText, { color: accentColor }]}>+ {t('postCargo')}</Text>
          </PressableScale>
        ) : null}
      </View>

      {/* inDrive-стиль: крупный селектор «Откуда → Куда» — главный способ
          фильтра. Тап открывает шторку направления. Значения локализуются. */}
      <View
        style={[s.routeSelector, { backgroundColor: v1.surface, borderColor: (dirFrom || dirTo) ? accentColor : v1.border }]}
        testID="feed-route-selector"
      >
        <TouchableOpacity
          style={s.routeSelHalf}
          onPress={() => setShowDirFromPicker(true)}
          activeOpacity={0.7}
          testID="feed-route-from"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="map-pin" size={11} color={v1.textMuted} />
            <Text style={[s.routeSelLabel, { color: v1.textMuted }]}>{t('from')}</Text>
          </View>
          <Text style={[s.routeSelValue, { color: dirFrom ? v1.text : v1.textMuted }]} numberOfLines={1}>
            {dirFrom ? localizePlace(dirFrom, lang) : t('create_field_from_placeholder')}
          </Text>
        </TouchableOpacity>
        <Feather name="arrow-right" size={16} color={accentColor} style={s.routeSelArrow} />
        <TouchableOpacity
          style={s.routeSelHalf}
          onPress={() => setShowDirToPicker(true)}
          activeOpacity={0.7}
          testID="feed-route-to"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="flag" size={11} color={v1.textMuted} />
            <Text style={[s.routeSelLabel, { color: v1.textMuted }]}>{t('to')}</Text>
          </View>
          <Text style={[s.routeSelValue, { color: dirTo ? v1.text : v1.textMuted }]} numberOfLines={1}>
            {dirTo ? localizePlace(dirTo, lang) : t('create_field_to_placeholder')}
          </Text>
        </TouchableOpacity>
        {(dirFrom || dirTo) ? (
          <TouchableOpacity
            onPress={() => { setDirFrom(''); setDirTo(''); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={s.routeSelClear}
            testID="feed-route-clear"
          >
            <Feather name="x" size={16} color={v1.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Подписка «грузы по моему маршруту» — ключевая ретеншн-петля.
          Видна водителю, когда заданы обе точки. Пуш придёт, когда
          появится груз по этому направлению. Раньше жила в шторке фильтра;
          после перехода на полноэкранный пикер вынесена под селектор. */}
      {isDriver && dirFrom.trim() && dirTo.trim() ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <TouchableOpacity
            style={[s.saveRouteFull, { borderColor: accentColor }]}
            onPress={async () => {
              const r = await marketAPI.saveRoute({ from_city: dirFrom.trim(), to_city: dirTo.trim(), truck_type: filterType || null });
              if (r.ok) toast('🔔 ' + t('route_saved'), 'success', 3500);
              else toast(r.detail || t('send_error'), 'error');
            }}
            testID="save-route-btn"
          >
            <Text style={[s.saveRouteFullText, { color: accentColor }]}>🔔 {t('save_route_notify')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={t('searchRoute')}
          onClear={() => { setFilterType(null); setSearch(''); setSortBy('newest'); setMinRating(0); }}
        />
      </View>

      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <FilterChips items={chips} accent={accentColor} />
      </View>

      {/* Чипы выбранных фильтров */}
      {(filterType || minRating > 0 || sortBy !== 'newest') && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.activeChipsRow}>
          {filterType && (
            <View style={[s.activeChip, { backgroundColor: TCOLORS[filterType] || accent }]}>
              <Text style={s.activeChipText} numberOfLines={1}>{TRUCK_ICONS[filterType]} {t(filterType)}</Text>
              <TouchableOpacity onPress={() => setFilterType(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.activeChipClose}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          {minRating > 0 && (
            <View style={[s.activeChip, { backgroundColor: '#FBBF24' }]}>
              <Text style={[s.activeChipText, { color: '#0C0A09' }]}>⭐ {minRating}+</Text>
              <TouchableOpacity onPress={() => setMinRating(0)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[s.activeChipClose, { color: '#0C0A09' }]}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          {sortBy !== 'newest' && (
            <View style={[s.activeChip, { backgroundColor: sortBy === 'rating' ? '#FBBF24' : accent }]}>
              <Text style={[s.activeChipText, { color: '#0C0A09' }]}>
                {sortBy === 'price-asc' ? t('filter_price_asc') : sortBy === 'price-desc' ? t('filter_price_desc') : t('filter_rating_sort')}
              </Text>
              <TouchableOpacity onPress={() => setSortBy('newest')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[s.activeChipClose, { color: '#0C0A09' }]}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Полноэкранный выбор города «Откуда/Куда» для фильтра ленты —
          тот же LocationPickerModal, что и на создании груза: поиск,
          недавние, избранное, популярные, погранпереходы. Заменил
          прежнюю тесную шторку, где можно было выбрать только города,
          уже попавшие в ленту. Храним p.name (город) — фильтр сравнивает
          подстрокой с d.from / d.to. */}
      <LocationPickerModal
        visible={showDirFromPicker}
        onClose={() => setShowDirFromPicker(false)}
        title={t('loc_from_title')}
        showGeo
        onSelect={(v, point) => setDirFrom((point && point.name) || v || '')}
      />
      <LocationPickerModal
        visible={showDirToPicker}
        onClose={() => setShowDirToPicker(false)}
        title={t('loc_to_title')}
        onSelect={(v, point) => setDirTo((point && point.name) || v || '')}
      />

      {/* Date sheet — real calendar/date-picker for both ends of the
          window. DatePicker uses native <input type="date"> on web and
          a custom Modal calendar on native, so the chip never falls
          back to a plain TextInput. testID lets QA target it. */}
      <BottomSheet visible={activeFilter === 'date'} onClose={closeFilter} title={t('filter_date')}>
        <View testID="filter-date-sheet">
          <Text style={[s.filterSectionLabel, { color: theme.textMuted }]}>{t('filter_date_from')}</Text>
          <DatePicker value={dateFrom} onChange={setDateFrom} placeholder={t('date_placeholder')} />
          <Text style={[s.filterSectionLabel, { color: theme.textMuted, marginTop: 12 }]}>{t('filter_date_to')}</Text>
          <DatePicker value={dateTo} onChange={setDateTo} placeholder={t('date_placeholder')} />
          <View style={s.filterActions}>
            <TouchableOpacity
              style={[s.filterActionBtn, { backgroundColor: v1.surface, borderColor: v1.border, borderWidth: 1 }]}
              onPress={() => { setDateFrom(''); setDateTo(''); }}
              testID="filter-date-reset"
            >
              <Text style={[s.filterActionText, { color: v1.textMuted }]}>{t('filter_reset')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.filterActionBtn, { backgroundColor: accentColor }]}
              onPress={closeFilter}
              testID="filter-date-apply"
            >
              <Text style={[s.filterActionText, { color: '#0A0A0A' }]}>{t('filter_apply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      {/* Body sheet — only truck-type pills. */}
      <BottomSheet visible={activeFilter === 'body'} onClose={closeFilter} title={t('filter_body')}>
        <Text style={[s.filterSectionLabel, { color: theme.textMuted }]}>{t('filter_truck_type')}</Text>
        <View style={s.filterPillWrap}>
          <TouchableOpacity
            style={[s.filterPill, { backgroundColor: theme.card, borderColor: theme.border }, !filterType && { backgroundColor: accent, borderColor: accent }]}
            onPress={() => setFilterType(null)}
          >
            <Text style={[s.filterPillText, { color: theme.textSecondary }, !filterType && { color: isDriver ? '#fff' : '#0C0A09' }]}>{t('filter_all')}</Text>
          </TouchableOpacity>
          {TRUCK_KEYS.map(k => (
            <TouchableOpacity
              key={k}
              style={[s.filterPill, { backgroundColor: theme.card, borderColor: theme.border }, filterType === k && { backgroundColor: TCOLORS[k], borderColor: TCOLORS[k] }]}
              onPress={() => setFilterType(filterType === k ? null : k)}
            >
              <Text style={[s.filterPillText, { color: theme.textSecondary }, filterType === k && { color: '#fff' }]}>
                {TRUCK_ICONS[k]} {t(k)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.filterActions}>
          <TouchableOpacity
            style={[s.filterActionBtn, { backgroundColor: v1.surface, borderColor: v1.border, borderWidth: 1 }]}
            onPress={() => setFilterType(null)}
          >
            <Text style={[s.filterActionText, { color: v1.textMuted }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.filterActionBtn, { backgroundColor: accentColor }]} onPress={closeFilter}>
            <Text style={[s.filterActionText, { color: '#0A0A0A' }]}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Price sheet — only sort + rating filter (clients only). */}
      <BottomSheet visible={activeFilter === 'price'} onClose={closeFilter} title={t('filter_price')}>
        {!isDriver && (
          <>
            <Text style={[s.filterSectionLabel, { color: theme.textMuted }]}>{t('filter_rating')}</Text>
            <View style={s.filterPillRow}>
              {[{ k: 0, l: t('filter_all') }, { k: 3, l: '3+' }, { k: 4, l: '4+' }, { k: 5, l: '5' }].map(opt => (
                <TouchableOpacity
                  key={opt.k}
                  style={[s.filterPill, { backgroundColor: theme.card, borderColor: theme.border }, minRating === opt.k && { backgroundColor: '#FBBF24', borderColor: '#FBBF24' }]}
                  onPress={() => setMinRating(opt.k)}
                >
                  <Text style={[s.filterPillText, { color: theme.textSecondary }, minRating === opt.k && { color: '#0C0A09' }]}>
                    {opt.k > 0 ? `⭐ ${opt.l}` : opt.l}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        <Text style={[s.filterSectionLabel, { color: theme.textMuted, marginTop: !isDriver ? 12 : 0 }]}>{t('filter_sort')}</Text>
        <View style={s.filterPillRow}>
          {[
            { k: 'newest', l: '🆕 ' + t('filter_newest') },
            { k: 'price-asc', l: '💰 ' + t('filter_price_asc') },
            { k: 'price-desc', l: '💰 ' + t('filter_price_desc') },
            { k: 'rating', l: '★ ' + t('filter_rating_sort') },
          ].map(opt => (
            <TouchableOpacity
              key={opt.k}
              style={[s.filterPill, { backgroundColor: theme.card, borderColor: theme.border }, sortBy === opt.k && { backgroundColor: accent, borderColor: accent }]}
              onPress={() => setSortBy(opt.k)}
            >
              <Text style={[s.filterPillText, { color: theme.textSecondary }, sortBy === opt.k && { color: isDriver ? '#fff' : '#0C0A09' }]}>{opt.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.filterActions}>
          <TouchableOpacity
            style={[s.filterActionBtn, { backgroundColor: v1.surface, borderColor: v1.border, borderWidth: 1 }]}
            onPress={() => { setSortBy('newest'); setMinRating(0); }}
          >
            <Text style={[s.filterActionText, { color: v1.textMuted }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.filterActionBtn, { backgroundColor: accentColor }]} onPress={closeFilter}>
            <Text style={[s.filterActionText, { color: '#0A0A0A' }]}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {initialLoading ? (
        <View style={{ padding: 16 }}>
          {[0,1,2,3,4].map(i => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filteredData}
          keyExtractor={(i, idx) => {
            // Клиентская лента склеивает trips + drivers — у них могут совпасть
            // числовые id из разных таблиц. Неймспейсим, чтобы не было дубль-ключей.
            const ns = i.isTrip ? 't' : (i.isMine ? 'c' : 'd');
            return `${ns}:${i.id ?? idx}`;
          }}
          renderItem={(args) => (isDriver || args.item.isMine) ? renderCargo(args) : renderDriver(args)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, gap: 0 }}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            // Догружаем следующую «страницу», только если сервер вернул
            // полную страницу (значит есть ещё) — иначе не дёргаем.
            if (!initialLoading && serverData.length >= pageLimit) {
              setPageLimit((p) => p + 50);
            }
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />}
          ListFooterComponent={
            filteredData.length > 0 ? (
              <View style={[s.footerNote, { borderColor: v1.border, backgroundColor: v1.surface }]} testID="feed-disclaimer">
                <Text style={[s.footerNoteText, { color: v1.textMuted }]} numberOfLines={2}>
                  🛡  {isDriver ? t('feed_driver_disclaimer') : t('feed_client_disclaimer')}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 48, marginBottom: 10 }}>{loadError ? '⚠️' : '🔍'}</Text>
              <Text style={{ color: v1.textMuted, fontSize: 14, textAlign: 'center' }}>
                {loadError ? t('feed_load_failed') :
                 minRating > 0 ? `${minRating}★+: ${t('no_active_cargos')}` :
                 filterType ? t('feed_filter_empty') :
                 isDriver ? t('no_active_cargos') : t('no_active_trips')}
              </Text>
              {loadError && (
                <TouchableOpacity
                  style={[s.refreshBtn, { backgroundColor: accentColor }]}
                  onPress={() => { setRefreshing(true); loadFromServer().finally(() => setRefreshing(false)); }}
                >
                  <Text style={{ color: '#0A0A0A', fontWeight: '800', fontSize: 14 }}>{t('refresh')}</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {Gate}
    </SafeAreaView>
  );
}

