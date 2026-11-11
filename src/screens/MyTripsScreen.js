import { isListingExpired } from '../utils/listingLifetime.js';
import { localizeUiText } from '../utils/additionalLocales.js';
import { sessionRole } from '../utils/publicationSession';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useToast } from '../components/Toast';
import { marketAPI } from '../utils/marketAPI';
import { vehicleAPI } from '../utils/vehicleAPI';
import { formatStatus, formatTruckType, formatBids } from '../utils/i18n';
import { formatDateForDisplay } from '../utils/dateInput';
import { formatPrice, normalizeTrip } from '../utils/normalizers';
import { localizePlace, localizeCargoName } from '../utils/places';
import EmptyState from '../components/ui/EmptyState';
import EditCargoModal from '../components/EditCargoModal';
import {v1Colors, useV1Colors, useDriverCeramicColors, v1AccentFor, v1StatusColors, v1Spacing, v1Typography} from '../theme/designV1';
import { useMountedRef } from '../hooks/useMountedRef';
import { useSafeRefresh } from '../hooks/useSafeRefresh';
import FadeInUp from '../components/ui/FadeInUp';
import Feather from '@expo/vector-icons/Feather';
import AppConfirmModal from '../components/ui/AppConfirmModal';
import { reconcileCreatedCargoOverlay } from '../utils/createdCargoOverlay';
import { isOwnedHistory } from '../utils/ownedListingHistory';
import RootHeader from '../components/ui/v1/RootHeader';
import MarketplaceCard from '../components/ui/v1/MarketplaceCard';
import DriverRouteBackdrop from '../components/ui/v1/DriverRouteBackdrop';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS, useAuth } from '../utils/AuthContext';

// Endpoint flag code for the v1 Flag component: backend from_country/
// to_country are ISO codes; anything else (empty, emoji leftovers) renders
// no flag rather than the grey «?» fallback.
const flagCodeOrNull = (value) => {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
};

// Публикация/сделка → цвет v1-роли. Статусы сделки (accepted…received,
// completed, cancelled) берутся из v1StatusColors; публикационные состояния
// — из семантических токенов. Раньше received/неизвестные статусы падали в
// дефолтный зелёный — теперь у каждого статуса явная маппинг-раскладка.
const myItemStatusColor = (colors, st) => {
  const role = v1StatusColors(colors)[st];
  if (role) return role;
  if (st === 'active') return colors.success;
  if (st === 'draft' || st === 'pending' || st === 'unpublished') return colors.textMuted;
  if (st === 'rejected' || st === 'expired') return colors.error;
  return colors.textDim;
};

// Latest request wins: a slow dashboard call can never trap the tab on a loader.
const withTimeout = (promise, timeoutMs = 12000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('dashboard_timeout')), timeoutMs);
  Promise.resolve(promise).then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

const EXPIRY_COPY = {
  RU: { expired: 'Срок публикации истёк', renew: 'Продлить на 30 дней', archive: 'Оставить в архиве', hide: 'Удалить', confirm: 'Скрыть объявление из личных списков?', success: 'Изменение сохранено', error: 'Не удалось сохранить. Повторите попытку.' },
  KK: { expired: 'Жариялау мерзімі аяқталды', renew: '30 күнге ұзарту', archive: 'Мұрағатта қалдыру', hide: 'Жою', confirm: 'Хабарландыруды жеке тізімдерден жасыру керек пе?', success: 'Өзгеріс сақталды', error: 'Сақтау мүмкін болмады. Қайталаңыз.' },
  ZH: { expired: '发布期限已过', renew: '延长30天', archive: '保留在归档中', hide: '删除', confirm: '从个人列表中隐藏此信息？', success: '更改已保存', error: '保存失败，请重试。' },
  EN: { expired: 'Publication period expired', renew: 'Extend for 30 days', archive: 'Keep in archive', hide: 'Delete', confirm: 'Hide this listing from your lists?', success: 'Change saved', error: 'Could not save. Please try again.' },
  TR: { expired: 'İlanın yayın süresi doldu', renew: '30 gün uzat', archive: 'Arşivde tut', hide: 'Sil', confirm: 'İlan listelerinizden gizlensin mi?', success: 'Değişiklik kaydedildi', error: 'Kaydedilemedi. Tekrar deneyin.' },
  UZ: { expired: 'Eʼlonning joylashtirish muddati tugadi', renew: '30 kunga uzaytirish', archive: 'Arxivda qoldirish', hide: 'Oʻchirish', confirm: 'Eʼlon shaxsiy roʻyxatlardan yashirilsinmi?', success: 'Oʻzgarish saqlandi', error: 'Saqlab boʻlmadi. Qayta urinib koʻring.' },
  KY: { expired: 'Жарыялоонун мөөнөтү аяктады', renew: '30 күнгө узартуу', archive: 'Архивде калтыруу', hide: 'Өчүрүү', confirm: 'Жарыя жеке тизмелерден жашырылсынбы?', success: 'Өзгөртүү сакталды', error: 'Сактоо мүмкүн болгон жок. Кайра аракет кылыңыз.' },
  TG: { expired: 'Муҳлати нашри эълон ба охир расид', renew: '30 рӯз дароз кардан', archive: 'Дар бойгонӣ мондан', hide: 'Нест кардан', confirm: 'Эълон аз рӯйхатҳои шахсӣ пинҳон шавад?', success: 'Тағйирот сабт шуд', error: 'Сабт нашуд. Дубора кӯшиш кунед.' },
  BE: { expired: 'Тэрмін публікацыі аб’явы скончыўся', renew: 'Падоўжыць на 30 дзён', archive: 'Пакінуць у архіве', hide: 'Выдаліць', confirm: 'Схаваць аб’яву з асабістых спісаў?', success: 'Змена захавана', error: 'Не ўдалося захаваць. Паспрабуйце яшчэ раз.' },
};

