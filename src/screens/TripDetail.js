import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { formatBids } from '../utils/i18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import RouteMap from '../components/RouteMap';
import { localizePlace } from '../utils/places';
import GradientText from '../components/GradientText';
import ShareModal from '../components/ShareModal';
import { routeStats } from '../utils/geo';
import { removeTrip, advanceTripState, TRIP_STATES, TRIP_STATE_INFO } from '../utils/store';
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
  secondaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8, borderWidth: 0, backgroundColor: 'rgba(148,163,184,0.14)' },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dangerBtn: { borderWidth: 0, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8, backgroundColor: 'rgba(239,68,68,0.10)' },
  dangerBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '800' },
  myBidCard: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, borderWidth: 2 },
  myBidHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  myBidLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  myBidAmount: { fontSize: 22, fontWeight: '900', letterSpacing: -0.3 },
  myBidStatus: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  myBidCounter: { fontSize: 14, fontWeight: '800', marginBottom: 12 },
  bidsTitle: { fontSize: 14, fontWeight: '700', marginTop: 2, marginBottom: 8 },
  myBidBtnRow: { flexDirection: 'row', gap: 10 },
  myBidBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  myBidBtnText: { fontSize: 14, fontWeight: '800' },
  dealActionBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  dealActionGhost: { backgroundColor: 'transparent', borderWidth: 1.6 },
  dealActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },

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
    const normalised = normalizeTrip(serverTrip || rawTrip);
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
  const [statusLoading, setStatusLoading] = React.useState(false);
  // Моя активная ставка на ЭТОТ рейс — чтобы показать плашку «Вы предложили X»
  // с кнопками [Изменить] [Чат] вместо тупого «Предложить цену», когда клиент
  // уже сделал ставку (жалоба 28.07, скрин IMG_6791: пусто под статусом
  // рейса — непонятно, дошло или нет).
  const [myActiveBid, setMyActiveBid] = React.useState(null);
  const [openingChat, setOpeningChat] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  // Same authoritative-role logic as CargoDetail: route.params.role wins,
  // id-based comparison is a fallback for direct entry without a role hint.
  const isDriverSide = role === 'driver' || (driverId && driverId === myUserId);
  const isShipper = role === 'client' || role === 'shipper' || (shipperId && shipperId === myUserId);

  const applyDeal = (d) => {
    if (!d || !d.id) return;
    setDealId(d.id);
    setDealStatus(d.status || 'accepted');
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
  const tid = (trip && trip.id) || tripId;

  // Один источник ставок — GET /bids?trip_id (как CargoDetail): даёт счётчик
  // предложений, confidential-режим, owner-вид и МОЮ ставку со встречкой
  // (counter_amount/counter_message) — dashboard my_bids этого не давал.
  const loadBids = React.useCallback(() => {
    if (!tid) return;
    marketAPI.listBids({ tripId: tid }).then(d => {
      const mapped = (d.bids || []).map(b => ({
        id: b.id, bidderId: b.bidder_id,
        name: b.bidder_name || t('anonymous'),
        rating: b.bidder_rating || 0,
        reviews: b.bidder_reviews_count || 0,
        verified: !!b.bidder_verified,
        amount: b.amount, currency: b.currency,
        message: b.message, status: b.status,
        isMine: b.bidder_id === myUserId,
        counterAmount: b.counter_amount,
        counterMessage: b.counter_message,
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
      } : (mapped.find(b => b.isMine && (b.status === 'pending' || b.status === 'countered')) || null);
      setMyActiveBid(mine);
    }).catch(() => {});
  }, [tid, myUserId, t]);

  const refreshAll = React.useCallback(() => {
    if (!tid) return;
    // Свежий рейс с сервера — актуальная цена/статус + driver_rating/
    // driver_verified для карточки водителя (get_trip обогащает).
    marketAPI.getTrip(tid).then(d => { if (d && !d.detail) setServerTrip(d); }).catch(() => {});
    loadBids();
    if (routeDealId) {
      marketAPI.getDeal(routeDealId).then(d => { if (d && d.ok !== false) applyDeal(d); }).catch(() => {});
    } else {
      marketAPI.myDashboard().then(d => {
        const foundDeal = (d?.my_deals || []).find(x => String(x.trip_id) === String(tid));
        if (foundDeal) applyDeal(foundDeal);
      }).catch(() => {});
    }
  }, [tid, routeDealId, loadBids]);

  useFocusEffect(React.useCallback(() => {
    refreshAll();
    const iv = setInterval(refreshAll, 15000);
    return () => clearInterval(iv);
  }, [refreshAll]));

  React.useEffect(() => { if (refreshBidTick > 0) refreshAll(); }, [refreshBidTick]);

  const openBidChat = React.useCallback(async () => {
    if (!myActiveBid || openingChat) return;
    setOpeningChat(true);
    try {
      const r = await marketAPI.openBidChat(myActiveBid.id);
      if (r?.ok && r.chat_room_id) {
        navigation.navigate('Chat', {
          roomId: r.chat_room_id,
          partner: r.partner_id ? { id: r.partner_id, name: r.partner_name, role: r.partner_role } : undefined,
        });
      } else {
        toast(r?.detail || t('no_connection'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    } finally {
      setOpeningChat(false);
    }
  }, [myActiveBid, openingChat, navigation, toast, t]);

  const myBidStatusLabel = React.useMemo(() => {
    if (!myActiveBid) return '';
    switch (myActiveBid.status) {
      case 'countered': return t('my_bid_status_countered') || 'Водитель предложил встречную цену';
      case 'pending':
      default:          return t('my_bid_status_pending')   || 'Ожидает ответа водителя';
    }
  }, [myActiveBid, t]);

  // Встречка водителя: клиент отвечает ПРЯМО со страницы рейса — принять
  // за сумму встречки (создаёт сделку) или отклонить. Раньше клиент видел
  // только текст «встречная цена» без суммы и без кнопок — петля торга
  // рвалась, надо было идти искать чат.
  const acceptCounter = React.useCallback(async () => {
    if (!myActiveBid || counterActing) return;
    const sum = formatPrice(myActiveBid.counterAmount, myActiveBid.currency || trip.currency);
    const msg = (t('accept_bid_confirm') || 'Принять предложение за {sum}?').replace('{sum}', sum);
    const ok = Platform.OS === 'web'
      ? (typeof window !== 'undefined' && window.confirm(msg))
      : await new Promise((res) => Alert.alert(
          t('accept_counter') || 'Принять', msg,
          [
            { text: t('cancel'), style: 'cancel', onPress: () => res(false) },
            { text: t('accept_counter') || 'Принять', onPress: () => res(true) },
          ],
        ));
    if (!ok) return;
    setCounterActing(true);
    try {
      const r = await marketAPI.acceptCounterBid(myActiveBid.id);
      if (r.ok) {
        toast('✅ ' + t('counter_accepted'), 'success');
        if (r.chat_room_id) setChatRoomId(r.chat_room_id);
        if (r.deal_id) { setDealId(r.deal_id); setDealStatus('accepted'); }
        refreshAll();
      } else {
        toast(r.detail || t('accept_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
    setCounterActing(false);
  }, [myActiveBid, counterActing, trip.currency, refreshAll, toast, t]);

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

  const changeDealStatus = async (newStatus) => {
    if (!dealId || statusLoading) return;
    setStatusLoading(true);
    try {
      const r = await marketAPI.updateDealStatus(dealId, newStatus);
      if (r.ok) {
        setDealStatus(newStatus);
        toast(newStatus === 'cancelled' ? t('deal_cancelled_toast') : t('deal_updated_toast'), 'success');
      } else {
        toast(r.detail || t('update_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
    setStatusLoading(false);
  };

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
            <Feather name="truck" size={20} color="#22C55E" />
            <GradientText style={s.title} colors={['#22C55E', '#16A34A']}>{t('trip_title')}</GradientText>
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
    return (
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={[s.section, {
          backgroundColor: theme.card,
          borderColor: dealStatus === 'delivered' ? '#22C55E'
            : dealStatus === 'in_progress' ? '#FF8400'
            : dealStatus === 'cancelled' ? '#EF4444'
            : '#FF8400',
          borderWidth: 2,
        }]}>
          <Text style={[s.sectionTitle, {
            color: dealStatus === 'delivered' ? '#22C55E'
              : dealStatus === 'in_progress' ? '#FF8400'
              : dealStatus === 'cancelled' ? '#EF4444'
              : '#FF8400',
            textAlign: 'center',
          }]}>
            {dealStatus === 'accepted'    && '🤝 ' + t('status_accepted')}
            {dealStatus === 'in_progress' && '🚛 ' + t('status_in_progress')}
            {dealStatus === 'delivered'   && '✅ ' + t('status_delivered')}
            {dealStatus === 'cancelled'   && '❌ ' + t('status_cancelled')}
          </Text>
          {(dealStatus === 'accepted' || dealStatus === 'in_progress') && (
            <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center' }}>
              {t('order_next_step')}: {
                isDriverSide
                  ? (dealStatus === 'accepted' ? t('driver_next_step_accepted') : t('driver_next_step_in_progress'))
                  : (dealStatus === 'accepted' ? t('shipper_next_step_accepted') : t('shipper_next_step_in_progress'))
              }
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
            {isDriverSide && dealStatus === 'accepted' && (
              <TouchableOpacity style={[s.dealActionBtn, { backgroundColor: v1Accent.main }]} onPress={() => changeDealStatus('in_progress')} disabled={statusLoading}>
                <Text style={s.dealActionText}>{statusLoading ? '...' : '🚛 ' + t('start_delivery')}</Text>
              </TouchableOpacity>
            )}
            {isDriverSide && dealStatus === 'in_progress' && (
              <TouchableOpacity style={[s.dealActionBtn, { backgroundColor: v1Accent.main }]} onPress={() => changeDealStatus('delivered')} disabled={statusLoading}>
                <Text style={s.dealActionText}>{statusLoading ? '...' : '✅ ' + t('mark_arrived')}</Text>
              </TouchableOpacity>
            )}
            {isShipper && (dealStatus === 'in_progress' || dealStatus === 'at_border') && (
              <TouchableOpacity style={[s.dealActionBtn, s.dealActionGhost, { borderColor: v1Accent.main }]} onPress={() => changeDealStatus('delivered')} disabled={statusLoading}>
                <Text style={[s.dealActionText, { color: v1Accent.main }]}>{statusLoading ? '...' : '✅ ' + t('confirm_delivery')}</Text>
              </TouchableOpacity>
            )}
            {chatRoomId && (
              <TouchableOpacity
                style={[s.dealActionBtn, s.dealActionGhost, { borderColor: v1Accent.main }]}
                onPress={() => navigation.navigate('Chat', { roomId: chatRoomId, role, tripId: (trip && trip.id) || tripId, partner: driverId ? { id: driverId } : undefined })}
              >
                <Text style={[s.dealActionText, { color: v1Accent.main }]}>💬 {t('order_chat')}</Text>
              </TouchableOpacity>
            )}
            {(dealStatus === 'accepted' || dealStatus === 'in_progress' || dealStatus === 'at_border') && (
              <TouchableOpacity
                style={[s.dealActionBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444' }]}
                disabled={statusLoading}
                onPress={() => {
                  // Подтверждение на обеих платформах (раньше на native отменяло
                  // мгновенно без вопроса при случайном тапе).
                  const doCancel = () => changeDealStatus('cancelled');
                  if (Platform.OS === 'web') {
                    if (typeof window !== 'undefined' && window.confirm(t('cancel_deal_confirm'))) doCancel();
                  } else {
                    Alert.alert(t('cancel_deal_confirm'), '', [
                      { text: t('cancel'), style: 'cancel' },
                      { text: t('confirm'), style: 'destructive', onPress: doCancel },
                    ]);
                  }
                }}
              >
                <Text style={[s.dealActionText, { color: '#EF4444' }]}>⊘ {t('cancel_deal')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }

  const stats = routeStats(trip.from, trip.to, trip.transit);
  const view = tripDisplay(trip, t);
  // Принятая ставка → в блоке цены показываем сумму сделки, не листинг.
  const acceptedBid = bids.find(b => b.status === 'accepted');

  const onDelete = () => {
    const confirmDelete = () => {
      removeTrip(trip.id);
      toast('🗑 ' + t('trip_deleted_toast'), 'info');
      navigation.goBack();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(t('trip_delete_q'))) confirmDelete();
    } else {
      Alert.alert(t('trip_delete_q'), '', [
        { text: t('cancel') },
        { text: t('delete'), style: 'destructive', onPress: confirmDelete },
      ]);
    }
  };

  const isOwner = trip.isMine || trip.driverId === myUserId || trip.driverName === 'Вы' || trip.driverName === 'You';

  // v1 visual: emerald accent for trip-detail (driver supply); orange when
  // shipper opens it (client-side flow).
  const v1Accent = v1AccentFor(role === 'client' || role === 'shipper' ? 'client' : 'driver');

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandBarWithShare
        onBack={() => navigation.goBack()}
        onShare={() => setShareModal(true)}
        accent={v1Accent.main}
        rightTestID="trip-share-btn"
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 60 }}>
        {/* Stage 17: leading 🚛 dropped to match Stage 16's quiet
            language across detail titles. */}
        <Text style={s.pageTitle}>{t('trip_title')}</Text>

        {/* Маршрут на карте */}
        <View style={{ marginBottom: 10, borderRadius: v1Radius.card, overflow: 'hidden' }}>
          <RouteMap from={trip.from} to={trip.to} transit={trip.transit} height={180} />
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
            <View style={[s.dot, { backgroundColor: '#22C55E' }]} />
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
          {/* Владелец видит себя строкой («Вы»); для чужого зрителя строка
              убрана — ниже отдельная карточка водителя с рейтингом и тапом
              на профиль (элемент доверия, зеркально карточке грузоотправителя
              в CargoDetail). */}
          {isOwner ? (
            <View style={s.dateRow}>
              <Text style={[s.dateLabel, { color: v1.textMuted }]}>{t('trip_driver')}</Text>
              <Text style={[s.dateValue, { color: v1.text }]}>{view.driverName}</Text>
            </View>
          ) : null}
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
        {!isOwner && (trip.driverId || view.driverName) ? (
          <TouchableOpacity
            activeOpacity={trip.driverId ? 0.75 : 1}
            disabled={!trip.driverId}
            onPress={() => navigation.navigate('DriverDetail', {
              driver: {
                id: trip.driverId,
                name: serverTrip?.driver_display_name || view.driverName,
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
                  {serverTrip?.driver_display_name || view.driverName}{trip.driverId ? ' ›' : ''}
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
        ) : null}

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
        {!isOwner ? (
          <>
            <Text style={[s.bidsTitle, { color: v1.text }]} testID="trip-bids-count">{formatBids(bidsCount)}</Text>
            {bidsConfidential && bidsCount > 0 ? (
              <Text style={{ color: v1.textMuted, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 8, fontSize: 12 }}>
                {t('bids_confidential_hint')}
              </Text>
            ) : null}
            {bidsCount === 0 ? (
              <Text style={{ color: v1.textMuted, paddingBottom: 8, fontSize: 13 }}>
                {t('no_bids_be_first')}
              </Text>
            ) : null}
          </>
        ) : null}

        {/* Timeline статусов */}
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
                {isOwner && !passed && i === currentIdx + 1 && (
                  <TouchableOpacity
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: info.color }}
                    onPress={() => advanceTripState(trip.id, st)}
                  >
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>{t('trip_mark')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </GlassCard>

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
            {(trip.status || 'active') === 'active' && !dealStatus && (
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: v1Accent.main }]}
                onPress={() => navigation.navigate('EditTrip', { tripId: trip.id, trip })}
                testID="trip-detail-edit-btn"
              >
                <Text style={[s.primaryBtnText, { color: '#0A0A0A' }]}>✏️ {t('edit_btn')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.dangerBtn, { borderColor: '#EF4444' }]} onPress={onDelete}>
              <Text style={s.dangerBtnText}>🗑 {t('trip_delete')}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>

      {dealStatus ? renderDealBlock() : null}

      {/* «Моя ставка» плашка — показываем, когда клиент уже сделал ставку
          на этот рейс и сделки ещё нет. По жалобе владельца 28.07: после
          отправки предложения на карточке рейса не было НИКАКОЙ обратной
          связи (дошло/не дошло/можно ли изменить/где чат). Плашка + два
          действия: изменить сумму или сразу перейти в чат. */}
      {myActiveBid && !dealStatus && !isOwner ? (
        <View style={[s.myBidCard, { borderColor: v1Accent.main, backgroundColor: v1.card }]} testID="trip-my-active-bid">
          <View style={s.myBidHeader}>
            <Text style={[s.myBidLabel, { color: v1.textMuted }]}>{t('my_bid_label') || 'Моя ставка'}</Text>
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
              {/* Встречная цена водителя — сумма крупно + его комментарий.
                  Ответ в один тап: принять (создаёт сделку) или отклонить. */}
              <Text style={[s.myBidCounter, { color: '#E06D00' }]} testID="trip-counter-amount">
                🔁 {t('counter_amount')}: {formatPrice(myActiveBid.counterAmount, myActiveBid.currency || trip.currency)}
                {myActiveBid.counterMessage ? ` · ${myActiveBid.counterMessage}` : ''}
              </Text>
              <View style={[s.myBidBtnRow, { flexWrap: 'wrap' }]}>
                <TouchableOpacity
                  style={[s.myBidBtn, { borderColor: '#EF4444' }, counterActing && { opacity: 0.5 }]}
                  onPress={declineCounter}
                  disabled={counterActing}
                  testID="trip-counter-decline"
                >
                  <Text style={[s.myBidBtnText, { color: '#EF4444' }]}>↩ {t('decline_counter')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.myBidBtn, { borderColor: v1Accent.main }]}
                  onPress={openBidChat}
                  disabled={openingChat}
                  testID="trip-my-bid-chat"
                >
                  <Text style={[s.myBidBtnText, { color: v1Accent.main }]}>💬 {t('open_chat') || 'Чат'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.myBidBtn, { backgroundColor: v1Accent.main, borderColor: v1Accent.main, flexBasis: '100%' }, counterActing && { opacity: 0.5 }]}
                  onPress={acceptCounter}
                  disabled={counterActing}
                  testID="trip-counter-accept"
                >
                  <Text style={[s.myBidBtnText, { color: v1Accent.onAccent }]}>
                    ✅ {t('accept_counter')} {formatPrice(myActiveBid.counterAmount, myActiveBid.currency || trip.currency)}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
          <View style={s.myBidBtnRow}>
            <TouchableOpacity
              style={[s.myBidBtn, { borderColor: v1Accent.main }]}
              onPress={() => setBidModal(true)}
              testID="trip-my-bid-edit"
            >
              <Text style={[s.myBidBtnText, { color: v1Accent.main }]}>✏️ {t('edit_bid') || 'Изменить'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.myBidBtn, { backgroundColor: v1Accent.main, borderColor: v1Accent.main }]}
              onPress={openBidChat}
              disabled={openingChat}
              testID="trip-my-bid-chat"
            >
              <Text style={[s.myBidBtnText, { color: v1Accent.onAccent }]}>💬 {t('open_chat') || 'Чат'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.myBidBtn, { borderColor: '#EF4444' }, cancelling && { opacity: 0.5 }]}
              onPress={async () => {
                // Подтверждение на обеих платформах (web:confirm, native:Alert) —
                // раньше native отменял мгновенно при случайном тапе.
                const ok = Platform.OS === 'web'
                  ? (typeof window !== 'undefined' && window.confirm(t('cancel_bid_confirm')))
                  : await new Promise((res) => Alert.alert(
                      t('cancel_bid_confirm'), '',
                      [
                        { text: t('cancel'), style: 'cancel', onPress: () => res(false) },
                        { text: t('cancel_bid'), style: 'destructive', onPress: () => res(true) },
                      ],
                    ));
                if (!ok) return;
                setCancelling(true);
                try {
                  const r = await marketAPI.cancelBid(myActiveBid.id);
                  if (r.ok) {
                    toast('⊘ ' + t('bid_cancelled_toast'), 'success');
                    setRefreshBidTick(x => x + 1);
                  } else {
                    toast(r.detail || t('cancel_failed'), 'error');
                  }
                } catch {
                  toast(t('no_connection'), 'error');
                }
                setCancelling(false);
              }}
              disabled={cancelling}
              testID="trip-my-bid-cancel"
            >
              <Text style={[s.myBidBtnText, { color: '#EF4444' }]}>⊘ {t('cancel_bid') || 'Отменить'}</Text>
            </TouchableOpacity>
          </View>
          )}
        </View>
      ) : null}

      {/* Sticky CTA — shipper viewing someone else's trip.
          Если у клиента уже есть активная ставка — прячем «Предложить цену»
          (действия перенесены в плашку выше: [Изменить] [Чат]). */}
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
          secondary={{
            // Чат с водителем доступен ДО ставки (на базаре сначала
            // разговаривают) — зеркально CargoDetail. Комната создастся
            // на первом сообщении по driverId.
            label: '💬 ' + t('order_chat'),
            onPress: () => {
              if (chatRoomId) {
                navigation.navigate('Chat', { roomId: chatRoomId, role, tripId: tid });
              } else if (trip.driverId) {
                navigation.navigate('Chat', { partner: { id: trip.driverId }, tripId: tid, role });
              } else {
                toast(t('chat_open_failed'), 'error');
              }
            },
            testID: 'trip-sticky-chat',
          }}
        />
      ) : null}

      {/* BidModal: create для новой ставки, edit — когда есть активная. */}
      <BidModal
        visible={bidModal}
        onClose={() => { setBidModal(false); setRefreshBidTick(x => x + 1); }}
        onSubmit={() => {
          setRefreshBidTick(x => x + 1);
          toast('✓ ' + (myActiveBid ? t('bid_updated') : t('bidSent')), 'success');
        }}
        mode={myActiveBid ? 'edit' : 'create'}
        bidId={myActiveBid?.id}
        initialAmount={myActiveBid?.amount}
        initialMessage={myActiveBid?.message}
        currentPrice={trip.price || 0}
        currency={trip.currency}
        tripId={trip.id}
        direction="down"
        accent={v1Accent.main}
        onAccent={v1Accent.onAccent}
      />


      <ShareModal
        visible={shareModal}
        onClose={() => setShareModal(false)}
        shareText={buildTripShareText({ ...trip, truckTypeLabel: view.truckType }, `${WEB_URL || 'https://urtruck.kz'}/trip/${trip.id}`)}
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

