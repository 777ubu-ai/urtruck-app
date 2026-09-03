import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { formatBids, formatStatus } from '../utils/i18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import RouteMap from '../components/RouteMap';
import { localizePlace } from '../utils/places';
import GradientText from '../components/GradientText';
import ShareModal from '../components/ShareModal';
import { routeStats } from '../utils/geo';
import { TRIP_STATES, TRIP_STATE_INFO } from '../utils/store';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS, useAuth } from '../utils/AuthContext';
import BidModal from '../components/BidModal';
import { marketAPI } from '../utils/marketAPI';
import { normalizeTrip, tripDisplay, formatPrice } from '../utils/normalizers';
import { buildTripShareText } from '../utils/share';
import { WEB_URL } from '../config/env';
import {v1Colors, useV1Colors, v1Radius, v1AccentFor} from '../theme/designV1';
import GlassCard from '../components/ui/v1/GlassCard';
import SectionTitle from '../components/ui/v1/SectionTitle';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import StickyCTABar from '../components/ui/v1/StickyCTABar';
import PrimaryCTA from '../components/ui/actions/PrimaryCTA';
import SecondaryButton from '../components/ui/actions/SecondaryButton';
import DestructiveButton from '../components/ui/actions/DestructiveButton';
import PriceSavingsBadge from '../components/deal/PriceSavingsBadge';
import AppConfirmModal from '../components/ui/AppConfirmModal';
import { reviewsAPI } from '../utils/reviews';
import { pickDealStatus, userFacingDealStatus } from '../utils/dealStatusOrder';
import { notifyNotifRead } from '../utils/unreadEvents';