export default function MyTripsScreen({ navigation, route }) {
  const v1Base = useV1Colors();
  const ceramic = useDriverCeramicColors();
  const { session } = useAuth();
  const role = sessionRole(session, route.params?.role);
  const isDriver = role === 'driver';
  const v1 = isDriver ? ceramic : v1Base;
  const s = React.useMemo(() => StyleSheet.create({

  // v1 brand bar (mirrors FeedScreen)
  brandBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 30, fontWeight: '300' },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  brandText: { color: v1.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  ftlPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  ftlText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  menuBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // Дизайн 2026 v4 (03.08): заголовок 26→19px. Раньше «Мои грузы» занимал
  // визуально столько же, сколько сам список — user жаловался «как для слепого».
  titleBlock: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 },
  titleHero: { color: v1.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  titleSub: { color: v1.textMuted, fontSize: 12, marginTop: 1 },
  // Кнопка «Разместить рейс» (driver, §2.2.2). Текст чёрный — на изумруде
  // #168759 даёт AAA-контраст (источник истины — CLAUDE.md).
  // Дизайн 2026 v3 (03.08): outline вместо заливки — «+ Разместить груз» не
  // primary-CTA этой страницы (главное действие — тап по карточке груза).
  // Меньше 40px, тонкий контур, чтобы не «кричал» и не «для слепого».
  publishRouteBtn: { height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: 'transparent' },
  publishRouteText: { fontSize: 13, fontWeight: '700' },
  archiveToggle: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4, marginTop: 2 },
  archiveToggleText: { fontSize: 12, fontWeight: '700' },

  // Design v1 Commit 3: карточка объявления — каноническая MarketplaceCard
  // (radius 16, padding 16, border, без тени). Экран оставляет только
  // ленточный spacing (marginBottom 8 — плотность списка сохранена).
  cardSpacing: { marginBottom: 8 },
  // Дизайн 2026 v3: плашка «N предложений» — outline вместо заливки,
  // компактнее (меньше 32px), шрифт 12. Не «кричит».
  offersCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: v1Spacing.sm, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: v1.clientAccent || v1.warning, backgroundColor: 'transparent' },
  offersCtaText: { color: v1.warning, fontSize: 12, fontWeight: '700', flex: 1 },
  offersCtaArrow: { color: v1.warning, fontSize: 14, fontWeight: '700' },

  // 27.07: кнопки действий сделки вылезали за карточку. Делаем их гибкими
  // (flexGrow/Shrink + minWidth) — в ряду с flexWrap они заполняют ширину и
  // аккуратно переносятся на след. строку, не вылезая за края.
  acceptBtn: { backgroundColor: v1.active || v1.driver, borderRadius: 10, paddingVertical: v1Spacing.sm, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexShrink: 1, minWidth: 130, maxWidth: '100%' },
  acceptBtnText: { color: v1.activeText || v1.driverOnAccent || '#FFF', ...v1Typography.button, lineHeight: 20, flexShrink: 1, textAlign: 'center' },
  // «Для перчаток и солнца»: крупная тап-цель (≥44pt) и читаемый текст.
  miniBtn: { borderWidth: 0, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexShrink: 1, minWidth: 110, maxWidth: '100%', backgroundColor: 'rgba(148,163,184,0.14)' },
  miniBtnText: { fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  // Active cargo actions are visually compact; hitSlop keeps a 44dp touch target.
  cargoActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  cargoActionBtn: { height: 34, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', flex: 1, backgroundColor: 'transparent' },
  cargoActionText: { fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'center' },

  }), [v1]);
  const { t, lang } = useI18n();
  const { requireLevel, Gate } = useVerificationGate();
  const tonUnit = lang === 'ZH' ? localizeUiText('吨', lang) : lang === 'EN' ? localizeUiText('t', lang) : localizeUiText('т', lang);
  const cubicMeterUnit = lang === 'ZH' ? localizeUiText('立方米', lang) : localizeUiText('м³', lang);
  const { toast } = useToast();

  // Решение владельца (05.08.2026): «Грузы»/«Рейсы» — только управление
  // объявлениями. Один основной раздел (Мои рейсы / Мои грузы) + Архив
  // (вторичный toggle, не таб). Всё, что было «Завершённые»/«Доставлено» —
  // это уже сделки, они целиком в «Сделках». Легаси initialTab
  // (my/bids/deals/inwork/enroute/done/delivered) ремапим на основной раздел.
  const DRIVER_TABS_KEYS = ['routes', 'archive'];
  const CLIENT_TABS_KEYS = ['searching', 'archive'];
  const rawInitialTab = route.params?.initialTab || (isDriver ? 'routes' : 'searching');
  const normInitialTab = isDriver
    ? (DRIVER_TABS_KEYS.includes(rawInitialTab) ? rawInitialTab : 'routes')
    : (CLIENT_TABS_KEYS.includes(rawInitialTab) ? rawInitialTab : 'searching');
  const justCreatedTrip = route.params?.justCreatedTrip || null;
  // Клиентский аналог: только что опубликованный груз показываем сразу в
  // «Ищу машину», не дожидаясь серверного refetch (замыкаем цикл публикации).
  const justCreatedCargo = route.params?.justCreatedCargo || null;
  const [createdCargoOverlay, setCreatedCargoOverlay] = useState(justCreatedCargo);
  const createdCargoOverlayRef = useRef(justCreatedCargo);
  const [tab, setTab] = useState(normInitialTab);
  const [targetPublicationId, setTargetPublicationId] = useState(route.params?.targetPublicationId || null);
  const mounted = useMountedRef();  // QA-аудит P1-8
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!justCreatedTrip && !justCreatedCargo);
  const [refreshingList, setRefreshingList] = useState(false);
  const [editCargo, setEditCargo] = useState(null);  // задача A: правка своего груза
  const loadRequestRef = useRef(0);
  const pageRef = useRef({ busy: false, nextOffset: null, scope: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [archiveTotal, setArchiveTotal] = useState(null);
  const [publicationBusy, setPublicationBusy] = useState({});
  const publicationLocks = useRef(new Set());
  const publicationOwner = useRef(session?.user?.id);
  publicationOwner.current = session?.user?.id;

  const [confirmDialog, setConfirmDialog] = useState(null);

  // Гашение бейджа событий (26.07.2026, обе роли): живёт на вкладке «Сделки»
  // (ChatsListScreen в dealsMode). Здесь ничего не гасим — иначе бейдж
  // пропадал бы от простого захода в «Мои рейсы»/«Мои грузы».

  const publishingRouteRef = useRef(false);
  const onPublishRoute = async () => {
    if (publishingRouteRef.current) return;
    publishingRouteRef.current = true;
    try {
      const result = await vehicleAPI.list();
      if (!mounted.current) return;
      // Failed authentication/network requests are not an empty garage.
      if (!result?.ok || !Array.isArray(result.vehicles)) {
        toast(result?.detail || t('network_error'), 'error');
        return;
      }
      const vehicles = result.vehicles;
      // Listing a route must not force a second vehicle registration.
      // The create-trip API still enforces identity/publication eligibility.
      if (vehicles.length === 0) navigation.navigate('CreateTrip', { role });
      else if (vehicles.length === 1) navigation.navigate('CreateTrip', { role, vehicle: vehicles[0], vehicleId: vehicles[0].id });
      else navigation.navigate('VehicleChooser', { role, origin: 'CreateTrip' });
    } catch {
      if (mounted.current) toast(t('network_error'), 'error');
    } finally {
      publishingRouteRef.current = false;
    }
  };

  const confirmAction = async (msg, confirmLabel = t('confirm'), destructive = false) => (
    new Promise((resolve) => setConfirmDialog({ msg, confirmLabel, destructive, resolve }))
  );
  const settleConfirm = (answer) => {
    setConfirmDialog((current) => { current?.resolve?.(answer); return null; });
  };

  const load = useCallback(async ({ showLoading = true, append = false } = {}) => {
    const previous = pageRef.current;
    if (append && (previous.busy || previous.nextOffset == null)) return;
    const requestId = ++loadRequestRef.current;
    const offset = append ? previous.nextOffset : 0;
    const section = tab === 'archive' ? 'history' : 'active';
    pageRef.current = { ...previous, busy: true, nextOffset: append ? previous.nextOffset : null };
    if (append) setLoadingMore(true);
    else if (showLoading) setLoading(true);
    else setRefreshingList(true);
    setLoadError(false);
    try {
      const token = await withTimeout(require('../utils/storage').storage.get('ur_reg_token'));
      if (!mounted.current || requestId !== loadRequestRef.current) return;
      let next;
      let page = { next_offset: null };
      if (!token) {
        if (!isDriver) {
          // Never keep owner-scoped cargo (including the optimistic publish
          // overlay) visible after the session has expired or the account logs out.
          createdCargoOverlayRef.current = null;
          setCreatedCargoOverlay(null);
          setData({ my_trips: [], my_cargos: [], authRequired: true });
          setArchiveTotal(null);
          pageRef.current = { busy: false, nextOffset: null, scope: null };
          return;
        }
        if (isDriver) {
          const trips = await withTimeout(marketAPI.listTrips({}));
          if (trips.serverError) throw new Error('list_failed');
          next = { my_trips: trips.trips || [], my_cargos: [], authRequired: true };
        } else {
          next = { my_trips: [], my_cargos: [], authRequired: true };
        }
      } else {
        page = await withTimeout(marketAPI.myListings({ kind: isDriver ? 'trip' : 'cargo', section, limit: 50, offset,
          listingId: tab === 'archive' ? targetPublicationId : null }));
        if (page.serverError) throw new Error('list_failed');
        if (!mounted.current || requestId !== loadRequestRef.current) return;
        if (page.authRequired || (append && page.scope !== previous.scope)) {
          createdCargoOverlayRef.current = null;
          setCreatedCargoOverlay(null);
          setData({ my_trips: [], my_cargos: [], authRequired: true });
          setArchiveTotal(null);
          pageRef.current = { busy: false, nextOffset: null, scope: null };
          return;
        }
        const key = isDriver ? 'my_trips' : 'my_cargos';
        next = { [key]: page.items, section };
      }
      if (mounted.current && requestId === loadRequestRef.current) {
        if (!isDriver && !append) {
          const reconciled = reconcileCreatedCargoOverlay(
            next.my_cargos || [],
            createdCargoOverlayRef.current,
            { authoritative: true },
          );
          next = { ...next, my_cargos: reconciled.items };
          createdCargoOverlayRef.current = reconciled.overlay;
          setCreatedCargoOverlay(reconciled.overlay);
        }
        setData(current => {
          if (!append) return next;
          const key = isDriver ? 'my_trips' : 'my_cargos';
          // Граничные записи при изменении ленты не дублируем.
          const items = new Map([...(current?.[key] || []), ...(next[key] || [])].map(item => [item.id, item]));
          return { ...next, [key]: [...items.values()] };
        });
        setArchiveTotal(page.history_total ?? null);
        pageRef.current = { busy: false, nextOffset: page.next_offset, scope: page.scope || null };
      }
    } catch (e) {
      if (mounted.current && requestId === loadRequestRef.current) {
        setLoadError(true);
        console.warn('[MyTrips] load error:', e.message);
      }
    } finally {
      if (mounted.current && requestId === loadRequestRef.current) {
        pageRef.current.busy = false;
        setLoading(false);
        setRefreshingList(false);
        setLoadingMore(false);
      }
    }
  }, [isDriver, tab, mounted, targetPublicationId]);

  const { refreshing, onRefresh } = useSafeRefresh(
    useCallback(() => load({ showLoading: false }), [load]),
  );

  useEffect(() => {
    if (justCreatedTrip) {
      setData({ my_trips: [justCreatedTrip], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [] });
      setLoading(false);
      load({ showLoading: false });
    } else if (justCreatedCargo) {
      // Cargo is rendered through the one-shot overlay above. Do not seed the
      // backing list here: `load` changes with the selected tab, so this effect
      // can run again after an authoritative response has cleared the overlay.
      setLoading(false);
      // Фоном подтягиваем серверные данные, чтобы список стал полным.
      load({ showLoading: false });
    } else {
      load();
    }
  }, [justCreatedCargo, justCreatedTrip, load, isDriver]);

  // 27.07: перечитываем список при каждом возврате на экран — иначе статус
  // сделки (Везут/Доставлено), изменённый второй стороной, не обновлялся до
  // ручного pull-to-refresh.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { load({ showLoading: false }); });
    return unsub;
  }, [navigation, load]);

  let myItemsRaw = isDriver ? (data?.my_trips || []) : (data?.my_cargos || []);
  if (justCreatedTrip && isDriver && !myItemsRaw.find(i => i.id === justCreatedTrip.id)) {
    myItemsRaw = [justCreatedTrip, ...myItemsRaw];
  }
  if (!isDriver && createdCargoOverlay) {
    myItemsRaw = reconcileCreatedCargoOverlay(myItemsRaw, createdCargoOverlay).items;
  }

  // Срок публикации: ровно 30 суток UTC от published_at, fallback created_at.
  const isExpiredItem = isListingExpired;
  // Статус имеет приоритет над датой: закрытые и занятые записи остаются
  // в истории с исходным статусом, без кнопки продления активного объявления.
  const isOpenPublicationStatus = (it) => !it.status || it.status === 'active' || it.status === 'draft';
  const myItemsActive = myItemsRaw.filter((it) => isOpenPublicationStatus(it) && !isExpiredItem(it));
  const myItemsExpired = myItemsRaw.filter((it) => it.status === 'expired' || (isOpenPublicationStatus(it) && isExpiredItem(it)));
  const myItems = [...myItemsActive, ...myItemsExpired.map(it => ({ ...it, _expired: true }))];

  const myBids = isDriver ? (data?.my_bids || []) : (data?.incoming_bids || []);
  // Валюта суммы ставки/сделки. Бэкенд теперь отдаёт currency на ставках
  // (my_bids/incoming_bids) и сделках (JOIN на cargos.currency); фолбэк — по
  // cargo_id из моих грузов; иначе 'USD' (formatPrice → '$'). Это убирает
  // хардкод «$» на грузах в KZT/RUB/CNY, старые ставки без currency не ломаются.
  const currencyFor = (item) =>
    (item && item.currency)
    || (item && (data?.my_cargos || []).find((cc) => cc.id === item.cargo_id)?.currency)
    || 'USD';

  // В активном разделе остаются только открытые грузы.
  const clientSearching = myItems.filter((c) => !c.status || c.status === 'active');
  // История показывает все неактивные объявления без изменения их статусов.
  const historyItems = myItemsRaw.filter((it) => isOwnedHistory(it, isDriver))
    .map((it) => ({ ...it, _kind: 'history' }));
  const driverArchive = historyItems;
  const clientArchive = historyItems;

  // ─── Cards ───

  const renderMyItem = ({ item }) => {
    const from = item.from_city || '—';
    const to = item.to_city || '—';
    const desc = item.cargo_desc || '';
    const isCargo = !!item.cargo_desc;
    // Edit/unpublish is allowed only for an own ACTIVE trip. Backend remains
    // authoritative and rejects removal once a deal has already taken it.
    const canEditTrip = !isCargo && (item.status || 'active') === 'active';
    const st = item.status || 'active';

    // RC2 hotfix (P0-3): для cargos показываем pickup_date, не created_at.
    // Для trips остаётся departure || created_at. Вес/объём: cargo и trip
    // используют разные имена полей, единицы локализуются вместе с карточкой.
    const dateText = isCargo
      ? formatDateForDisplay(item.pickup_date || item.departure || item.created_at)
      : formatDateForDisplay(item.departure || item.created_at);
    const specLine = [
      formatTruckType(item.truck_type || item.cargo_type),
      (isCargo ? item.weight_tons : item.capacity_tons) ? `${isCargo ? item.weight_tons : item.capacity_tons} ${tonUnit}` : null,
      (isCargo ? item.volume_m3 : item.available_m3) ? `${isCargo ? item.volume_m3 : item.available_m3} ${cubicMeterUnit}` : null,
    ].filter(Boolean).join(' · ');

    return (
      <MarketplaceCard
        variant={isDriver ? 'driver' : 'default'}
        testID={isCargo ? 'my-cargo-card' : 'my-trip-card'}
        style={s.cardSpacing}
        onPress={() => {
          if (isCargo) {
            navigation.navigate('CargoDetail', { cargo: { ...item, from, to, cargo: desc, isMine: true, _server: true }, cargoId: item.id, role });
          } else {
            // Tap on own trip card → open canonical TripDetail
            navigation.navigate('TripDetail', { trip: normalizeTrip({ ...item, isMine: true, _server: true }), tripId: item.id, role });
          }
        }}
        route={{
          from: localizePlace(from, lang),
          to: localizePlace(to, lang),
          fromFlag: flagCodeOrNull(item.from_country),
          toFlag: flagCodeOrNull(item.to_country),
          numberOfLines: 1,
        }}
        price={formatPrice(item.price, item.currency, t)}
        priceMeta={dateText}
        meta={[specLine]}
        description={desc ? localizeCargoName(desc, lang) : null}
        status={item._expired
          ? { key: 'expired', label: t('deadline_expired'), color: v1.error }
          : { key: st, label: formatStatus(st), color: myItemStatusColor(v1, st) }}
        rightMeta={item.bids_count > 0 && !(isCargo && !isDriver) ? formatBids(item.bids_count) : null}
      >
        {/* Индикатор откликов на карточке груза. С 26.07.2026 работа со
            ставками живёт во вкладке «Сделки» — тап по плашке ведёт туда
            (витрина показывает «есть отклик», решение принимается в Сделках). */}
        {isCargo && !isDriver && item.bids_count > 0 && st === 'active' && (
          <TouchableOpacity
            style={s.offersCta}
            testID="cargo-offers-cta"
            onPress={(e) => { e.stopPropagation && e.stopPropagation(); navigation.navigate('Deals'); }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Feather name="message-square" size={14} color={v1.clientAccent || v1.warning} />
              <Text style={s.offersCtaText} numberOfLines={1}>{formatBids(item.bids_count)}</Text>
            </View>
            <Text style={s.offersCtaArrow}>›</Text>
          </TouchableOpacity>
        )}
        {canEditTrip && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              testID="my-trip-edit-btn"
              style={[s.miniBtn, { flex: 1 }]}
              onPress={(e) => {
                e.stopPropagation && e.stopPropagation();
                navigation.navigate('EditTrip', { tripId: item.id, trip: normalizeTrip({ ...item, isMine: true, _server: true }) });
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="edit-3" size={14} color={v1.success} />
                <Text style={[s.miniBtnText, { color: v1.success }]}>{t('edit_btn')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              testID="my-trip-unpublish-btn"
              style={[s.miniBtn, { flex: 1 }]}
              onPress={async (e) => {
                e.stopPropagation && e.stopPropagation();
                if (!(await confirmAction(t('trip_delete_q'), t('trip_delete'), true))) return;
                const r = await marketAPI.unpublishTrip(item.id);
                if (r?.ok) { toast('🗑 ' + t('trip_deleted_toast'), 'info'); load(); }
                else toast(r?.detail || t('update_failed'), 'error');
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="trash-2" size={14} color={v1.error} />
                <Text style={[s.miniBtnText, { color: v1.error }]}>{t('trip_delete')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
        {/* Задача A: управление СВОИМ грузом — Изменить (цена/описание) + Удалить.
            Только для активного груза (taken/принятый редактировать нельзя). */}
        {isCargo && !isDriver && st === 'active' && (
          <View style={s.cargoActions}>
            <TouchableOpacity
              testID="my-cargo-edit-btn"
              hitSlop={{ top: 5, right: 4, bottom: 5, left: 4 }}
              style={[s.cargoActionBtn, { borderColor: v1.clientAccent || v1.warning }]}
              onPress={(e) => { e.stopPropagation && e.stopPropagation(); setEditCargo(item); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="edit-3" size={14} color={v1.clientAccent || v1.warning} />
                <Text style={[s.cargoActionText, { color: v1.warning }]}>{t('edit_btn')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              testID="my-cargo-delete-btn"
              hitSlop={{ top: 5, right: 4, bottom: 5, left: 4 }}
              style={[s.cargoActionBtn, { borderColor: v1.error }]}
              onPress={async (e) => {
                e.stopPropagation && e.stopPropagation();
                if (!(await confirmAction(t('delete_cargo_confirm')))) return;
                const r = await marketAPI.deleteCargo(item.id);
                if (r && (r.ok || r.ok === undefined)) { toast(t('cargo_deleted'), 'success'); load(); }
                else toast((r && r.detail) || t('delete_failed'), 'error');
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="trash-2" size={14} color={v1.error} />
                <Text style={[s.cargoActionText, { color: v1.error }]}>{t('delete_btn')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </MarketplaceCard>
    );
  };

  // Карточка сделки/статус перевозки/чат/трекинг/отзыв — переехали целиком в
  // «Сделки» (ChatScreen), решение владельца 05.08.2026: «Мои рейсы»/«Мои
  // грузы» — только управление объявлениями. renderDeal/openDealCard/
  // setDealStatusOnServer удалены как мёртвый код вместе с этим экраном.

  // renderBid удалён: единственный вызов был из renderArchiveItem для
  // _kind==='bid', а такие записи в архив больше не попадают (отклонённые/
  // отменённые ставки теперь показываются в «Сделках» статусом «Отменено» —
  // см. ChatsListScreen.js). Accept/reject/counter самих ставок — там же.

  // ─── Layout ───

  const v1Accent = isDriver
    ? { main: ceramic.active, deep: ceramic.driverDeep, soft: ceramic.activeSoft }
    : v1AccentFor('client');

  const performPublicationAction = async (item, action) => {
    const owner = publicationOwner.current;
    const key = String(item.id);
    if (!owner || publicationLocks.current.has(key)) return;
    if (action === 'hide' && !(await confirmAction((EXPIRY_COPY[lang] || EXPIRY_COPY.EN).confirm, t('confirm'), true))) return;
    if (publicationOwner.current !== owner || publicationLocks.current.has(key)) return;
    publicationLocks.current.add(key);
    setPublicationBusy(current => ({ ...current, [key]: true }));
    try {
      const result = await marketAPI.ownedPublicationAction(isDriver ? 'trip' : 'cargo', item.id, action, item.publication_period_id);
      if (publicationOwner.current !== owner) return;
      if (result?.ok === true) { toast((EXPIRY_COPY[lang] || EXPIRY_COPY.EN).success, 'success'); load(); }
      else toast((EXPIRY_COPY[lang] || EXPIRY_COPY.EN).error, 'error');
    } finally {
      publicationLocks.current.delete(key);
      setPublicationBusy(current => { const next = { ...current }; delete next[key]; return next; });
    }
  };

  const renderHistoryItem = ({ item }) => {
    const isCargo = !isDriver;
    const from = item.from_city || '—';
    const to = item.to_city || '—';
    return (
      <MarketplaceCard
        variant={isDriver ? 'driver' : 'default'}
        testID="my-history-card"
        dimmed={!(item.status === 'expired' && item.publication_period_id)}
        style={s.cardSpacing}
        onPress={() => {
          if (isCargo) navigation.navigate('CargoDetail', { cargo: { ...item, from, to, cargo: item.cargo_desc, isMine: true, _server: true }, cargoId: item.id, role, readOnly: true });
          else navigation.navigate('TripDetail', { trip: normalizeTrip({ ...item, isMine: true, _server: true }), tripId: item.id, role, readOnly: true });
        }}
        route={{
          from: localizePlace(from, lang),
          to: localizePlace(to, lang),
          fromFlag: flagCodeOrNull(item.from_country),
          toFlag: flagCodeOrNull(item.to_country),
          numberOfLines: 1,
        }}
        price={formatPrice(item.price, item.currency, t)}
        priceMeta={formatDateForDisplay((isCargo ? item.pickup_date : item.departure) || item.created_at)}
        status={{ key: item.status, label: item.status === 'expired' && item.publication_period_id ? (EXPIRY_COPY[lang] || EXPIRY_COPY.EN).expired : formatStatus(item.status), color: v1.textDim }}
      >
        {item.status === 'expired' && item.publication_period_id ? <View style={[s.cargoActions, { flexWrap: 'wrap' }]}>
          {['renew', 'archive', 'hide'].map(action => <TouchableOpacity key={action}
            testID={`publication-${action}`} disabled={!!publicationBusy[String(item.id)]}
            style={[s.miniBtn, { flex: 1 }]}
            onPress={event => { event.stopPropagation?.(); performPublicationAction(item, action); }}>
            <Text style={[s.miniBtnText, { color: action === 'hide' ? v1.error : v1.text }]}>{(EXPIRY_COPY[lang] || EXPIRY_COPY.EN)[action]}</Text>
          </TouchableOpacity>)}
        </View> : null}
      </MarketplaceCard>
    );
  };

  // В архиве каждая карточка сохраняет исходный статус объявления.
  const DRIVER_DATA = { routes: myItems, archive: driverArchive };
  const DRIVER_RENDER = { routes: renderMyItem, archive: renderHistoryItem };
  const CLIENT_DATA = { searching: clientSearching, archive: clientArchive };
  const CLIENT_RENDER = { searching: renderMyItem, archive: renderHistoryItem };
  const sectionMatches = !data?.section || data.section === (tab === 'archive' ? 'history' : 'active');
  const listData = sectionMatches ? (isDriver ? (DRIVER_DATA[tab] || []) : (CLIENT_DATA[tab] || [])) : [];
  const listRenderBase = isDriver ? (DRIVER_RENDER[tab] || renderMyItem) : (CLIENT_RENDER[tab] || renderMyItem);
  // Промпт-дизайн: карточки появляются каскадом (выезд 10px + fade, 50мс шаг).
  const listRender = ({ item, index }) => (
    <FadeInUp delay={Math.min(index || 0, 8) * 50}>
      {listRenderBase({ item })}
    </FadeInUp>
  );

  const renderEmpty = () => {
    if (data?.authRequired) {
      // FINAL 10/10 AUTH CANON CLOSURE (2026-09-14): route through the
      // canonical AuthV2 entry, not the legacy 'Role' screen — see
      // VerificationGate.js's handleProceed for the same rule.
      return <EmptyState title={t('gate_login')} description={t('gate_login_desc')} actionLabel={t('gate_enter')} onAction={() => navigation.navigate('PhoneV2', { role: isDriver ? 'driver' : 'client' })} />;
    }
    if (isDriver) {
      if (tab === 'routes') return <EmptyState title={t('no_trips_yet')} description={t('no_trips_desc')} actionLabel={t('publish_route')} onAction={onPublishRoute} />;
      return <EmptyState title={t('no_archive_yet')} description={t('no_archive_desc')} />;
    }
    if (tab === 'searching') return <EmptyState title={t('no_cargos_yet')} description={t('client_searching_desc')} actionLabel={t('place_cargo')} onAction={() => navigation.navigate('CreateCargo')} />;
    return <EmptyState title={t('no_archive_yet')} description={t('no_archive_desc')} />;
  };

  return (
    <SafeAreaView testID="my-work-screen" style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
      {isDriver ? <DriverRouteBackdrop /> : null}
      <RootHeader
        ceramic={isDriver}
        navigation={navigation}
        role={role}
        showBack={route?.name === 'MyTripsList'}
        testID="mywork-minimal-header"
        menuTestID="mywork-menu-btn"
      />

      <FlatList
        data={listData}
        keyExtractor={(i, idx) => (i._kind ? i._kind + ':' : '') + (i.id ?? idx)}
        renderItem={listRender}
        ListHeaderComponent={(
          <>
            <View style={s.titleBlock}>
              <Text style={s.titleHero}>{isDriver ? t('my_trips_title') : t('my_cargos_title')}</Text>
              <Text style={s.titleSub}>{isDriver ? t('my_trips_subtitle') : t('my_cargos_subtitle')}</Text>
            </View>
            <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
              <TouchableOpacity
                testID={isDriver ? 'mytrips-publish-route' : 'mytrips-place-cargo'}
                onPress={isDriver ? onPublishRoute : () => navigation.navigate('CreateCargo', { role })}
                activeOpacity={0.75}
                style={[s.publishRouteBtn, { borderColor: v1Accent.main }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="plus" size={14} color={v1Accent.main} />
                  <Text style={[s.publishRouteText, { color: v1Accent.main }]}>{isDriver ? t('publish_route') : t('place_cargo')}</Text>
                </View>
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 16 }}>
              <TouchableOpacity
                testID="my-work-archive-toggle"
                onPress={() => { setTargetPublicationId(null); setTab(tab === 'archive' ? (isDriver ? 'routes' : 'searching') : 'archive'); }}
                style={s.archiveToggle}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[s.archiveToggleText, { color: tab === 'archive' ? v1Accent.main : v1.textMuted }]}>
                  {tab === 'archive' ? `‹ ${t('back_to_active')}` : `${t('tab_archive')}${archiveTotal == null ? '' : ` (${archiveTotal})`} ›`}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing || refreshingList} onRefresh={onRefresh} />}
        ListEmptyComponent={!loading && !loadError ? renderEmpty() : null}
        ListFooterComponent={(
          <View>
            {loadError ? <Text style={[s.titleSub, { color: v1.error }]}>{t('load_error')}</Text> : null}
            {(loadError || pageRef.current.nextOffset != null) && (
              <TouchableOpacity
                testID="my-work-load-more"
                style={s.miniBtn}
                disabled={loadingMore || loading || refreshingList}
                onPress={() => load({ showLoading: false, append: pageRef.current.nextOffset != null })}
              >
                <Text style={[s.miniBtnText, { color: v1Accent.main }]}>
                  {loadingMore ? t('my_work_loading') : loadError ? t('chat_attach_retry') : t('my_work_load_more')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      <EditCargoModal
        visible={!!editCargo}
        cargo={editCargo}
        onClose={() => setEditCargo(null)}
        onSaved={() => load()}
      />

      <AppConfirmModal
        visible={!!confirmDialog}
        title={confirmDialog?.msg}
        cancelLabel={t('cancel')}
        confirmLabel={confirmDialog?.confirmLabel || t('confirm')}
        destructive={!!confirmDialog?.destructive}
        onCancel={() => settleConfirm(false)}
        onConfirm={() => settleConfirm(true)}
        testID="my-trips-confirm-modal"
      />
      {Gate}
    </SafeAreaView>
  );
}
