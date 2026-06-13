import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, Platform, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { marketAPI } from '../utils/marketAPI';
import { regAPI } from '../utils/registration';
import { formatStatus, formatTruckType, formatBids } from '../utils/i18n';
import { formatDateForDisplay } from '../utils/dateInput';
import { formatPrice, normalizeTrip } from '../utils/normalizers';
import EmptyState from '../components/ui/EmptyState';
import BidModal from '../components/BidModal';
import EditCargoModal from '../components/EditCargoModal';
import { colors, spacing, radius, typography } from '../theme/theme';
import {v1Colors, useV1Colors, v1AccentFor} from '../theme/designV1';
import SegmentTabs from '../components/ui/v1/SegmentTabs';
import StatsRow from '../components/ui/v1/StatsRow';
import BellBadge from '../components/ui/v1/BellBadge';
import { useUnreadNotifications } from '../utils/useUnreadNotifications';
import { useMountedRef } from '../hooks/useMountedRef';
import { useDealLocationBroadcast } from '../hooks/useDealLocationBroadcast';

export default function MyTripsScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  // v1 brand bar (mirrors FeedScreen)
  brandBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 30, fontWeight: '300' },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  brandText: { color: v1.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  ftlPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  ftlText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  bellBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: v1.surface },
  bellIcon: { fontSize: 18 },
  titleBlock: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  titleHero: { color: v1.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  titleSub: { color: v1.textMuted, fontSize: 12, marginTop: 2 },
  // Кнопка «Разместить рейс» (driver, §2.2.2). Текст чёрный — на изумруде
  // #00E676 даёт AAA-контраст (источник истины — CLAUDE.md).
  publishRouteBtn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  publishRouteText: { color: '#0C0A09', fontSize: 15, fontWeight: '800' },
  // Gate-модалка размещения рейса (progressive verification).
  pgBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  pgCard: { width: '100%', maxWidth: 420, backgroundColor: v1.surface, borderRadius: 20, padding: 24, alignItems: 'center' },
  pgIcon: { fontSize: 44, marginBottom: 12 },
  pgTitle: { color: v1.text, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  pgText: { color: v1.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 22 },
  pgBtn: { height: 52, borderRadius: 14, backgroundColor: '#00E676', alignItems: 'center', justifyContent: 'center', width: '100%' },
  pgBtnText: { color: '#0C0A09', fontSize: 16, fontWeight: '800' },
  pgCancel: { marginTop: 10, paddingVertical: 8 },
  pgCancelText: { color: v1.textMuted, fontSize: 13, fontWeight: '600' },
  // Legacy local styles still used by existing renderBid / renderDeal /
  // renderMyItem; kept untouched to preserve their layout.
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, fontWeight: '300' },
  headerTitle: { ...typography.h2, textAlign: 'center' },
  headerSub: { ...typography.caption, textAlign: 'center', marginTop: 2 },

  tabs: { flexDirection: 'row', marginHorizontal: spacing.lg, borderRadius: radius.sm, padding: 3, marginBottom: spacing.md, borderWidth: 1 },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: 7, alignItems: 'center', borderWidth: 1 },
  tabText: { ...typography.caption, fontWeight: '700' },
  archiveToggle: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4, marginTop: 2 },
  archiveToggleText: { fontSize: 12, fontWeight: '700' },

  card: { borderRadius: radius.md, padding: spacing.md, borderWidth: 1, marginBottom: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  statusLabel: { ...typography.small },
  route: { ...typography.title, marginBottom: 4 },
  desc: { ...typography.body, marginBottom: spacing.xs },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.xs },
  metaItem: { ...typography.caption },
  metaDot: { color: '#475569', fontSize: 10 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  price: { ...typography.h2, color: '#22C55E' },
  bidsLabel: { ...typography.caption, flex: 1 },

  chatBtn: { backgroundColor: '#22C55E', borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  chatBtnText: { color: '#FFF', ...typography.title },
  acceptBtn: { backgroundColor: '#22C55E', borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  acceptBtnText: { color: '#FFF', ...typography.title },
  rejectBtn: { borderWidth: 1, borderColor: '#EF4444', borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
  rejectBtnText: { color: '#EF4444', ...typography.title },
  miniBtn: { borderWidth: 1, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10 },
  miniBtnText: { fontSize: 11, fontWeight: '700' },
  editBtn: { borderWidth: 1, borderColor: '#22C55E', borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: spacing.sm },
  editBtnText: { color: '#22C55E', fontSize: 12, fontWeight: '700' },

  }), [v1]);
  const { role } = route.params || {};
  const isDriver = role === 'driver';
  const accent = isDriver ? '#22C55E' : '#F59E0B';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const notifUnread = useUnreadNotifications();

  // Driver tabs (issue #2): routes / offers / inwork / done (+ secondary
  // archive). Client (грузоотправитель) — зеркало в его терминах:
  // searching / enroute / delivered (+ archive). Legacy initialTab
  // (my/bids/deals) ремапим, чтобы deep-links/nav приземлялись корректно.
  const DRIVER_TABS_KEYS = ['routes', 'offers', 'inwork', 'done', 'archive'];
  const CLIENT_TABS_KEYS = ['searching', 'enroute', 'delivered', 'archive'];
  const rawInitialTab = route.params?.initialTab || (isDriver ? 'routes' : 'searching');
  const normInitialTab = isDriver
    ? (DRIVER_TABS_KEYS.includes(rawInitialTab)
        ? rawInitialTab
        : (rawInitialTab === 'bids' ? 'offers' : rawInitialTab === 'deals' ? 'inwork' : 'routes'))
    : (CLIENT_TABS_KEYS.includes(rawInitialTab)
        ? rawInitialTab
        : (rawInitialTab === 'deals' ? 'enroute' : 'searching'));
  const justCreatedTrip = route.params?.justCreatedTrip || null;
  const [tab, setTab] = useState(normInitialTab);
  const mounted = useMountedRef();  // QA-аудит P1-8
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!justCreatedTrip);
  const [bidModal, setBidModal] = useState(false);
  const [bidModalMode, setBidModalMode] = useState('edit');
  const [editingBid, setEditingBid] = useState(null);
  const [editCargo, setEditCargo] = useState(null);  // задача A: правка своего груза
  const [busyBidId, setBusyBidId] = useState(null);

  // Progressive verification: размещение рейса — trust-действие, доступно
  // только одобренному водителю. Источник статуса — regAPI.me()
  // ({status, verification_level}). verState: loading|approved|review|
  // rejected|unverified. Без fake-approved: CreateTrip открывается только
  // при approved, иначе показываем gate-модалку → 5-шаговая проверка.
  const [verState, setVerState] = useState('loading');
  const [pubGateVisible, setPubGateVisible] = useState(false);

  useEffect(() => {
    if (!isDriver) { setVerState('approved'); return; } // у клиента кнопки размещения рейса нет
    let alive = true;
    (async () => {
      try {
        const me = await regAPI.me();
        if (!alive) return;
        if (me && (me.status === 'approved' || me.verification_level >= 3)) setVerState('approved');
        else if (me && (me.status === 'pending' || me.status === 'under_review' || me.status === 'manual_review')) setVerState('review');
        else if (me && me.status === 'rejected') setVerState('rejected');
        else setVerState('unverified');
      } catch {
        if (alive) setVerState('unverified');
      }
    })();
    return () => { alive = false; };
  }, [isDriver]);

  const onPublishRoute = () => {
    if (verState === 'approved') navigation.navigate('CreateTrip', { role });
    else setPubGateVisible(true);
  };

  const confirmAction = async (msg) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      return window.confirm(msg);
    }
    return new Promise(resolve => {
      Alert.alert(msg, '', [
        { text: t('cancel'), onPress: () => resolve(false) },
        { text: 'OK', onPress: () => resolve(true) },
      ]);
    });
  };

  const load = async () => {
    setLoading(true);
    try {
      const token = await require('../utils/storage').storage.get('ur_reg_token');
      if (!token) {
        if (isDriver) {
          const trips = await marketAPI.listTrips({});
          if (!mounted.current) return;  // QA-аудит P1-8: экран размонтирован
          setData({ my_trips: trips.trips || [], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [], authRequired: true });
        } else {
          if (!mounted.current) return;
          setData({ my_trips: [], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [], authRequired: true });
        }
      } else {
        let d = await marketAPI.myDashboard();
        if (d.serverError && isDriver) {
          try { const trips = await marketAPI.listTrips({}); d = { ...d, my_trips: (trips.trips || []) }; } catch {}
        }
        if (!mounted.current) return;
        setData(d);
      }
    } catch (e) { console.warn('[MyTrips] load error:', e.message); }
    if (mounted.current) setLoading(false);
  };

  useEffect(() => {
    if (justCreatedTrip) {
      setData({ my_trips: [justCreatedTrip], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [] });
      setLoading(false);
    } else {
      load();
    }
  }, []);

  let myItemsRaw = isDriver ? (data?.my_trips || []) : (data?.my_cargos || []);
  if (justCreatedTrip && isDriver && !myItemsRaw.find(i => i.id === justCreatedTrip.id)) {
    myItemsRaw = [justCreatedTrip, ...myItemsRaw];
  }

  // RC2 hotfix (P0-4): expired (pickup_date < сегодня) больше не
  // попадают в Active. Перемещаем их в Archive виртуально (без
  // изменения backend status). Tab='deals' (Архив) теперь покажет
  // server-side completed/cancelled + локально expired.
  const parseDate = (s) => {
    if (!s) return null;
    const str = String(s).trim();
    for (const fmt of [
      /^(\d{4})-(\d{2})-(\d{2})/,           // YYYY-MM-DD (+ timestamp)
      /^(\d{2})\.(\d{2})\.(\d{4})$/,        // DD.MM.YYYY
    ]) {
      const m = fmt.exec(str);
      if (m) {
        const [, p1, p2, p3] = m;
        // ISO branch: p1=YYYY, p2=MM, p3=DD; DD.MM.YYYY branch swap
        const yyyy = p1.length === 4 ? +p1 : +p3;
        const mm = +p2;
        const dd = p1.length === 4 ? +p3 : +p1;
        return new Date(yyyy, mm - 1, dd);
      }
    }
    return null;
  };
  const isExpiredItem = (it) => {
    const d = parseDate(it.pickup_date || it.departure);
    if (!d) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // expired = pickup_date < today (strictly). today itself remains
    // active.
    return d < today;
  };
  const myItemsActive = myItemsRaw.filter((it) => !isExpiredItem(it));
  const myItemsExpired = myItemsRaw.filter((it) => isExpiredItem(it));
  const myItems = myItemsActive;

  const myBids = isDriver ? (data?.my_bids || []) : (data?.incoming_bids || []);
  // Архив: server-deals + локально-вычисленные expired (без изменения
  // backend данных). justCreated не дублируется т.к. он active.
  const myDeals = [
    ...((data?.my_deals) || []),
    ...myItemsExpired.map((it) => ({ ...it, _expired: true })),
  ];

  // ─── Driver tab buckets (issue #2/#3) ───
  // Жёсткий маппинг статусов сделок/ставок на 4 driver-вкладки + вторичный
  // Архив. Карточка с «Начать перевозку» (accepted/in_progress) НИКОГДА не
  // попадает в Архив — она живёт только в «В работе».
  //   pending | countered                 → Предложения (offers)
  //   accepted | in_progress | picked_up  → В работе (inwork)
  //   completed | delivered               → Завершённые (done)
  //   cancelled | rejected | expired      → Архив (вторичный фильтр)
  const IN_WORK_STATUSES = ['accepted', 'in_progress', 'picked_up'];
  const DONE_STATUSES = ['completed', 'delivered'];
  const ARCHIVE_STATUSES = ['cancelled', 'rejected', 'expired'];
  const serverDeals = (data?.my_deals) || [];
  const driverOffers = myBids.filter((b) => ['pending', 'countered'].includes(b.status));
  const driverInWork = serverDeals.filter((d) => IN_WORK_STATUSES.includes(d.status));
  const driverDone = serverDeals.filter((d) => DONE_STATUSES.includes(d.status));
  // Задача B: водитель транслирует свою гео-позицию по сделкам «в работе»
  // (foreground). Для клиента — пустой массив (ничего не шлёт).
  useDealLocationBroadcast(isDriver ? driverInWork.map((d) => d.id) : []);
  const driverArchive = [
    ...serverDeals.filter((d) => ARCHIVE_STATUSES.includes(d.status)).map((d) => ({ ...d, _kind: 'deal' })),
    ...myBids.filter((b) => ['rejected', 'cancelled', 'expired'].includes(b.status)).map((b) => ({ ...b, _kind: 'bid' })),
    ...myItemsExpired.map((it) => ({ ...it, _kind: 'route', _expired: true })),
  ];

  // ─── Client (грузоотправитель) buckets — зеркало водителя в его терминах ───
  //   Ищу машину (searching) = активные мои грузы (идут ставки; принять/
  //                            отклонить ставку — В КАРТОЧКЕ груза, не вкладкой)
  //   Везут (enroute)        = сделки accepted/in_progress/picked_up
  //   Доставлено (delivered) = сделки completed/delivered
  //   Архив                  = отменённые/отклонённые/истёкшие сделки + истёкшие грузы
  // Сделки общие с driver-ветвью (driverInWork/driverDone = «мои сделки по
  // статусу», роль не важна) — переиспользуем их для клиента.
  // «Ищу машину» = только активные грузы (без already taken — у принятого
  // груза есть сделка, она показывается в «Везут», иначе был бы дубль).
  const clientSearching = myItems.filter((c) => !c.status || c.status === 'active');
  const clientArchive = [
    ...serverDeals.filter((d) => ARCHIVE_STATUSES.includes(d.status)).map((d) => ({ ...d, _kind: 'deal' })),
    ...myItemsExpired.map((it) => ({ ...it, _kind: 'cargo', _expired: true })),
  ];

  // ─── Cards ───

  const renderMyItem = ({ item }) => {
    const from = item.from_city || '—';
    const to = item.to_city || '—';
    const desc = item.cargo_desc || '';
    const isCargo = !!item.cargo_desc;
    const badge = isCargo ? t('badge_cargo') : t('badge_trip');
    const badgeColor = isCargo ? '#F59E0B' : '#22C55E';
    // Edit is allowed only for own ACTIVE trips. Backend will also block any
    // attempt with an accepted deal — but hiding the button is a much better
    // UX than letting the user tap → wait → see "edit denied".
    const canEditTrip = !isCargo && (item.status || 'active') === 'active';

    return (
      <TouchableOpacity
        testID={isCargo ? 'my-cargo-card' : 'my-trip-card'}
        style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => {
          if (isCargo) {
            navigation.navigate('CargoDetail', { cargo: { ...item, from, to, cargo: desc, _server: true }, cargoId: item.id, role });
          } else {
            // Tap on own trip card → open canonical TripDetail
            navigation.navigate('TripDetail', { trip: normalizeTrip({ ...item, isMine: true, _server: true }), tripId: item.id, role });
          }
        }}
      >
        <View style={s.cardTop}>
          <View style={[s.badge, { backgroundColor: badgeColor + '20' }]}>
            <Text style={[s.badgeText, { color: badgeColor }]}>{badge}</Text>
          </View>
          {/* Stage DS-1: статус не должен быть плоско-зелёным для всех состояний.
              Раньше cancelled / draft / pending тоже рендерились #22C55E,
              что визуально врало пользователю (зелёное = "успешно"). Теперь
              цвет подбирается по item.status. */}
          <Text style={[s.statusLabel, { color: (() => {
            const st = item.status || 'active';
            if (st === 'cancelled') return '#94A3B8';        // серый
            if (st === 'draft' || st === 'pending') return '#F59E0B'; // янтарный
            if (st === 'rejected' || st === 'expired') return '#EF4444'; // красный
            if (st === 'completed' || st === 'delivered') return '#22C55E'; // зелёный
            return '#22C55E'; // active по умолчанию — зелёный
          })() }]}>{formatStatus(item.status || 'active')}</Text>
        </View>
        <Text style={[s.route, { color: theme.text }]}>{from} → {to}</Text>
        {desc ? <Text style={[s.desc, { color: theme.textMuted }]} numberOfLines={1}>{desc}</Text> : null}
        <View style={s.cardMeta}>
          <Text style={[s.metaItem, { color: theme.textDim }]}>{formatTruckType(item.truck_type || item.cargo_type)}</Text>
          <Text style={s.metaDot}>·</Text>
          {/* RC2 hotfix (P0-3): для cargos показываем pickup_date, не
              created_at. Для trips остаётся departure || created_at. */}
          <Text style={[s.metaItem, { color: theme.textDim }]}>
            {isCargo
              ? formatDateForDisplay(item.pickup_date || item.departure || item.created_at)
              : formatDateForDisplay(item.departure || item.created_at)}
          </Text>
        </View>
        <View style={s.cardBottom}>
          <Text style={s.price}>{formatPrice(item.price, item.currency, t)}</Text>
          {item.bids_count > 0 && <Text style={[s.bidsLabel, { color: theme.textMuted }]}>{formatBids(item.bids_count)}</Text>}
        </View>
        {canEditTrip && (
          <TouchableOpacity
            testID="my-trip-edit-btn"
            style={s.editBtn}
            onPress={(e) => {
              e.stopPropagation && e.stopPropagation();
              navigation.navigate('EditTrip', { tripId: item.id, trip: normalizeTrip({ ...item, isMine: true, _server: true }) });
            }}
          >
            <Text style={s.editBtnText}>✏️ {t('edit_btn')}</Text>
          </TouchableOpacity>
        )}
        {/* Задача A: управление СВОИМ грузом — Изменить (цена/описание) + Удалить.
            Только для активного груза (taken/принятый редактировать нельзя). */}
        {isCargo && !isDriver && (item.status || 'active') === 'active' && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              testID="my-cargo-edit-btn"
              style={[s.miniBtn, { borderColor: '#F59E0B', flex: 1 }]}
              onPress={(e) => { e.stopPropagation && e.stopPropagation(); setEditCargo(item); }}
            >
              <Text style={[s.miniBtnText, { color: '#F59E0B' }]}>✏️ {t('edit_btn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="my-cargo-delete-btn"
              style={[s.miniBtn, { borderColor: '#EF4444', flex: 1 }]}
              onPress={async (e) => {
                e.stopPropagation && e.stopPropagation();
                if (!(await confirmAction(t('delete_cargo_confirm')))) return;
                const r = await marketAPI.deleteCargo(item.id);
                if (r && (r.ok || r.ok === undefined)) { toast(t('cargo_deleted'), 'success'); load(); }
                else toast((r && r.detail) || t('delete_failed'), 'error');
              }}
            >
              <Text style={[s.miniBtnText, { color: '#EF4444' }]}>🗑 {t('delete_btn')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const setDealStatusOnServer = async (deal, newStatus) => {
    setBusyBidId(deal.id);
    try {
      const r = await marketAPI.updateDealStatus(deal.id, newStatus);
      if (r.ok) {
        toast(newStatus === 'cancelled' ? t('deal_cancelled_toast') : t('deal_updated_toast'), 'success');
        load();
      } else {
        toast(r.detail || t('send_error'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
    setBusyBidId(null);
  };

  const openDealCard = (deal) => {
    if (deal.cargo_id) {
      navigation.navigate('CargoDetail', { cargoId: deal.cargo_id, dealId: deal.id, role });
    } else if (deal.trip_id) {
      navigation.navigate('TripDetail', { tripId: deal.trip_id, dealId: deal.id, role });
    }
  };

  const renderDeal = ({ item }) => {
    const sc = { accepted: '#22C55E', in_progress: '#F59E0B', delivered: '#22C55E', cancelled: '#EF4444' };
    const busy = busyBidId === item.id;
    const nextStep = isDriver
      ? (item.status === 'accepted' ? t('driver_next_step_accepted')
          : item.status === 'in_progress' ? t('driver_next_step_in_progress')
          : null)
      : (item.status === 'accepted' ? t('shipper_next_step_accepted')
          : item.status === 'in_progress' ? t('shipper_next_step_in_progress')
          : null);

    return (
      <TouchableOpacity
        testID="my-order-card"
        activeOpacity={0.85}
        onPress={() => openDealCard(item)}
        style={[s.card, { backgroundColor: theme.card, borderColor: sc[item.status] || theme.border, borderWidth: 2 }]}
      >
        <View style={s.cardTop}>
          <View style={[s.badge, { backgroundColor: accent + '20' }]}>
            <Text style={[s.badgeText, { color: accent }]}>{t('order_label')}</Text>
          </View>
          <Text style={[s.statusLabel, { color: sc[item.status] || '#78716C' }]}>{formatStatus(item.status)}</Text>
        </View>
        <Text style={[s.route, { color: theme.text }]}>{item.from_city || '—'} → {item.to_city || '—'}</Text>
        {/* issue #3: груз/тип кузова на карточке заказа */}
        {(item.cargo_title || item.cargo_desc || item.cargo_type || item.truck_type) ? (
          <View style={s.cardMeta}>
            {(item.cargo_title || item.cargo_desc) ? (
              <Text style={[s.metaItem, { color: theme.textMuted }]} numberOfLines={1}>📦 {item.cargo_title || item.cargo_desc}</Text>
            ) : null}
            {(item.cargo_type || item.truck_type) ? (
              <>
                <Text style={s.metaDot}>·</Text>
                <Text style={[s.metaItem, { color: theme.textDim }]}>{formatTruckType(item.truck_type || item.cargo_type)}</Text>
              </>
            ) : null}
          </View>
        ) : null}
        <View style={s.cardBottom}>
          <Text style={s.price}>{(item.amount || 0) > 0 ? `$${item.amount}` : t('negotiable')}</Text>
          <Text style={[s.metaItem, { color: theme.textDim }]}>{formatDateForDisplay(item.departure || item.created_at)}</Text>
        </View>
        {nextStep ? (
          <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>
            {t('order_next_step')}: {nextStep}
          </Text>
        ) : null}

        {/* Status CTA */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' }}>
          {isDriver && item.status === 'accepted' && (
            <TouchableOpacity
              style={[s.acceptBtn, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={() => setDealStatusOnServer(item, 'in_progress')}
            >
              <Text style={s.acceptBtnText}>🚛 {t('start_delivery')}</Text>
            </TouchableOpacity>
          )}
          {isDriver && item.status === 'in_progress' && (
            <TouchableOpacity
              style={[s.acceptBtn, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={() => setDealStatusOnServer(item, 'delivered')}
            >
              <Text style={s.acceptBtnText}>✅ {t('mark_arrived')}</Text>
            </TouchableOpacity>
          )}
          {!isDriver && item.status === 'in_progress' && (
            <TouchableOpacity
              style={[s.acceptBtn, { backgroundColor: accent }, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={() => setDealStatusOnServer(item, 'delivered')}
            >
              <Text style={[s.acceptBtnText, { color: '#0C0A09' }]}>✅ {t('confirm_delivery')}</Text>
            </TouchableOpacity>
          )}
          {/* Задача 2: отмена сделки доступна ТОЛЬКО до выезда (accepted).
              Когда груз уже «Везут» (in_progress) — договорённость в силе,
              самостоятельной отмены нет (вопросы — через чат/поддержку). */}
          {item.status === 'accepted' && (
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#EF4444' }, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={async () => {
                if (!(await confirmAction(t('cancel_deal_confirm')))) return;
                setDealStatusOnServer(item, 'cancelled');
              }}
            >
              <Text style={[s.miniBtnText, { color: '#EF4444' }]}>⊘ {t('cancel_deal')}</Text>
            </TouchableOpacity>
          )}
          {item.chat_room_id && (
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: accent }]}
              onPress={() => navigation.navigate('Chat', { roomId: item.chat_room_id, role })}
            >
              <Text style={[s.miniBtnText, { color: accent }]}>💬 {t('order_chat')}</Text>
            </TouchableOpacity>
          )}
          {/* Задача B: грузоотправитель видит, где машина (на стадии «Везут»). */}
          {!isDriver && ['accepted', 'in_progress', 'picked_up'].includes(item.status) && (
            <TouchableOpacity
              testID="deal-track-truck"
              style={[s.miniBtn, { borderColor: '#F59E0B' }]}
              onPress={() => navigation.navigate('TrackTruck', {
                dealId: item.id, from: item.from_city, to: item.to_city, driverName: item.driver_name,
              })}
            >
              <Text style={[s.miniBtnText, { color: '#F59E0B' }]}>📍 {t('track_truck_btn')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const openChatForBid = async (bid) => {
    const r = await marketAPI.openBidChat(bid.id);
    if (r.ok) {
      const roomId = r.chat_room_id || r.chatRoomId;
      if (roomId) navigation.navigate('Chat', { roomId, role });
      else toast(t('chat_open_failed'), 'error');
    } else {
      toast(r.detail || t('chat_open_failed'), 'error');
    }
  };

  const renderBid = ({ item }) => {
    const from = item.cargo_from || '—';
    const to = item.cargo_to || '—';
    const sc = { pending: '#F59E0B', accepted: '#22C55E', rejected: '#EF4444', cancelled: '#78716C', countered: '#A855F7' };
    const sl = {
      pending: t('bid_pending'), accepted: t('bid_accepted'),
      rejected: t('bid_rejected'), cancelled: t('bid_cancelled'),
      countered: t('bid_countered'),
    };
    const busy = busyBidId === item.id;
    const isCountered = item.status === 'countered';
    return (
      <View testID="my-bid-card" style={[s.card, {
        backgroundColor: theme.card,
        borderColor: isCountered ? '#A855F7' : theme.border,
        borderWidth: isCountered ? 2 : 1,
        opacity: item.status === 'cancelled' ? 0.6 : 1,
      }]}>
        <View style={s.cardTop}>
          <Text style={[s.route, { color: theme.text }]}>{from} → {to}</Text>
          <Text style={[s.statusLabel, { color: sc[item.status] || '#78716C' }]}>{sl[item.status] || item.status}</Text>
        </View>
        {item.cargo_desc ? <Text style={[s.desc, { color: theme.textMuted }]} numberOfLines={1}>{item.cargo_desc}</Text> : null}
        <View style={s.cardBottom}>
          <Text style={s.price}>${item.amount}</Text>
          {item.message && <Text style={[s.bidsLabel, { color: theme.textMuted }]} numberOfLines={1}>{item.message}</Text>}
        </View>
        {isCountered && item.counter_amount ? (
          <Text style={{ color: '#A855F7', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
            {t('counter_amount')}: ${item.counter_amount}
            {item.counter_message ? ` · ${item.counter_message}` : ''}
          </Text>
        ) : null}

        {/* Cargo owner — pending: Reject / Counter / Open chat / Accept */}
        {!isDriver && item.status === 'pending' && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' }}>
            <TouchableOpacity
              style={[s.rejectBtn, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={async () => {
                setBusyBidId(item.id);
                const r = await marketAPI.rejectBid(item.id);
                setBusyBidId(null);
                if (r.ok) { toast('❌ ' + t('bid_rejected_toast'), 'success'); load(); }
                else toast(r.detail || t('reject_failed'), 'error');
              }}
            >
              <Text style={s.rejectBtnText}>{t('reject_btn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#A855F7' }]}
              onPress={() => { setEditingBid(item); setBidModalMode('counter'); setBidModal(true); }}
            >
              <Text style={[s.miniBtnText, { color: '#A855F7' }]}>🔁 {t('counter_offer')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#22C55E' }]}
              onPress={() => openChatForBid(item)}
            >
              <Text style={[s.miniBtnText, { color: '#22C55E' }]}>💬 {t('open_bid_chat')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.acceptBtn, { flex: 1, minWidth: 110 }, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={async () => {
                setBusyBidId(item.id);
                const r = await marketAPI.acceptBid(item.id);
                setBusyBidId(null);
                if (r.ok) { toast(t('bid_accepted_toast'), 'success'); load(); }
                else toast(r.detail || t('send_error'), 'error');
              }}
            >
              <Text style={s.acceptBtnText}>{t('accept_bid_btn')} ${item.amount}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cargo owner — countered: Reject + Open chat (no direct accept) */}
        {!isDriver && isCountered && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' }}>
            <TouchableOpacity
              style={[s.rejectBtn, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={async () => {
                setBusyBidId(item.id);
                const r = await marketAPI.rejectBid(item.id);
                setBusyBidId(null);
                if (r.ok) { toast('❌ ' + t('bid_rejected_toast'), 'success'); load(); }
                else toast(r.detail || t('reject_failed'), 'error');
              }}
            >
              <Text style={s.rejectBtnText}>{t('reject_btn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#22C55E' }]}
              onPress={() => openChatForBid(item)}
            >
              <Text style={[s.miniBtnText, { color: '#22C55E' }]}>💬 {t('open_bid_chat')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Driver — countered: Accept counter / Decline counter / Open chat */}
        {isDriver && isCountered && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' }}>
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#EF4444' }, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={async () => {
                setBusyBidId(item.id);
                const r = await marketAPI.declineCounterBid(item.id);
                setBusyBidId(null);
                if (r.ok) { toast('↩ ' + t('counter_declined'), 'success'); load(); }
                else toast(r.detail || t('reject_failed'), 'error');
              }}
            >
              <Text style={[s.miniBtnText, { color: '#EF4444' }]}>↩ {t('decline_counter')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#22C55E' }]}
              onPress={() => openChatForBid(item)}
            >
              <Text style={[s.miniBtnText, { color: '#22C55E' }]}>💬 {t('open_bid_chat')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.acceptBtn, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={async () => {
                setBusyBidId(item.id);
                const r = await marketAPI.acceptCounterBid(item.id);
                setBusyBidId(null);
                if (r.ok) { toast('✅ ' + t('counter_accepted'), 'success'); load(); }
                else toast(r.detail || t('accept_failed'), 'error');
              }}
            >
              <Text style={s.acceptBtnText}>{t('accept_counter')} ${item.counter_amount}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Driver — pending: Edit / Discount / Open chat / Cancel */}
        {isDriver && item.status === 'pending' && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' }}>
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#22C55E' }]}
              onPress={() => { setEditingBid(item); setBidModalMode('edit'); setBidModal(true); }}
            >
              <Text style={[s.miniBtnText, { color: '#22C55E' }]}>✏️ {t('edit_bid')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#F59E0B' }]}
              onPress={() => { setEditingBid(item); setBidModalMode('discount'); setBidModal(true); }}
            >
              <Text style={[s.miniBtnText, { color: '#F59E0B' }]}>💸 {t('give_discount')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#22C55E' }]}
              onPress={() => openChatForBid(item)}
            >
              <Text style={[s.miniBtnText, { color: '#22C55E' }]}>💬 {t('open_bid_chat')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#EF4444' }, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={async () => {
                if (!(await confirmAction(t('cancel_bid_confirm')))) return;
                setBusyBidId(item.id);
                const r = await marketAPI.cancelBid(item.id);
                setBusyBidId(null);
                if (r.ok) { toast('⊘ ' + t('bid_cancelled_toast'), 'success'); load(); }
                else toast(r.detail || t('cancel_failed'), 'error');
              }}
            >
              <Text style={[s.miniBtnText, { color: '#EF4444' }]}>⊘ {t('cancel_bid')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ─── Layout ───

  // Map the original `my / bids / deals` tab keys to the macro-11/12
  // labels (Active / Completed / Archive). The keys are kept for testID
  // backward compat — existing E2E rely on them.
  const v1Accent = v1AccentFor(isDriver ? 'driver' : 'client');
  // Driver (issue #2): Мои рейсы / Предложения / В работе / Завершённые.
  // Client keeps the legacy 3-tab layout untouched.
  const TABS = isDriver
    ? [
        { key: 'routes', label: t('tab_my_routes'), testID: 'my-work-tab-routes' },
        { key: 'offers', label: t('tab_offers'),    testID: 'my-work-tab-offers' },
        { key: 'inwork', label: t('tab_in_work'),   testID: 'my-work-tab-inwork' },
        { key: 'done',   label: t('tab_done'),      testID: 'my-work-tab-done' },
      ]
    : [
        { key: 'searching', label: t('client_tab_searching'), testID: 'my-work-tab-searching' },
        { key: 'enroute',   label: t('client_tab_enroute'),   testID: 'my-work-tab-enroute' },
        { key: 'delivered', label: t('client_tab_delivered'), testID: 'my-work-tab-delivered' },
      ];

  const stats = isDriver
    ? [
        { value: driverOffers.length, label: t('tab_offers') },
        { value: driverInWork.length, label: t('tab_in_work') },
        { value: driverDone.length,   label: t('tab_done') },
      ]
    : [
        { value: clientSearching.length, label: t('client_tab_searching') },
        { value: driverInWork.length,    label: t('client_tab_enroute') },
        { value: driverDone.length,      label: t('client_tab_delivered') },
      ];

  // Archive renderer dispatches by item kind (deal / bid / expired route).
  const renderArchiveItem = ({ item }) =>
    item._kind === 'deal' ? renderDeal({ item })
      : item._kind === 'bid' ? renderBid({ item })
      : renderMyItem({ item });

  const DRIVER_DATA = { routes: myItems, offers: driverOffers, inwork: driverInWork, done: driverDone, archive: driverArchive };
  const DRIVER_RENDER = { routes: renderMyItem, offers: renderBid, inwork: renderDeal, done: renderDeal, archive: renderArchiveItem };
  // Client (грузоотправитель): входящие ставки больше НЕ вкладка — они в
  // карточке груза (CargoDetail). Вкладки — стадии: ищу машину / везут /
  // доставлено + архив.
  const CLIENT_DATA = { searching: clientSearching, enroute: driverInWork, delivered: driverDone, archive: clientArchive };
  const CLIENT_RENDER = { searching: renderMyItem, enroute: renderDeal, delivered: renderDeal, archive: renderArchiveItem };
  const listData = isDriver ? (DRIVER_DATA[tab] || []) : (CLIENT_DATA[tab] || []);
  const listRender = isDriver ? (DRIVER_RENDER[tab] || renderMyItem) : (CLIENT_RENDER[tab] || renderMyItem);

  const renderEmpty = () => {
    if (data?.authRequired) {
      return <EmptyState title={t('gate_login')} description={t('gate_login_desc')} actionLabel={t('gate_enter')} onAction={() => navigation.navigate('Role')} />;
    }
    if (isDriver) {
      if (tab === 'routes') return <EmptyState title={t('no_trips_yet')} description={t('no_trips_desc')} actionLabel={t('publish_route')} onAction={onPublishRoute} />;
      if (tab === 'offers') return <EmptyState title={t('no_bids_yet_driver')} description={t('no_bids_desc')} actionLabel={t('find_cargos')} onAction={() => navigation.navigate('Feed', { role })} />;
      if (tab === 'inwork') return <EmptyState title={t('no_inwork_yet')} description={t('no_inwork_desc')} actionLabel={t('find_cargos')} onAction={() => navigation.navigate('Feed', { role })} />;
      if (tab === 'done') return <EmptyState title={t('no_done_yet')} description={t('no_done_desc')} />;
      return <EmptyState title={t('no_archive_yet')} description={t('no_archive_desc')} />;
    }
    if (tab === 'searching') return <EmptyState title={t('no_cargos_yet')} description={t('client_searching_desc')} actionLabel={t('place_cargo')} onAction={() => navigation.navigate('CreateCargo')} />;
    if (tab === 'enroute') return <EmptyState title={t('client_no_enroute_yet')} description={t('client_no_enroute_desc')} />;
    if (tab === 'delivered') return <EmptyState title={t('client_no_delivered_yet')} description={t('client_no_delivered_desc')} />;
    return <EmptyState title={t('no_archive_yet')} description={t('no_archive_desc')} />;
  };

  return (
    <SafeAreaView testID="my-work-screen" style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
      {/* Stage 16: brand bar — UrTruck wordmark + bell only.
          Stripped the green FTL pill (same change in BrandHeader /
          BrandBarWithShare / FeedScreen). */}
      <View style={s.brandBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[s.backIcon, { color: v1Accent.main }]}>‹</Text>
        </TouchableOpacity>
        <View style={s.brandRow}>
          <Text style={s.brandText}>UrTruck</Text>
        </View>
        <BellBadge
          count={notifUnread}
          onPress={() => navigation.navigate('Notifications')}
        />
      </View>

      <View style={s.titleBlock}>
        <Text style={s.titleHero}>{isDriver ? t('my_trips_title') : t('my_cargos_title')}</Text>
        <Text style={s.titleSub}>{isDriver ? t('my_trips_subtitle') : t('my_cargos_subtitle')}</Text>
      </View>

      {/* §2.2.2: кнопка размещения у водителя живёт ВНУТРИ «Рейсы», а не
          отдельной вкладкой (центр бара занят «Очередью»). У клиента
          размещение — это «+» в баре, поэтому кнопка здесь только driver. */}
      {isDriver ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
          <TouchableOpacity
            testID="mytrips-publish-route"
            onPress={onPublishRoute}
            activeOpacity={0.85}
            style={[s.publishRouteBtn, { backgroundColor: v1Accent.main }]}
          >
            <Text style={s.publishRouteText}>＋ {t('publish_route')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16 }}>
        <SegmentTabs items={TABS} value={tab === 'archive' ? null : tab} onChange={setTab} accent={v1Accent.main} />
        <StatsRow items={stats} accent={v1Accent.main} />
        {/* Архив — вторичный фильтр (issue #2): отменённые/отклонённые/
            истёкшие, НЕ основная вкладка. Активных заказов тут нет.
            Доступен обеим ролям (driver и грузоотправитель). */}
        {(
          <TouchableOpacity
            testID="my-work-archive-toggle"
            onPress={() => setTab(tab === 'archive' ? (isDriver ? 'routes' : 'searching') : 'archive')}
            style={s.archiveToggle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[s.archiveToggleText, { color: tab === 'archive' ? v1Accent.main : v1.textMuted }]}>
              {tab === 'archive' ? `‹ ${t('back_to_active')}` : `${t('tab_archive')} (${(isDriver ? driverArchive : clientArchive).length}) ›`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={listData}
        keyExtractor={(i) => (i._kind ? i._kind + ':' : '') + i.id}
        renderItem={listRender}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={renderEmpty()}
      />

      <BidModal
        visible={bidModal}
        onClose={() => { setBidModal(false); setEditingBid(null); }}
        onSubmit={() => load()}
        mode={bidModalMode}
        bidId={editingBid?.id}
        initialAmount={editingBid?.amount}
        initialMessage={editingBid?.message}
      />

      <EditCargoModal
        visible={!!editCargo}
        cargo={editCargo}
        onClose={() => setEditCargo(null)}
        onSaved={() => load()}
      />

      {/* Progressive verification gate для размещения рейса (driver). */}
      <Modal visible={pubGateVisible} transparent animationType="fade" onRequestClose={() => setPubGateVisible(false)}>
        <View style={s.pgBackdrop}>
          <View style={s.pgCard} testID="trips-publish-gate">
            <Text style={s.pgIcon}>🔒</Text>
            <Text style={s.pgTitle}>
              {verState === 'review' ? t('trips_gate_pending_title')
                : verState === 'rejected' ? t('trips_gate_rejected_title')
                : t('trips_gate_title')}
            </Text>
            <Text style={s.pgText}>
              {verState === 'review' ? t('trips_gate_pending_text')
                : verState === 'rejected' ? t('trips_gate_rejected_text')
                : t('trips_gate_text')}
            </Text>
            <TouchableOpacity
              style={s.pgBtn}
              testID="trips-publish-gate-cta"
              onPress={() => {
                setPubGateVisible(false);
                navigation.navigate(verState === 'review' ? 'Security' : 'Identity');
              }}
            >
              <Text style={s.pgBtnText}>
                {verState === 'review' ? t('trips_gate_pending_btn')
                  : verState === 'rejected' ? t('trips_gate_rejected_btn')
                  : t('trips_gate_btn')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.pgCancel} onPress={() => setPubGateVisible(false)}>
              <Text style={s.pgCancelText}>{t('not_now')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