export default function TripDetail({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  container: { flex: 1 },
  // Brand bar moved to <BrandBarWithShare/> in stage 3D — local
  // brandBar/backHit/backIcon/brandRow/brandText/ftlPill/ftlText/shareBtn/
  // shareIcon styles were removed as part of stage 3E cleanup.
  pageTitle: { color: v1.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginVertical: 12 },
  priceBig: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  // Legacy local styles still used by deal-block / timeline
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  title: { flex: 1, fontSize: 20, fontWeight: '900' },
  section: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  city: { fontSize: 16, fontWeight: '800' },
  transitCity: { fontSize: 13, fontStyle: 'italic' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  statText: { fontSize: 12, fontWeight: '700' },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  dateLabel: { fontSize: 13, fontWeight: '500' },
  dateValue: { fontSize: 14, fontWeight: '700' },
  primaryBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  editCompactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 16, height: 38, borderRadius: 10, borderWidth: 1.5, marginTop: 4 },
  editCompactText: { fontSize: 13, fontWeight: '700' },
  secondaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8, borderWidth: 0, backgroundColor: 'rgba(148,163,184,0.14)' },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dangerBtn: { borderWidth: 0, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8, backgroundColor: 'rgba(239,68,68,0.10)' },
  dangerBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '800' },
  myBidCard: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, borderWidth: 2 },
  myBidHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  myBidLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  myBidAmount: { fontSize: 22, fontWeight: '900', letterSpacing: -0.3, flexShrink: 1 },
  myBidStatus: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  myBidCounter: { fontSize: 14, fontWeight: '800', marginBottom: 12 },
  bidsTitle: { fontSize: 14, fontWeight: '700', marginTop: 2, marginBottom: 8 },
  // Owner-вид: карточка ставки клиента на мой рейс (компакт CargoDetail.bidCard)
  ownerBidCard: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 8 },
  bidAmt: { fontSize: 16, fontWeight: '900' },
  miniBtn: { backgroundColor: 'rgba(148,163,184,0.14)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  miniBtnText: { fontSize: 14, fontWeight: '700' },
  rejectBtn: { backgroundColor: 'rgba(239,68,68,0.10)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  rejectBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
  acceptBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  acceptBtnText: { fontSize: 14, fontWeight: '800' },
  // Отзыв после доставки (trip-сделка)
  reviewBlock: { borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 10 },
  reviewTitle: { fontSize: 15, fontWeight: '700' },
  starsRow: { flexDirection: 'row', gap: 8 },
  reviewInput: { width: '100%', borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13 },
  reviewSubmitBtn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  reviewSubmitText: { fontSize: 13, fontWeight: '700' },
  myBidBtnRow: { flexDirection: 'row', gap: 10 },
  myBidBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  myBidBtnText: { fontSize: 14, fontWeight: '800' },

  }), [v1]);
  const { trip: rawTrip, tripId, role, dealId: routeDealId } = route.params || {};
  const [serverTrip, setServerTrip] = React.useState(null);
  // Canonical shape: TripDetail never reads raw fields directly. If we got
  // a trip object via navigation, use it; otherwise fall back to whatever the
  // server returned via getTrip(tripId). All field branching lives in
  // tripDisplay() so this body is just rendering.
  //
  // Stage 12: production reproducer — shipper opens TripDetail by `tripId`
  // (push notification, deep link, MyTripsScreen → Orders). Until the
  // server fetch resolves, both rawTrip and serverTrip are null,
  // `normalizeTrip(null)` returns null, and the very next line that
  // touches `trip.id` / `trip.isMine` / `trip.from` throws a
  // TypeError → ErrorBoundary → "Что-то пошло не так". The fallback
  // empty trip object below keeps the screen on a loading state
  // until the network response replaces it.
  const trip = React.useMemo(() => {
    const src = serverTrip || rawTrip;
    const normalised = normalizeTrip(src);
    // from_country/to_country — для гейта статуса сделки (isDomesticRoute/
    // hasKnownRoute ниже); normalizeTrip их не прокидывает.
    if (normalised && src) {
      normalised.from_country = src.from_country;
      normalised.to_country = src.to_country;
    }
    return normalised || {
      id: tripId || null,
      from: '', to: '', transit: '',
      departure: '', arrival: '',
      truckType: null,
      capacityTons: null, availableM3: null,
      price: 0, currency: 'USD',
      driverId: null, driverName: null, driverPhone: null,
      country: null,
      status: 'active', createdAt: null,
      tripState: 'planned', stateHistory: null,
      isTrip: true, _server: false, isMine: false,
    };
  }, [serverTrip, rawTrip, tripId]);
  const { t, lang } = useI18n();
  const editBidLabel = ({
    RU: 'Изменить цену',
    EN: 'Edit price',
    KK: 'Бағаны өзгерту',
    ZH: '修改价格',
  }[lang]) || t('edit_bid');
  const { theme } = useTheme();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const { session } = useAuth();
  const myUserId = session?.user?.id;
  const [shareModal, setShareModal] = React.useState(false);
  // Stage 10: shipper-side bid flow on a driver's trip. The cargo
  // owner opens the trip and can propose a price (RUB/USD/KZT/CNY)
  // — same BidModal already used on CargoDetail, just bound to
  // tripId instead of cargoId.
  const [bidModal, setBidModal] = React.useState(false);
  // Deal-block state (mirrors CargoDetail)
  const [dealId, setDealId] = React.useState(routeDealId || null);
  const [dealStatus, setDealStatus] = React.useState(null);
  const [chatRoomId, setChatRoomId] = React.useState(null);
  const [shipperId, setShipperId] = React.useState(null);
  const [driverId, setDriverId] = React.useState(null);
  // Моя активная ставка на ЭТОТ рейс — чтобы показать плашку «Вы предложили X»
  // с кнопкой [Изменить] вместо тупого «Предложить цену», когда клиент уже
  // сделал ставку (жалоба 28.07). Чат — только после accept (deal создан).
  const [myActiveBid, setMyActiveBid] = React.useState(null);
  const [cancelling, setCancelling] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState(null);
  const askConfirm = React.useCallback((title, message = '', confirmLabel = t('confirm'), destructive = false) => (
    new Promise((resolve) => setConfirmDialog({ title, message, confirmLabel, destructive, resolve }))
  ), [t]);
  const settleConfirm = React.useCallback((answer) => {
    setConfirmDialog((current) => { current?.resolve?.(answer); return null; });
  }, []);

  // Same authoritative-role logic as CargoDetail: route.params.role wins,
  // id-based comparison is a fallback for direct entry without a role hint.
  const isDriverSide = role === 'driver' || (driverId && driverId === myUserId);
  const isShipper = role === 'client' || role === 'shipper' || (shipperId && shipperId === myUserId);
  // Гейт статуса сделки (приказ владельца 03.08, зеркально CargoDetail):
  // домашний рейс не идёт через границу, международный не доставляется
  // минуя её, неизвестный маршрут не двигается дальше вообще.
  const hasKnownRoute = Boolean(trip.from_country && trip.to_country);

  // Монотонный счётчик запросов сделки — защита от гонки: если более
  // старый (медленный) fetch отвечает ПОСЛЕ более нового, его результат
  // отбрасывается (приказ владельца 04.08 п.3). Каждый refreshAll() берёт
  // новый номер; applyDeal() применяет ответ только если seq всё ещё
  // актуален на момент resolve.
  const dealFetchSeq = React.useRef(0);
  const applyDeal = (d, seq) => {
    if (!d || !d.id) return;
    if (seq != null && seq !== dealFetchSeq.current) return; // ответ устарел
    setDealId(d.id);
    // deal.status — ЕДИНСТВЕННЫЙ источник статуса после создания сделки
    // (приказ владельца 04.08 п.1). seq-guard выше отсекает большинство
    // гонок, но добавляем вторую независимую страховку через общий
    // pickDealStatus (utils/dealStatusOrder.js, 05.08 п.6): статус не
    // откатывается назад, а completed/delivered — не «отменяются задним
    // числом» устаревшим cancelled.
    setDealStatus((prev) => pickDealStatus(prev, d.status || 'accepted'));
    if (d.chat_room_id) setChatRoomId(d.chat_room_id);
    if (d.shipper_id) setShipperId(d.shipper_id);
    if (d.driver_id) setDriverId(d.driver_id);
  };

  // Живые данные торга (зеркально CargoDetail.refreshDeal). Раньше dashboard
  // грузился ОДИН раз на mount — экран «замерзал»: встречка или принятие от
  // водителя не появлялись, пока клиент не перезайдёт. Теперь: перечитываем
  // рейс + ставки + сделку на каждом фокусе экрана + поллинг раз в 15с.
  // refreshBidTick — ручной триггер после закрытия BidModal.
  const [refreshBidTick, setRefreshBidTick] = React.useState(0);
  const [bids, setBids] = React.useState([]);
  const [bidsCount, setBidsCount] = React.useState(0);
  const [bidsConfidential, setBidsConfidential] = React.useState(false);
  const [isListingOwner, setIsListingOwner] = React.useState(false);
  const [counterActing, setCounterActing] = React.useState(false);
  // Owner-вид (водитель на своём рейсе): действия по ставкам клиентов.
  const [accepting, setAccepting] = React.useState(null);
  const [rejecting, setRejecting] = React.useState(null);
  // Встречка владельца по конкретной ставке клиента (BidModal mode='counter').
  const [counterBidTarget, setCounterBidTarget] = React.useState(null);
  // Отзыв после доставки (trip-сделка не имеет CargoDetail-страницы).
  const [reviewRating, setReviewRating] = React.useState(0);
  const [reviewText, setReviewText] = React.useState('');
  const [reviewSent, setReviewSent] = React.useState(false);
  const [reviewLoading, setReviewLoading] = React.useState(false);
  const tid = (trip && trip.id) || tripId;

  // Один источник ставок — GET /bids?trip_id (как CargoDetail): даёт счётчик
  // предложений, confidential-режим, owner-вид и МОЮ ставку со встречкой
  // (counter_amount/counter_message) — dashboard my_bids этого не давал.
  const loadBids = React.useCallback(() => {
    if (!tid) return;
    marketAPI.listBids({ tripId: tid }).then(d => {
      const mapped = (d.bids || []).map(b => ({
        id: b.id, bidderId: b.bidder_id,
        name: b.bidder_name || t('shipper_label'),
        rating: b.bidder_rating || 0,
        reviews: b.bidder_reviews_count || 0,
        verified: !!b.bidder_verified,
        amount: b.amount, currency: b.currency,
        message: b.message, status: b.status,
        isMine: b.bidder_id === myUserId,
        counterAmount: b.counter_amount,
        counterMessage: b.counter_message,
        bargainPriceActions: Number(b.bargain_price_actions || 0),
        bargainMinActions: Number(b.bargain_min_actions || 5),
        bargainGateRequired: b.bargain_gate_required === true,
        bargainCanAccept: b.bargain_can_accept !== false,
        bargainCounterCanAccept: b.bargain_counter_can_accept !== false,
        time: b.created_at?.slice(11, 16) || '•',
      }));
      setBids(mapped);
      setBidsCount(typeof d.count === 'number' ? d.count : mapped.length);
      setIsListingOwner(!!d.is_owner);
      setBidsConfidential(!!d.confidential);
      // Моя активная ставка: my_bid с бэка авторитетнее маппинга по myUserId
      // (session.user.id бывает синтетическим u_<ts> до refresh из /register/me).
      const raw = d.my_bid && (d.my_bid.status === 'pending' || d.my_bid.status === 'countered')
        ? d.my_bid : null;
      const mine = raw ? {
        id: raw.id, amount: raw.amount, currency: raw.currency,
        message: raw.message, status: raw.status,
        counterAmount: raw.counter_amount, counterMessage: raw.counter_message,
        bargainPriceActions: Number(raw.bargain_price_actions || 0),
        bargainMinActions: Number(raw.bargain_min_actions || 5),
        bargainGateRequired: raw.bargain_gate_required === true,
        bargainCanAccept: raw.bargain_can_accept !== false,
        bargainCounterCanAccept: raw.bargain_counter_can_accept !== false,
      } : (mapped.find(b => b.isMine && (b.status === 'pending' || b.status === 'countered')) || null);
      setMyActiveBid(mine);
    }).catch(() => {});
  }, [tid, myUserId, t]);

  const refreshAll = React.useCallback(() => {
    if (!tid) return;
    // Свежий рейс с сервера — актуальная цена/статус + driver_rating/
    // driver_verified для карточки водителя (get_trip обогащает).
    // P0 2026-09-03: симметрично CargoDetail — GET /trips/{id} гасит на
    // сервере уведомления с url=/trips/{id}[?bid=...], а notifyNotifRead()
    // синхронизирует колокол/бейдж мгновенно, без ожидания 12-сек поллинга.
    marketAPI.getTrip(tid).then(d => {
      if (d && !d.detail) setServerTrip(d);
      notifyNotifRead();
    }).catch(() => {});
    loadBids();
    const seq = ++dealFetchSeq.current;
    // dealId (state) — авторитетнее routeDealId: если сделка создана уже
    // В ЭТОЙ сессии (owner принял ставку, routeDealId изначально был пуст),
    // routeDealId навсегда останется тем же (params не меняются), а dealId
    // уже содержит реальный id.
    const dealIdToFetch = dealId || routeDealId;
    if (dealIdToFetch) {
      marketAPI.getDeal(dealIdToFetch).then(d => { if (d && d.ok !== false) applyDeal(d, seq); }).catch(() => {});
    } else {
      marketAPI.myDashboard().then(d => {
        const foundDeal = (d?.my_deals || []).find(x => String(x.trip_id) === String(tid));
        if (foundDeal) applyDeal(foundDeal, seq);
      }).catch(() => {});
    }
  }, [tid, routeDealId, dealId, loadBids]);

  useFocusEffect(React.useCallback(() => {
    refreshAll();
    const iv = setInterval(refreshAll, 15000);
    return () => clearInterval(iv);
  }, [refreshAll]));

  React.useEffect(() => { if (refreshBidTick > 0) refreshAll(); }, [refreshBidTick]);

  const myBidStatusLabel = React.useMemo(() => {
    if (!myActiveBid) return '';
    switch (myActiveBid.status) {
      case 'countered': return t('my_bid_status_countered');
      case 'pending':
      default:          return t('my_bid_status_pending');
    }
  }, [myActiveBid, t]);
  const myBidCanAcceptCounter = myActiveBid
    ? myActiveBid.bargainCounterCanAccept !== false
      && (myActiveBid.bargainGateRequired !== true || (myActiveBid.bargainPriceActions || 0) >= Math.max(1, (myActiveBid.bargainMinActions || 5) - 1))
    : false;
  const myBidDepthLabel = myActiveBid
    ? t('bargain_depth_progress')
      .replace('{done}', String(Math.min(myActiveBid.bargainPriceActions || 0, myActiveBid.bargainMinActions || 5)))
      .replace('{min}', String(myActiveBid.bargainMinActions || 5))
    : '';

  // Встречка водителя: клиент отвечает ПРЯМО со страницы рейса — принять
  // за сумму встречки (создаёт сделку) или отклонить. Раньше клиент видел
  // только текст «встречная цена» без суммы и без кнопок — петля торга
  // рвалась, надо было идти искать чат.
  const acceptCounter = React.useCallback(async () => {
    if (!myActiveBid || counterActing || !myBidCanAcceptCounter) return;
    const sum = formatPrice(myActiveBid.counterAmount, myActiveBid.currency || trip.currency);
    const msg = t('accept_bid_confirm').replace('{sum}', sum);
    const ok = await askConfirm(t('accept_counter'), msg, t('accept_counter'));
    if (!ok) return;
    setCounterActing(true);
    try {
      const r = await marketAPI.acceptCounterBid(myActiveBid.id);
      if (r.ok) {
        toast('✅ ' + t('counter_accepted'), 'success');
        if (r.chat_room_id) setChatRoomId(r.chat_room_id);
        if (r.deal_id) { setDealId(r.deal_id); setDealStatus('accepted'); }
        refreshAll();
        // WhatsApp-упрощение (04.08.2026, п.9 ТЗ): согласовали цену — сразу в чат.
        if (r.chat_room_id) navigation.navigate('Chat', { roomId: r.chat_room_id, dealId: r.deal_id, role });
      } else {
        toast(r.detail || t('accept_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
    setCounterActing(false);
  }, [myActiveBid, myBidCanAcceptCounter, counterActing, trip.currency, refreshAll, toast, t]);

  const declineCounter = React.useCallback(async () => {
    if (!myActiveBid || counterActing) return;
    setCounterActing(true);
    try {
      const r = await marketAPI.declineCounterBid(myActiveBid.id);
      if (r.ok) {
        toast('↩ ' + t('counter_declined'), 'success');
        refreshAll();
      } else {
        toast(r.detail || t('reject_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
    setCounterActing(false);
  }, [myActiveBid, counterActing, refreshAll, toast, t]);

  // ─── Owner-вид: водитель отвечает на ставки клиентов на СВОЙ рейс ───
  // (зеркально owner-виду CargoDetail: Отклонить / Встречка / Принять;
  // чат — только после создания сделки, см. renderDealBlock)
  const rejectClientBid = async (bid) => {
    setRejecting(bid.id);
    try {
      const r = await marketAPI.rejectBid(bid.id);
      if (r.ok) {
        toast('❌ ' + t('bid_rejected_toast'), 'success');
        refreshAll();
      } else {
        toast(r.detail || t('reject_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
    setRejecting(null);
  };

  const acceptClientBid = async (bid) => {
    // Принятие создаёт сделку — подтверждаем на обеих платформах.
    const sum = formatPrice(bid.amount, bid.currency || trip.currency);
    const msg = t('accept_bid_confirm').replace('{sum}', sum);
    const ok = await askConfirm(t('accept_bid_confirm_title'), msg, t('accept_bid_btn'));
    if (!ok) return;
    setAccepting(bid.id);
    try {
      const r = await marketAPI.acceptBid(bid.id);
      if (r.ok) {
        toast('✓ ' + t('bid_accepted_toast'), 'success');
        if (r.chat_room_id) setChatRoomId(r.chat_room_id);
        if (r.deal_id) { setDealId(r.deal_id); setDealStatus('accepted'); }
        refreshAll();
        // WhatsApp-упрощение (04.08.2026, п.9 ТЗ): сразу в чат сделки.
        if (r.chat_room_id) navigation.navigate('Chat', { roomId: r.chat_room_id, dealId: r.deal_id, role });
      } else {
        toast(r.detail || t('accept_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
    setAccepting(null);
  };

  // changeDealStatus удалён (05.08.2026): кнопки статуса переехали в
  // ChatScreen (единственное место действия на deal.status, см. п.9/13 ТЗ).
  // Эта страница только показывает текущий статус текстом (renderDealBlock).

  if (!trip && !tripId) return null;
  if (!trip || !trip.id) {
    // No trip object passed — common when navigating from Orders by tripId.
    // Render minimal screen with the deal-block so the user is not stuck on
    // a blank page. Full TripDetail UI requires the trip object and is left
    // untouched on this code path.
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.backText, { color: theme.text }]}>‹</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="truck" size={20} color="#168759" />
            <GradientText style={s.title} colors={['#168759', '#16A34A']}>{t('trip_title')}</GradientText>
          </View>
        </View>
        {dealStatus ? renderDealBlock() : (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: theme.textMuted }}>{t('incomplete_data')}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  function renderDealBlock() {
    // Компактный статус вместо горизонтальной шкалы (05.08.2026, п.9 ТЗ).
    // Кнопки действия («Начать»/«На границе»/«Доставлен»/«Подтвердить
    // получение»/«Отменить») переехали в разговор (ChatScreen) —
    // единственное место действия на статус сделки, без дублей между экранами.
    return (
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={[s.section, {
          backgroundColor: theme.card,
          borderColor: theme.border,
        }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' }}>
            <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>{t('trip_current_status')}</Text>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{formatStatus(userFacingDealStatus(dealStatus))}</Text>
          </View>
          {(dealStatus === 'accepted' || dealStatus === 'in_progress' || dealStatus === 'at_border') && (
            <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6, textAlign: 'center' }}>
              {dealStatus === 'in_progress' && !hasKnownRoute ? t('clarify_route') : (
                <>
                  {t('order_next_step')}: {
                    isDriverSide
                      ? (dealStatus === 'accepted' ? t('driver_next_step_accepted')
                         : dealStatus === 'in_progress' ? t('driver_next_step_in_progress')
                         : t('driver_next_step_at_border'))
                      : (dealStatus === 'accepted' ? t('shipper_next_step_accepted') : t('shipper_next_step_in_progress'))
                  }
                </>
              )}
            </Text>
          )}
          {chatRoomId && (
            <View style={{ marginTop: 10, gap: 8 }}>
              {/* «Написать сообщение» — главное действие по сделке
                  (05.08.2026, п.5/17 ТЗ): большая ролевая кнопка вместо
                  мелкой ссылки «Чат по заказу». Внешний звонок скрыт до
                  появления собственного звонка внутри UrTruck. */}
              <PrimaryCTA
                testID="deal-order-chat"
                role={isDriverSide ? 'driver' : 'client'}
                icon="💬"
                label={t('write_message')}
                onPress={() => navigation.navigate('Chat', { roomId: chatRoomId, role, tripId: (trip && trip.id) || tripId, partner: driverId ? { id: driverId } : undefined })}
                style={{ height: 54 }}
              />
            </View>
          )}
        </View>
      </View>
    );
  }

  const stats = routeStats(trip.from, trip.to, trip.transit);
  const view = tripDisplay(trip, t, lang);
  // Принятая ставка → в блоке цены показываем сумму сделки, не листинг.
  const acceptedBid = bids.find(b => b.status === 'accepted');

  const onDelete = () => {
    const confirmDelete = async () => {
      const res = await marketAPI.unpublishTrip(trip.id);
      if (res.ok) {
        toast('🗑 ' + t('trip_deleted_toast'), 'info');
        navigation.goBack();
      } else {
        toast(t('update_failed'), 'error');
      }
    };
    askConfirm(t('trip_delete_q'), '', t('trip_delete'), true).then((ok) => {
      if (ok) confirmDelete();
    });
  };

  const isOwner = trip.isMine || trip.driverId === myUserId || trip.driverName === 'Вы' || trip.driverName === 'You';

  // v1 visual: emerald accent for trip-detail (driver supply); orange when
  // shipper opens it (client-side flow).
  const v1Accent = v1AccentFor(role === 'client' || role === 'shipper' ? 'client' : 'driver');
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandBarWithShare
        onBack={() => navigation.goBack()}
        onShare={() => setShareModal(true)}
        accent={v1Accent.main}
        rightTestID="trip-share-btn"
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 96 + insets.bottom }}>
        {/* Stage 17: leading 🚛 dropped to match Stage 16's quiet
            language across detail titles. */}
        <Text style={s.pageTitle}>{t('trip_title')}</Text>

        {/* Маршрут на карте */}
        <View style={{ marginBottom: 10, borderRadius: v1Radius.card, overflow: 'hidden' }}>
          <RouteMap
            from={trip.from}
            to={trip.to}
            transit={trip.transit}
            dealId={dealId}
            dealStatus={dealStatus}
            driverName={trip.driverName}
            capacityTons={trip.capacityTons}
          />
        </View>

        {/* Информация о рейсе */}
        <GlassCard>
          <SectionTitle featherIcon="map" label={t('trip_route')} />
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
            <Text style={[s.city, { color: theme.text }]}>{localizePlace(view.from, lang)}</Text>
          </View>
          {view.transit ? (
            <View style={s.routeRow}>
              <View style={[s.dot, { backgroundColor: '#334155' }]} />
              <Text style={[s.transitCity, { color: theme.textSecondary }]}>{t('trip_via')} {localizePlace(view.transit, lang)}</Text>
            </View>
          ) : null}
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: '#168759' }]} />
            <Text style={[s.city, { color: theme.text }]}>{localizePlace(view.to, lang)}</Text>
          </View>

          {stats && (
            <View style={s.statsRow}>
              <View style={[s.statPill, { backgroundColor: theme.border }]}>
                <Text style={[s.statText, { color: theme.text }]}>📏 {stats.km} {t('km_short')}</Text>
              </View>
              <View style={[s.statPill, { backgroundColor: theme.border }]}>
                <Text style={[s.statText, { color: theme.text }]}>⏱ ~{stats.days} {t('days_short')}</Text>
              </View>
            </View>
          )}
        </GlassCard>

        {/* Даты */}
        <GlassCard>
          <SectionTitle featherIcon="calendar" label={t('trip_dates')} />
          <View style={s.dateRow}>
            <Text style={[s.dateLabel, { color: v1.textMuted }]}>🚀 {t('trip_dep')}</Text>
            <Text style={[s.dateValue, { color: v1.text }]} testID="trip-detail-departure">{view.departure}</Text>
          </View>
          <View style={s.dateRow}>
            <Text style={[s.dateLabel, { color: v1.textMuted }]}>🏁 {t('trip_arr')}</Text>
            <Text style={[s.dateValue, { color: v1.text }]} testID="trip-detail-arrival">{view.arrival}</Text>
          </View>
        </GlassCard>

        {/* Транспорт */}
        <GlassCard>
          <SectionTitle featherIcon="truck" label={t('trip_transport')} />
          <View style={s.dateRow}>
            <Text style={[s.dateLabel, { color: v1.textMuted }]}>{t('trip_truck_body')}</Text>
            <Text style={[s.dateValue, { color: v1.text }]} testID="trip-detail-truck">{view.truckType}</Text>
          </View>
          {/* Stage 17: label was the legacy `Свободно` key above an
              `X м³` value — confusing because that word reads like a
              border-queue status, not a volume metric. Replaced with
              the canonical Объём label so weight and volume render
              with a consistent shape across all detail screens. */}
          {trip.availableM3 != null && (
            <View style={s.dateRow}>
              <Text style={[s.dateLabel, { color: v1.textMuted }]}>{t('volume')}</Text>
              <Text style={[s.dateValue, { color: v1.text }]}>{view.availableM3}</Text>
            </View>
          )}
          {trip.capacityTons != null && (
            <View style={s.dateRow}>
              <Text style={[s.dateLabel, { color: v1.textMuted }]}>{t('weight')}</Text>
              <Text style={[s.dateValue, { color: v1.text }]}>{view.capacityTons}</Text>
            </View>
          )}
        </GlassCard>

        {/* Карточка водителя — клиент видит, КОМУ доверяет груз: имя,
            верификация, рейтинг, тап → профиль водителя (DriverDetail).
            Данные — из обогащённого GET /trips/{id} (driver_display_name /
            driver_verified / driver_rating / driver_reviews_count). */}
        {!isOwner && (trip.driverId || view.driverName) ? (() => {
          // driver_display_name с бэка иногда — не имя, а техническая
          // заглушка (хвост телефона «+2244» или «Пользователь UrTruck»),
          // когда профиль не заполнен. Не выдаём это за настоящее имя.
          const rawDriverName = serverTrip?.driver_display_name || view.driverName || '';
          const driverHasRealName = rawDriverName && !rawDriverName.startsWith('+') && rawDriverName !== 'Пользователь UrTruck';
          const driverDisplayName = driverHasRealName ? rawDriverName : t('driver');
          return (
          <TouchableOpacity
            activeOpacity={trip.driverId ? 0.75 : 1}
            disabled={!trip.driverId}
            onPress={() => navigation.navigate('DriverDetail', {
              driver: {
                id: trip.driverId,
                name: driverDisplayName,
                rating: serverTrip?.driver_rating || 0,
                reviews: serverTrip?.driver_reviews_count || 0,
                verified: !!serverTrip?.driver_verified,
                _server: true, _isDriver: true,
              },
              role,
            })}
            testID="trip-driver-card"
          >
            <GlassCard>
              <SectionTitle featherIcon="user" label={t('trip_driver')} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <Text style={{ color: v1.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                  {driverDisplayName}{trip.driverId ? ' ›' : ''}
                </Text>
                <Text style={{ fontSize: 12, color: v1.textMuted }}>
                  {serverTrip?.driver_verified ? '✅ ' + t('verified_short') + ' · ' : ''}
                  {serverTrip?.driver_reviews_count > 0
                    ? `⭐ ${Number(serverTrip.driver_rating).toFixed(1)} (${serverTrip.driver_reviews_count})`
                    : t('no_reviews_yet')}
                </Text>
              </View>
            </GlassCard>
          </TouchableOpacity>
          );
        })() : null}

        {/* Цена — выделенный блок с brand-accent. Если ставка ПРИНЯТА —
            показываем сумму сделки, а не цену объявления (две разные цифры
            на одном экране путали, зеркально CargoDetail). */}
        <GlassCard accent={v1Accent.main}>
          <SectionTitle featherIcon="dollar-sign" label={acceptedBid ? t('deal_price') : t('price')} />
          <Text style={[s.priceBig, { color: v1Accent.main }]} numberOfLines={1} testID="trip-price-value">
            {acceptedBid ? formatPrice(acceptedBid.amount, acceptedBid.currency || trip.currency, t) : view.price}
          </Text>
        </GlassCard>

        {/* Рыночный пульс: число предложений на этот рейс (видно всем —
            социальное давление «машину заберут»), confidential-подсказка,
            «будьте первым» на пустом рейсе. Зеркально CargoDetail. */}
        <Text style={[s.bidsTitle, { color: v1.text }]} testID="trip-bids-count">{formatBids(bidsCount)}</Text>
        {!isOwner && !isListingOwner && bidsConfidential && bidsCount > 0 ? (
          <Text style={{ color: v1.textMuted, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 8, fontSize: 12 }}>
            {t('bids_confidential_hint')}
          </Text>
        ) : null}
        {!isOwner && !isListingOwner && bidsCount === 0 ? (
          <Text style={{ color: v1.textMuted, paddingBottom: 8, fontSize: 13 }}>
            {t('no_bids_be_first')}
          </Text>
        ) : null}

        {/* Owner-вид: водитель на СВОЁМ рейсе видит ставки клиентов и
            отвечает прямо здесь — [Отклонить] [Встречка] [Чат] [Принять].
            Раньше владелец рейса не видел предложений на этой странице
            вообще (в отличие от владельца груза в CargoDetail). */}
        {(isOwner || isListingOwner) ? bids.map(b => {
          const hasAccepted = bids.some(x => x.status === 'accepted');
          const isCountered = b.status === 'countered';
          const bargainDepthLabel = t('bargain_depth_progress')
            .replace('{done}', String(Math.min(b.bargainPriceActions || 0, b.bargainMinActions || 5)))
            .replace('{min}', String(b.bargainMinActions || 5));
          const canAcceptBid = b.bargainCanAccept !== false;
          return (
            <View key={b.id} style={[s.ownerBidCard, {
              backgroundColor: v1.card,
              borderColor: b.status === 'accepted' ? '#168759'
                : isCountered ? '#E06D00'
                : v1.border,
              borderWidth: b.status === 'accepted' || isCountered ? 2 : 1,
            }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ color: v1.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{b.name}</Text>
                  <Text style={{ fontSize: 11, marginTop: 2, color: v1.textMuted }}>
                    {b.verified ? '✅ ' + t('verified_short') + ' · ' : ''}
                    {b.reviews > 0 ? `⭐ ${Number(b.rating).toFixed(1)} (${b.reviews})` : t('no_reviews_yet')}
                  </Text>
                  {b.message ? <Text style={{ color: v1.textMuted, fontSize: 11, marginTop: 2 }}>{b.message}</Text> : null}
                  <Text style={{
                    fontSize: 11, marginTop: 2,
                    color: b.status === 'accepted' ? '#168759' : isCountered ? '#E06D00' : '#D97706',
                  }}>
                    {b.status === 'accepted' ? '✅ ' + t('bid_accepted')
                      : isCountered ? '🔁 ' + t('counter_sent_status')
                      : b.time}
                  </Text>
                </View>
                {/* Эта ветка — ставки КЛИЕНТОВ на рейс водителя (владелец
                    рейса их просматривает), поэтому цена всегда клиентская
                    (оранжевая) вне зависимости от v1Accent текущего role —
                    раньше здесь была v1Accent.main, которая для водителя-
                    владельца давала зелёный на чужой (клиентской) цене
                    (05.08.2026, п.16 ТЗ). */}
                <Text style={[s.bidAmt, { color: '#E06D00' }]}>{formatPrice(b.amount, b.currency || trip.currency, t)}</Text>
              </View>
              {b.status === 'pending' && !hasAccepted ? (
                <View style={{ marginTop: 10, gap: 8, alignSelf: 'stretch' }}>
                  {/* Приказ владельца 03.08 (скриншоты): до создания сделки
                      никакого чата. Иерархия — одна большая «Принять»,
                      вторичная «Предложить свою цену», текстовый «Отклонить». */}
                  <PriceSavingsBadge listingPrice={trip.price} bidPrice={b.amount} currency={trip.currency || 'USD'} />
                  <PrimaryCTA
                    testID="trip-bid-accept"
                    role="driver"
                    icon="✓"
                    label={canAcceptBid ? t('accept_bid_btn') : bargainDepthLabel}
                    loading={accepting === b.id}
                    disabled={!!accepting || !!rejecting || !canAcceptBid}
                    onPress={() => acceptClientBid(b)}
                  />
                  <SecondaryButton
                    testID="trip-bid-counter"
                    role="driver"
                    icon="🔁"
                    label={t('counter_offer')}
                    onPress={() => { setCounterBidTarget(b); setBidModal(true); }}
                    disabled={!!accepting || !!rejecting}
                  />
                  <TouchableOpacity
                    testID="trip-bid-reject"
                    onPress={() => rejectClientBid(b)}
                    disabled={!!accepting || !!rejecting}
                    style={{ alignSelf: 'center', maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 10 }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700', opacity: (accepting || rejecting) ? 0.55 : 1, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">
                      {rejecting === b.id ? '…' : t('reject_btn')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {isCountered ? (
                <View style={{ marginTop: 10, gap: 8, alignSelf: 'stretch' }}>
                  {b.counterAmount ? (
                    <Text style={{ color: '#E06D00', fontSize: 12, fontWeight: '700' }}>
                      🔁 {t('counter_amount')}: {formatPrice(b.counterAmount, b.currency || trip.currency, t)}
                    </Text>
                  ) : null}
                  {/* Водитель + свой контр отправлен: ждём хода клиента, без чата. */}
                  <DestructiveButton
                    testID="trip-bid-reject"
                    icon="✕"
                    label={t('reject_btn')}
                    loading={rejecting === b.id}
                    disabled={!!rejecting}
                    onPress={() => rejectClientBid(b)}
                  />
                </View>
              ) : null}
            </View>
          );
        }) : null}

        {/* Timeline статусов — только ДО создания сделки (приказ владельца
            04.08): trip.tripState — legacy локальное поле, бэк его не
            персистит и не синхронизирует с deal.status, поэтому оно всегда
            «planned» независимо от реального прогресса сделки. Как только
            deal создан, единственный источник статуса — renderDealBlock()
            ниже (компактный текст, управляется dealStatus). Показывать
            здесь legacy-таймлайн одновременно с ним — значит врать
            пользователю устаревшим «Запланирован», когда сделка уже
            «В пути»/«На границе». */}
        {!dealStatus ? (
        <GlassCard>
          <SectionTitle featherIcon="map-pin" label={t('trip_status')} />
          {TRIP_STATES.map((st, i) => {
            const info = TRIP_STATE_INFO[st];
            const currentIdx = TRIP_STATES.indexOf(trip.tripState || 'planned');
            const passed = i <= currentIdx;
            const active = i === currentIdx;
            return (
              <View key={st} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: passed ? info.color : theme.border,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: passed ? 1 : 0.35,
                }}>
                  <Text style={{ fontSize: 16 }}>{info.icon}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{
                    color: passed ? theme.text : theme.textMuted,
                    fontSize: 14, fontWeight: active ? '800' : '600',
                  }}>{t(info.labelKey)}</Text>
                  {active && (
                    <Text style={{ color: info.color, fontSize: 11, marginTop: 2 }}>{t('trip_current_status')}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </GlassCard>
        ) : null}

        {/* Кнопки.
            Stage 17: client-side block was rendering an inline
            "💬 Написать водителю" + "⭐ Оставить отзыв" pair *and* a
            StickyCTABar at the bottom that exposes the same chat
            action plus "Предложить цену". That left two identical
            "write to driver" CTAs on one screen, and the inline
            "Leave review" was premature — a shipper looking at a
            trip they haven't booked yet has no driver to review.
            Both inline buttons are removed; sticky bar is the only
            client CTA surface from now on. The owner branch is
            unchanged — owner still sees Edit / Delete inline. */}
        {role === 'client' ? null : isOwner ? (
          <>
            {/* Компактная служебная кнопка (приказ владельца 03.08): «Редактировать»
                на всю ширину читалась как главное действие экрана, хотя это
                обычная служебная функция. */}
            {(trip.status || 'active') === 'active' && !dealStatus && (
              <TouchableOpacity
                style={[s.editCompactBtn, { borderColor: v1Accent.main, backgroundColor: v1.card }]}
                onPress={() => navigation.navigate('EditTrip', { tripId: trip.id, trip })}
                testID="trip-detail-edit-btn"
              >
                <Feather name="edit-2" size={14} color={v1Accent.main} />
                <Text style={[s.editCompactText, { color: v1Accent.main }]}>{t('edit_trip_compact')}</Text>
              </TouchableOpacity>
            )}
            {(trip.status || 'active') === 'active' && !dealStatus && (
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: '#94A3B8', marginTop: 8 }]}
                onPress={onDelete}
                testID="trip-detail-unpublish-btn"
              >
                <Text style={[s.primaryBtnText, { color: '#fff' }]}>{t('trip_delete')}</Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}
      </ScrollView>

      {dealStatus ? renderDealBlock() : null}

      {/* Отзыв после доставки. Trip-сделка не проходит через CargoDetail,
          поэтому без этого блока участникам trip-сделки было негде оценить
          друг друга. Клиент оценивает водителя, водитель — клиента. */}
      {dealStatus === 'completed' && !reviewSent && (isShipper ? (driverId || trip.driverId) : shipperId) ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[s.reviewBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.reviewTitle, { color: theme.text }]}>{isShipper ? t('rate_driver') : t('rate_shipper')}</Text>
            <View style={s.starsRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => setReviewRating(n)}>
                  <Text style={{ fontSize: 28 }}>{n <= reviewRating ? '★' : '☆'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[s.reviewInput, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
              value={reviewText}
              onChangeText={setReviewText}
              placeholder={t('comment_optional')}
              placeholderTextColor={theme.textMuted}
              maxLength={200}
            />
            <TouchableOpacity
              style={[s.reviewSubmitBtn, { backgroundColor: v1Accent.main }, reviewRating === 0 && { opacity: 0.4 }]}
              disabled={reviewRating === 0 || reviewLoading}
              onPress={async () => {
                setReviewLoading(true);
                try {
                  await reviewsAPI.create({
                    targetId: isShipper ? (driverId || trip.driverId) : shipperId,
                    targetRole: isShipper ? 'driver' : 'client',
                    rating: reviewRating,
                    text: reviewText.trim() || null,
                  });
                  setReviewSent(true);
                  toast(t('thanks_for_review'), 'success');
                } catch {
                  toast(t('review_failed'), 'error');
                }
                setReviewLoading(false);
              }}
            >
              <Text style={[s.reviewSubmitText, { color: v1Accent.onAccent }]}>{reviewLoading ? '...' : t('submit_rating')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {dealStatus === 'completed' && reviewSent ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center' }}>
          <Text style={{ color: '#168759', fontSize: 14, fontWeight: '600' }}>{t('thanks_for_review')}</Text>
        </View>
      ) : null}

      {/* «Моя ставка» плашка — показываем, когда клиент уже сделал ставку
          на этот рейс и сделки ещё нет. По жалобе владельца 28.07: после
          отправки предложения на карточке рейса не было НИКАКОЙ обратной
          связи (дошло/не дошло/можно ли изменить/где чат). Плашка + два
          действия: изменить сумму или сразу перейти в чат. */}
      {myActiveBid && !dealStatus && !isOwner ? (
        <View style={[s.myBidCard, { borderColor: v1Accent.main, backgroundColor: v1.card }]} testID="trip-my-active-bid">
          <View style={s.myBidHeader}>
            <Text style={[s.myBidLabel, { color: v1.textMuted }]}>{t('my_bid_label')}</Text>
            <Text style={[s.myBidAmount, { color: v1Accent.main }]}>
              {(() => {
                const cur = (myActiveBid.currency || trip.currency || 'USD').toUpperCase();
                const sym = { USD: '$', KZT: '₸', RUB: '₽', CNY: '¥', UZS: 'сум' }[cur] || '$';
                const num = String(Math.round(Number(myActiveBid.amount) || 0))
                  .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                return cur === 'UZS' ? `${num} ${sym}` : `${sym}${num}`;
              })()}
            </Text>
          </View>
          <Text style={[s.myBidStatus, { color: v1.text }]}>{myBidStatusLabel}</Text>
          {myActiveBid.status === 'countered' && myActiveBid.counterAmount ? (
            <>
              {/* Клиент + водитель прислал контр: primary «Принять контр $X»
                  (client orange), Chat + Destructive Decline. Иерархия 2026.
                  Цена в самом контр-оффере — водительская (это ЕГО встречная
                  цена), поэтому текст зелёный, не оранжевый (05.08.2026,
                  п.16 ТЗ: цена красится по роли источника, а не по статусу
                  карточки). */}
              <Text style={[s.myBidCounter, { color: '#00C766' }]} testID="trip-counter-amount">
                🔁 {t('counter_amount')}: {formatPrice(myActiveBid.counterAmount, myActiveBid.currency || trip.currency)}
                {myActiveBid.counterMessage ? ` · ${myActiveBid.counterMessage}` : ''}
              </Text>
              <View style={{ marginTop: 8, gap: 8 }}>
                <PrimaryCTA
                  testID="trip-counter-accept"
                  role="client"
                  icon="✓"
                  label={myBidCanAcceptCounter ? `${t('accept_counter')} ${formatPrice(myActiveBid.counterAmount, myActiveBid.currency || trip.currency)}` : myBidDepthLabel}
                  numberOfLines={2}
                  loading={counterActing}
                  disabled={counterActing || !myBidCanAcceptCounter}
                  onPress={acceptCounter}
                />
                <DestructiveButton
                  testID="trip-counter-decline"
                  icon="↩"
                  label={t('decline_counter')}
                  loading={counterActing}
                  disabled={counterActing}
                  onPress={declineCounter}
                />
              </View>
            </>
          ) : (
          <View style={{ marginTop: 8, gap: 4 }}>
            {/* Клиент + своя ставка pending: primary НЕТ (ждём хода водителя),
                чата ещё нет — сделки нет. Edit — единственная кнопка,
                на всю ширину (не в паре). Секция 15 ТЗ (05.08.2026): убраны
                декоративные emoji-иконки, «Отозвать ставку» — мелкая
                красная текстовая ссылка, а не большая деструктивная кнопка. */}
            <SecondaryButton
              testID="trip-my-bid-edit"
              role="client"
              label={editBidLabel}
              onPress={() => setBidModal(true)}
              disabled={cancelling}
            />
            <TouchableOpacity
              testID="trip-my-bid-cancel"
              disabled={cancelling}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ alignSelf: 'center', marginTop: 6, opacity: cancelling ? 0.5 : 1 }}
              onPress={async () => {
                const ok = await askConfirm(t('cancel_bid_confirm'), '', t('withdraw_bid_link'), true);
                if (!ok) return;
                setCancelling(true);
                try {
                  const r = await marketAPI.cancelBid(myActiveBid.id);
                  if (r.ok) {
                    toast(t('bid_cancelled_toast'), 'success');
                    setRefreshBidTick(x => x + 1);
                  } else {
                    toast(r.detail || t('cancel_failed'), 'error');
                  }
                } catch {
                  toast(t('no_connection'), 'error');
                }
                setCancelling(false);
              }}
            >
              <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>
                {cancelling ? '…' : t('withdraw_bid_link')}
              </Text>
            </TouchableOpacity>
          </View>
          )}
        </View>
      ) : null}

      {/* Sticky CTA — shipper viewing someone else's trip.
          Только «Предложить цену» — свободный чат до сделки убран (решение
          владельца 03.08): после accept ставки автоматически создаётся комната
          сделки, до этого переговоры ведутся через ставку/контрпредложение. */}
      {!isOwner && !dealStatus && role === 'client' && !myActiveBid ? (
        <StickyCTABar
          accent={v1Accent.main}
          primary={{
            label: t('suggestPrice'),
            onPress: async () => {
              const ok = await requireLevel(LEVELS.PHONE, 'bid');
              if (ok) setBidModal(true);
            },
            testID: 'trip-sticky-bid',
          }}
        />
      ) : null}

      {/* BidModal: create — новая ставка клиента; edit — своя активная;
          counter — владелец-водитель отвечает встречкой на ставку клиента.
          Toast успеха показывает сама модалка (bidSent/bid_updated/
          counter_sent) — здесь только refresh, без второго тоста. */}
      <BidModal
        visible={bidModal}
        onClose={() => { setBidModal(false); setCounterBidTarget(null); setRefreshBidTick(x => x + 1); }}
        onSubmit={() => { setRefreshBidTick(x => x + 1); }}
        mode={counterBidTarget ? 'counter' : (myActiveBid ? 'edit' : 'create')}
        bidId={counterBidTarget?.id || myActiveBid?.id}
        initialAmount={counterBidTarget ? counterBidTarget.amount : myActiveBid?.amount}
        initialMessage={counterBidTarget ? '' : myActiveBid?.message}
        currentPrice={trip.price || 0}
        currency={trip.currency}
        tripId={trip.id}
        direction="down"
        accent={v1Accent.main}
        onAccent={v1Accent.onAccent}
      />


      <AppConfirmModal
        visible={!!confirmDialog}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        cancelLabel={t('cancel')}
        confirmLabel={confirmDialog?.confirmLabel || t('confirm')}
        destructive={!!confirmDialog?.destructive}
        onCancel={() => settleConfirm(false)}
        onConfirm={() => settleConfirm(true)}
        testID="trip-confirm-modal"
      />
      <ShareModal
        visible={shareModal}
        onClose={() => setShareModal(false)}
        shareText={buildTripShareText({ ...trip, truckTypeLabel: view.truckType }, `${WEB_URL || 'https://urtruck.kz'}/trip/${trip.id}`, lang)}
        url={`${WEB_URL || 'https://urtruck.kz'}/trip/${trip.id}`}
      />
      {/* Stage 17: RatingModal removed alongside the inline
          "Оставить отзыв" CTA. Reviews live on CargoDetail's
          delivery flow (`dealStatus === 'delivered'`) where there
          is an actual completed transaction to rate. */}
      {Gate}
    </SafeAreaView>
  );
}
