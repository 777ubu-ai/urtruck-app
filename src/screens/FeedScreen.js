import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, RefreshControl, ScrollView, TextInput } from 'react-native';
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
import { matchTruckTypes } from '../utils/truckSynonyms';
import FeedCard from '../components/ui/v1/FeedCard';
import SearchBar from '../components/ui/v1/SearchBar';
import FilterChips from '../components/ui/v1/FilterChips';
import BellBadge from '../components/ui/v1/BellBadge';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useUnreadNotifications } from '../utils/useUnreadNotifications';
import BottomSheet from '../components/ui/v1/BottomSheet';
import DatePicker from '../components/DatePicker';
import { v1Colors, v1AccentFor, useV1Colors } from '../theme/designV1';

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
  tent: '#22C55E', ref: '#0891B2', platform: '#D97706', auto: '#7C3AED', izoterm: '#059669',
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
  // Stage 45 guest toggle bar
  // RC2 fix: guestTabs/guestTab/guestTabText удалены вместе с
  // guestRole-toggle (см. JSX выше).
  // Title row with outline CTA on the right (macros 07/08).
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 12 },
  titleHero: { color: v1.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  titleHeroSub: { color: v1.textMuted, fontSize: 12, marginTop: 2 },
  titleCta: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  titleCtaText: { fontSize: 12, fontWeight: '800' },
  footerNote: {
    marginTop: 16, marginBottom: 8,
    borderWidth: 1, borderRadius: 14,
    padding: 12,
    backgroundColor: v1.surface,
  },
  footerNoteText: { color: v1.textMuted, fontSize: 12, lineHeight: 17 },
  refreshBtn: { marginTop: 16, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  // Old layout helpers kept for the still-existing publish modal below.
  betaBar: { backgroundColor: '#F59E0B', paddingVertical: 6, paddingHorizontal: 14, alignItems: 'center' },
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
  filterBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  activeChipsRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 6, alignItems: 'center' },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, maxWidth: 220 },
  activeChipText: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  activeChipClose: { color: '#fff', fontSize: 13, fontWeight: '800', marginLeft: 2 },
  filterSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40, maxHeight: '80%' },
  filterSheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  filterSectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  filterPillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', rowGap: 8 },
  filterPillWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', rowGap: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, alignSelf: 'flex-start' },
  filterPillText: { fontSize: 12, fontWeight: '600' },
  filterInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 14 },
  filterActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  filterActionBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  filterActionText: { fontSize: 15, fontWeight: '800' },
  card: { borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#263244', backgroundColor: '#111827' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  route: { fontSize: 17, fontWeight: '700', marginBottom: 5, letterSpacing: -0.2, color: '#F8FAFC' },
  cargoName: { fontSize: 12, marginBottom: 8 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 16, fontSize: 10, fontWeight: '700', overflow: 'hidden' },
  price: { color: '#22C55E', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  bidsCount: { fontSize: 10, marginTop: 2 },
  driverName: { fontSize: 16, fontWeight: '700' },
  rating: { color: '#FBBF24', fontSize: 12, fontWeight: '700', marginVertical: 4 },
  tripBadge: { position: 'absolute', top: -1, right: 12, backgroundColor: '#22C55E', paddingHorizontal: 10, paddingVertical: 3, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  tripBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  mineBadge: { position: 'absolute', top: -1, right: 12, paddingHorizontal: 10, paddingVertical: 3, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  mineBadgeText: { color: '#0C0A09', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
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
  formLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6, marginTop: 4, textTransform: 'uppercase' },
  hintBox: { backgroundColor: '#22C55E15', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#22C55E30' },
  hintText: { fontSize: 11, lineHeight: 16 },
  typeCard: { width: 88, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 4 },
  typeCardText: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
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
  const role = sessionRole || route.params?.role || 'driver';
  const isDriver = role === 'driver';
  // Brand v3: driver = emerald, client = orange. No blue.
  const accent = isDriver ? '#22C55E' : '#F59E0B';
  const { t } = useI18n();
  const { theme } = useTheme();
  const notifUnread = useUnreadNotifications();
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
  const [serverData, setServerData] = useState([]);
  const [sortBy, setSortBy] = useState('newest');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // activeFilter is the chip that's currently expanded into a bottom-sheet.
  // null → no sheet open. One sheet at a time, scoped to its own state slice.
  const [activeFilter, setActiveFilter] = useState(null); // 'dir' | 'date' | 'body' | 'price' | null
  const [dirFrom, setDirFrom] = useState('');
  const [dirTo, setDirTo] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const closeFilter = () => setActiveFilter(null);

  // Загрузка данных С СЕРВЕРА (главное изменение!)
  const loadFromServer = async () => {
    setLoadError(false);
    try {
      if (isDriver) {
        const { cargos } = await marketAPI.listCargos({ cargoType: filterType || '' });
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
          cargo: c.cargo_desc, type: c.cargo_type,
          tons: c.weight_tons, m3: c.volume_m3,
          price: c.price,
          // PR-C1 (currency mapping): backend хранит cargos.currency
          // ('KZT'/'USD'/'RUB'/'CNY') и возвращает в GET /market/cargos.
          // Раньше mapping игнорировал поле → formatPrice падал на USD
          // fallback и пользователь видел «$700 000» там, где было
          // «700 000 ₸». Прокидываем явно.
          currency: c.currency,
          pickup: c.pickup_date,
          bids: c.bids_count, photos: c.photos,
          photo: c.photos?.[0], isMine: c.owner_id === myUserId,
          createdAt: c.created_at, _server: true,
        }));
        setServerData(mapped);
      } else {
        // Клиент (shipper) feed: ТОЛЬКО рейсы водителей + доступные водители.
        // my_cargos сюда НЕ примешиваем — свои грузы живут в отдельном
        // экране «Мои грузы» (MyTripsScreen, tab "MyWork"). Раньше
        // shipper видел свои же грузы вперемешку с trips чужих
        // водителей — что и приводило к "Маршрут уточняется" и
        // навигации в DriverDetail с _profileMissing.
        const [tripsRes, driversRes] = await Promise.all([
          marketAPI.listTrips({ truckType: filterType || '' }),
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
          // yet — showing a generic "Водитель" repeatedly looks broken, so
          // we synthesise a stable handle from the driver_id.
          const idTail = (n.driverId || n.id || '').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase() || '0000';
          const cardName = n.driverName || `${tGlobal('carrier_handle_prefix')} #${idTail}`;
          return {
            ...n,
            // Card-only fields kept alongside the canonical shape:
            name: cardName,
            type: n.truckType || 'tent',
            m3: n.availableM3 || 0,
            tons: n.capacityTons || 0,
            rating: 5.0, reviews: 0, verified: true,
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
        setServerData([...tripsMapped, ...driversMapped]);
      }
    } catch (e) {
      console.warn('[Feed] Server load failed:', e);
      setLoadError(true);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => { loadFromServer(); }, [isDriver, filterType]);

  // Refetch when user comes back to feed (e.g. after publishing a trip/cargo)
  // so the new card appears immediately without manual pull-to-refresh.
  useFocusEffect(
    React.useCallback(() => {
      loadFromServer();
    }, [isDriver, filterType])
  );

  // Серверный поиск при вводе маршрута "Алматы→Москва"
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.includes('→') || search.includes('->')) {
        const sep = search.includes('→') ? '→' : '->';
        const [from, to] = search.split(sep).map(s => s.trim());
        if (from && to) {
          if (isDriver) {
            marketAPI.listCargos({ fromCity: from, toCity: to }).then(d => {
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
    loadFromServer().finally(() => {
      setRefreshing(false);
      toast('🔄 Обновлено', 'info', 1500);
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
    const meta = [
      { label: t('departure'), value: item.pickup || t('pickup_date_tbd') },
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
        route={{ from: item.from, to: item.to }}
        subtitle={sanitizeDesc(item.cargo)}
        meta={meta}
        priceText={formatPrice(item.price, item.currency, t)}
        priceCaption={t('per_trip')}
        responses={item.bids || 0}
        onPress={openCargo}
        bottomRight={{ label: t('details'), onPress: openCargo, filled: false }}
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
        route={item.isTrip && item.tripRoute
          ? { from: item.from, to: item.to }
          : { from: sanitizeForDisplay(item.name), to: '' }}
        subtitle={item.verified ? `${formatTruckType(item.type)} · ${t('verified')}` : formatTruckType(item.type)}
        meta={meta}
        priceText={item.isTrip ? formatPrice(item.price, item.currency, t) : `★ ${item.rating || '—'}`}
        priceCaption={item.isTrip ? t('per_trip') : `${item.reviews || 0} ${t('reviews')}`}
        onPress={onPress}
        bottomRight={{ label: t('details'), onPress, filled: false }}
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
    { key: 'dir',   label: t('filter_direction'), active: !!(dirFrom || dirTo),       onPress: () => setActiveFilter('dir') },
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
          // Гость не имеет уведомлений; placeholder чтобы заголовок
          // остался по центру.
          <View style={{ width: 40 }} />
        ) : (
          <BellBadge
            count={notifUnread}
            onPress={() => navigation.navigate('Notifications')}
          />
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
        {/* PR-C2: title-row publish CTA закомментирован — он дублировал
            большой floating "+" в BottomNav (tab Publish), который виден
            на всех экранах, не только Feed. Stage 16 раньше делал эту
            кнопку primary CTA, но дублирование функционала путало
            пользователя и забирало место рядом с заголовком.
            TODO: redesign — если решим вернуть, перенести как secondary
            (outline) или удалить celebrate animation на BottomNav плюсе. */}
        {/*
        <TouchableOpacity
          style={[s.titleCta, { borderColor: accentColor, backgroundColor: accentColor }]}
          onPress={() => navigation.navigate(isDriver ? 'CreateTrip' : 'CreateCargo', { role })}
          testID={isDriver ? 'publish-trip-button' : 'publish-cargo-button'}
          accessibilityRole="button"
          accessibilityLabel={isDriver ? t('postTrip') : t('postCargo')}
        >
          <Text style={[s.titleCtaText, { color: '#0A0A0A' }]}>+ {isDriver ? t('postTrip') : t('postCargo')}</Text>
        </TouchableOpacity>
        */}
      </View>

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
            <View style={[s.activeChip, { backgroundColor: sortBy === 'rating' ? '#FBBF24' : '#22C55E' }]}>
              <Text style={[s.activeChipText, { color: sortBy === 'rating' ? '#0C0A09' : '#fff' }]}>
                {sortBy === 'price-asc' ? '💰 ' + t('filter_price_asc') : sortBy === 'price-desc' ? '💰 ' + t('filter_price_desc') : '★ ' + t('filter_rating_sort')}
              </Text>
              <TouchableOpacity onPress={() => setSortBy('newest')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[s.activeChipClose, { color: sortBy === 'rating' ? '#0C0A09' : '#fff' }]}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Direction sheet — only city-from / city-to inputs.
          Stage 50 (Bug 1): добавлены suggestion-чипы из городов в
          текущей ленте — пользователь видит реальные направления
          (Алматы, Астана, Урумчи и т.д.), а не пустой sheet с двумя
          текстовыми полями. Тап чипа подставляет город в input. */}
      <BottomSheet visible={activeFilter === 'dir'} onClose={closeFilter} title={`🧭 ${t('filter_direction')}`}>
        <Text style={[s.filterSectionLabel, { color: theme.textMuted }]}>{t('from')}</Text>
        <TextInput
          value={dirFrom}
          onChangeText={setDirFrom}
          placeholder={t('create_field_from_placeholder')}
          placeholderTextColor={v1.textMuted}
          style={[s.filterInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
        />
        {(() => {
          const cities = Array.from(new Set(currentData.map(d => (d.from || '').trim()).filter(Boolean))).slice(0, 8);
          if (cities.length === 0) return null;
          return (
            <View style={[s.filterPillRow, { marginTop: 8 }]}>
              {cities.map((c) => (
                <TouchableOpacity
                  key={`from-${c}`}
                  onPress={() => setDirFrom(c)}
                  style={[s.filterPill, { borderColor: v1.border, backgroundColor: dirFrom === c ? accentColor : v1.surface }]}
                >
                  <Text style={[s.filterPillText, { color: dirFrom === c ? '#0A0A0A' : v1.text }]} numberOfLines={1}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })()}

        <Text style={[s.filterSectionLabel, { color: theme.textMuted, marginTop: 12 }]}>{t('to')}</Text>
        <TextInput
          value={dirTo}
          onChangeText={setDirTo}
          placeholder={t('create_field_to_placeholder')}
          placeholderTextColor={v1.textMuted}
          style={[s.filterInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
        />
        {(() => {
          const cities = Array.from(new Set(currentData.map(d => (d.to || '').trim()).filter(Boolean))).slice(0, 8);
          if (cities.length === 0) return null;
          return (
            <View style={[s.filterPillRow, { marginTop: 8 }]}>
              {cities.map((c) => (
                <TouchableOpacity
                  key={`to-${c}`}
                  onPress={() => setDirTo(c)}
                  style={[s.filterPill, { borderColor: v1.border, backgroundColor: dirTo === c ? accentColor : v1.surface }]}
                >
                  <Text style={[s.filterPillText, { color: dirTo === c ? '#0A0A0A' : v1.text }]} numberOfLines={1}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })()}

        <View style={s.filterActions}>
          <TouchableOpacity
            style={[s.filterActionBtn, { backgroundColor: v1.surface, borderColor: v1.border, borderWidth: 1 }]}
            onPress={() => { setDirFrom(''); setDirTo(''); }}
          >
            <Text style={[s.filterActionText, { color: v1.textMuted }]}>{t('filter_reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.filterActionBtn, { backgroundColor: accentColor }]} onPress={closeFilter}>
            <Text style={[s.filterActionText, { color: '#0A0A0A' }]}>{t('filter_apply')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Date sheet — real calendar/date-picker for both ends of the
          window. DatePicker uses native <input type="date"> on web and
          a custom Modal calendar on native, so the chip never falls
          back to a plain TextInput. testID lets QA target it. */}
      <BottomSheet visible={activeFilter === 'date'} onClose={closeFilter} title={`📅 ${t('filter_date')}`}>
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
      <BottomSheet visible={activeFilter === 'body'} onClose={closeFilter} title={`🚛 ${t('filter_body')}`}>
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
      <BottomSheet visible={activeFilter === 'price'} onClose={closeFilter} title={`💰 ${t('filter_price')}`}>
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
          keyExtractor={i => i.id}
          renderItem={(args) => (isDriver || args.item.isMine) ? renderCargo(args) : renderDriver(args)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, gap: 0 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />}
          ListFooterComponent={
            filteredData.length > 0 ? (
              <View style={[s.footerNote, { borderColor: v1.border, backgroundColor: v1.surface }]}>
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

