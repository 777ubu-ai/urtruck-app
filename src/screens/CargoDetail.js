import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Alert, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { formatBids, t as tGlobal } from '../utils/i18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { PhotoGallery } from '../components/PhotoGallery';
import { addNotification, removeCargo } from '../utils/store';
import { routeStats } from '../utils/geo';
import BidModal from '../components/BidModal';
import ShareModal from '../components/ShareModal';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS, useAuth } from '../utils/AuthContext';
import { marketAPI } from '../utils/marketAPI';
import { reviewsAPI } from '../utils/reviews';
import { normalizeCargo, cargoDisplay, sanitizeForDisplay } from '../utils/normalizers';
import { formatDateForDisplay } from '../utils/dateInput';
import { buildCargoShareText } from '../utils/share';
import { WEB_URL } from '../config/env';
import {v1Colors, useV1Colors, v1Radius, v1AccentFor} from '../theme/designV1';
import GlassCard from '../components/ui/v1/GlassCard';
import SectionTitle from '../components/ui/v1/SectionTitle';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import StickyCTABar from '../components/ui/v1/StickyCTABar';

const FLAGS = { KZ: '🇰🇿', UZ: '🇺🇿', RU: '🇷🇺', KG: '🇰🇬', CN: '🇨🇳', TJ: '🇹🇯', TR: '🇹🇷', TM: '🇹🇲', MN: '🇲🇳', DE: '🇩🇪', FR: '🇫🇷' };

// HOT-003: скрываем техмусор из description (остатки init_db, стектрейсы и т.п.)
const TRASH_RE = /init_db|phone_formatter|json_merger|bin_iin|SQL|sqlite|traceback|\bError:|File "[^"]+\.py"|line \d+|^```|stderr|\.py\b|SELECT |INSERT |UPDATE |DELETE |CREATE TABLE/gi;
// Stage 9: combine the legacy tech-stack scrub with the new
// `sanitizeForDisplay` (QA markers / agent ids / currency-regression
// labels) so detail screens never surface developer strings.
const sanitizeDesc = (s) => {
  const stage1 = String(s || '').replace(TRASH_RE, ' ');
  const stage2 = sanitizeForDisplay(stage1);
  return stage2 || tGlobal('desc_not_specified');
};

export default function CargoDetail({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  container: { flex: 1 },
  // Brand bar moved to <BrandBarWithShare/> in stage 3D — local
  // brandBar/backHit/backIcon/brandRow/brandText/ftlPill/ftlText/shareBtn/
  // shareIcon styles were removed as part of stage 3E cleanup.
  pageTitle: { color: v1.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginVertical: 12 },
  priceLabelV1: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  priceValueV1: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  // Legacy local styles still used by deal-block / bid cards / reviews
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  section: { borderRadius: 16, padding: 18, borderWidth: 1, marginBottom: 10 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  city: { fontSize: 17, fontWeight: '800' },
  line: { flex: 1, height: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '50%', marginBottom: 10 },
  gridLabel: { fontSize: 10 },
  gridValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  priceBlock: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#052E16', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#14532D', marginBottom: 16 },
  priceLabel: { color: '#4ADE80', fontSize: 11 },
  priceValue: { color: '#22C55E', fontSize: 28, fontWeight: '900' },
  beta: { color: '#57534E', fontSize: 10 },
  bidBtn: { backgroundColor: '#22C55E', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14 },
  bidBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  bidsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  bidCard: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bidLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  bidFlag: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bidName: { fontSize: 13, fontWeight: '600' },
  bidInfo: { color: '#FBBF24', fontSize: 11 },
  bidAmt: { color: '#22C55E', fontSize: 16, fontWeight: '900', flexShrink: 0 },
  confirmBanner: { backgroundColor: '#22C55E20', borderWidth: 1, borderColor: '#22C55E', borderRadius: 12, padding: 14, marginBottom: 12, alignItems: 'center' },
  confirmText: { color: '#22C55E', fontSize: 14, fontWeight: '800' },
  photoWrap: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, marginBottom: 12, position: 'relative' },
  photo: { width: '100%', height: 200 },
  photoBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  photoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  acceptBtn: { backgroundColor: '#22C55E', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  acceptBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rejectBtn: { backgroundColor: 'transparent', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#EF4444' },
  rejectBtnText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  miniBtn: { backgroundColor: 'transparent', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  miniBtnText: { fontSize: 11, fontWeight: '700' },
  paymentBlock: { borderRadius: 12, borderWidth: 1, padding: 14 },
  reviewBlock: { borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 10 },
  reviewTitle: { fontSize: 15, fontWeight: '700' },
  starsRow: { flexDirection: 'row', gap: 8 },
  reviewInput: { width: '100%', borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13 },
  reviewSubmitBtn: { backgroundColor: '#22C55E', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  reviewSubmitText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dealBlock: { borderWidth: 2, borderRadius: 14, padding: 16, alignItems: 'center', gap: 10 },
  dealStatusLabel: { fontSize: 15, fontWeight: '700' },
  dealActionBtn: { backgroundColor: '#22C55E', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  dealActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chatBtn: { backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  chatBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteMyBtn: { borderWidth: 1, borderColor: '#EF4444', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  deleteMyBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '800' },

  }), [v1]);
  const { cargo: paramCargo, cargoId, role, dealId: routeDealId } = route.params || {};
  // Canonical cargo: never reach into raw fields directly. The pre-pilot
  // mixed shapes (server snake_case, FeedScreen camelCase, store.js demo)
  // all flow through normalizeCargo so renders never blow up on null.
  const cargo = normalizeCargo(paramCargo) || {};
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const { session } = useAuth();
  const myUserId = session?.user?.id;
  const [bidModal, setBidModal] = useState(false);
  const [bidModalMode, setBidModalMode] = useState('create');
  const [editingBid, setEditingBid] = useState(null);
  const [shareModal, setShareModal] = useState(false);
  const [bids, setBids] = useState([]);
  const [fullCargo, setFullCargo] = useState(null);
  // `c` collapses (server fetch || nav params) to one canonical shape so all
  // JSX paths read defensively. Closures (handlers, useEffect) reference `c`
  // freshly via the latest render, like any other derived value.
  const [accepting, setAccepting] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [chatRoomId, setChatRoomId] = useState(null);
  const [dealId, setDealId] = useState(routeDealId || null);
  const [dealStatus, setDealStatus] = useState(null);
  const [shipperId, setShipperId] = useState(null);
  const [driverId, setDriverId] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSent, setReviewSent] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [acceptedDriverId, setAcceptedDriverId] = useState(null);
  // Live canonical cargo (server overrides params when available)
  const c = (fullCargo && normalizeCargo(fullCargo)) || cargo;
  const cid = cargoId || c.id;
  // route.params.role is the authoritative side hint when CargoDetail is opened
  // from MyTripsScreen → Orders. The previous id-based comparison is unreliable
  // because session.user.id is a synthetic `u_<timestamp>` until AuthContext
  // refreshes it from /register/me, which races the deal-block render.
  const isDriverSide = role === 'driver'
    || (driverId && driverId === myUserId)
    || (acceptedDriverId && acceptedDriverId === myUserId);
  const isShipper = role === 'client' || role === 'shipper'
    || !!c.isMine
    || (shipperId && shipperId === myUserId);
  if (!cid && !c.from) return null;

  const loadBids = () => {
    if (!cid) return;
    marketAPI.listBids({ cargoId: cid })
      .then(d => {
        const mapped = (d.bids || []).map(b => ({
          id: b.id, bidderId: b.bidder_id,
          name: b.bidder_name || b.bidder_phone || t('anonymous'),
          co: 'KZ', rating: 0, amount: b.amount,
          time: b.created_at?.slice(11, 16) || '•', message: b.message,
          status: b.status, isMine: b.bidder_id === myUserId,
          counterAmount: b.counter_amount,
          counterMessage: b.counter_message,
          counterBy: b.counter_by,
        }));
        setBids(mapped);
        const accepted = mapped.find(b => b.status === 'accepted');
        if (accepted) {
          setAcceptedDriverId(accepted.bidderId);
          if (!dealStatus) setDealStatus('accepted');
        }
      })
      .catch(() => {});
  };

  const openChatForBid = async (bid) => {
    try {
      const r = await marketAPI.openBidChat(bid.id);
      if (r.ok) {
        const roomId = r.chat_room_id || r.chatRoomId;
        if (roomId) {
          navigation.navigate('Chat', { roomId, role });
        } else {
          toast(t('chat_open_failed'), 'error');
        }
      } else {
        toast(r.detail || t('chat_open_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
  };

  const sendCounter = (bid) => {
    setEditingBid(bid);
    setBidModalMode('counter');
    setBidModal(true);
  };

  const acceptCounter = async (bid) => {
    try {
      const r = await marketAPI.acceptCounterBid(bid.id);
      if (r.ok) {
        toast('✅ ' + t('counter_accepted'), 'success');
        if (r.chat_room_id) setChatRoomId(r.chat_room_id);
        if (r.deal_id) { setDealId(r.deal_id); setDealStatus('accepted'); }
        loadBids();
      } else {
        toast(r.detail || t('accept_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
  };

  const declineCounter = async (bid) => {
    try {
      const r = await marketAPI.declineCounterBid(bid.id);
      if (r.ok) {
        toast('↩ ' + t('counter_declined'), 'success');
        loadBids();
      } else {
        toast(r.detail || t('reject_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
  };

  const applyDeal = (d) => {
    if (!d || !d.id) return;
    setDealId(d.id);
    setDealStatus(d.status || 'accepted');
    if (d.chat_room_id) setChatRoomId(d.chat_room_id);
    if (d.shipper_id) setShipperId(d.shipper_id);
    if (d.driver_id) {
      setDriverId(d.driver_id);
      if (!acceptedDriverId) setAcceptedDriverId(d.driver_id);
    }
  };

  // On mount: try to fetch the deal by id (if route provided one), otherwise
  // look it up via /market/my and match by cargo_id. This lets a re-opened
  // CargoDetail show the deal block with full state instead of staying empty.
  useEffect(() => {
    if (!cid) return;
    marketAPI.getCargo(cid).then(d => { if (d && d.id) setFullCargo(d); }).catch(() => {});
    loadBids();
    if (routeDealId) {
      marketAPI.getDeal(routeDealId).then(d => { if (d && d.ok !== false) applyDeal(d); }).catch(() => {});
    } else {
      marketAPI.myDashboard().then(d => {
        const found = (d?.my_deals || []).find(x => x.cargo_id === cid);
        if (found) applyDeal(found);
      }).catch(() => {});
    }
  }, [c.id, cid, routeDealId]);

  const onDeleteCargo = () => {
    const doDel = async () => {
      if (c._server) {
        await marketAPI.deleteCargo(c.id).catch(() => {});
      } else if (c.id) {
        removeCargo(c.id);
      }
      toast('🗑 Груз удалён', 'info');
      navigation.goBack();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Удалить груз?')) doDel();
    } else {
      Alert.alert('Удалить груз?', '', [{ text: 'Отмена' }, { text: 'Удалить', style: 'destructive', onPress: doDel }]);
    }
  };

  const changeDealStatus = async (newStatus) => {
    if (!dealId || statusLoading) return;
    setStatusLoading(true);
    try {
      const r = await marketAPI.updateDealStatus(dealId, newStatus);
      if (r.ok) {
        setDealStatus(newStatus);
        const msg = newStatus === 'cancelled' ? t('deal_cancelled_toast') : t('deal_updated_toast');
        toast(msg, 'success');
      } else {
        toast(r.detail || t('update_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
    setStatusLoading(false);
  };

  const handleBid = () => {
    // Ставка отправлена через BidModal → перезагружаем список с сервера
    loadBids();
  };

  const view = cargoDisplay(c, t);
  const safePhotos = (c.photos || []).filter(p => typeof p === 'string' && !p.startsWith('data:') && p.length < 1000);
  const dash = t('not_specified');

  // v1 brand accent: orange when cargo is shown to the driver (cargo target),
  // emerald otherwise (owner viewing own listing or shipper-on-shipper). The
  // accent only drives the brand-bar back-arrow + price card border; existing
  // CTA colors (BidModal etc.) remain governed by their own components.
  const isDriverViewing = role === 'driver' || (driverId && driverId === myUserId);
  const v1Accent = v1AccentFor(isDriverViewing ? 'client' : 'driver');

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandBarWithShare
        onBack={() => navigation.goBack()}
        onShare={() => setShareModal(true)}
        accent={v1Accent.main}
        rightTestID="cargo-share-btn"
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 60 }}>
        {/* Stage 17: dropped the leading 📦 — Stage 16 quiet visual
            language already removed the bright route emoji from
            feed cards; the detail title should match. */}
        <Text style={s.pageTitle} numberOfLines={1}>{view.from} → {view.to}</Text>

        {safePhotos.length > 0 ? (
          <View style={{ marginBottom: 10, borderRadius: v1Radius.card, overflow: 'hidden' }}>
            <PhotoGallery photos={safePhotos} />
          </View>
        ) : null}

        <GlassCard>
          <SectionTitle icon="🛣️" label={t('trip_route')} />
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: '#EF4444' }]} /><Text style={[s.city, { color: v1.text }]}>{view.from}</Text>
            <View style={[s.line, { backgroundColor: v1.border }]} /><Text>🚛</Text><View style={[s.line, { backgroundColor: v1.border }]} />
            <Text style={[s.city, { color: v1.text }]}>{view.to}</Text><View style={[s.dot, { backgroundColor: '#22C55E' }]} />
          </View>
          <View style={s.grid}>
            {(() => {
              const stats = routeStats(c.from, c.to);
              const desc = sanitizeDesc(c.cargoDesc);
              const items = [];
              items.push([t('cargoDesc'), desc || dash]);
              // Stage 17: previously a single mushy cell labelled
              // "Вес/Объём" with a "X т · Y м³" string. Split into
              // two grid items so weight and volume each get their
              // own slot and a missing one doesn't read as missing
              // both. Matches TripDetail's transport block.
              items.push([t('weight'), view.weight]);
              items.push([t('volume'), view.volume]);
              items.push([t('truckType'), view.cargoType]);
              items.push([t('pickupDate'), c.pickupDate ? formatDateForDisplay(c.pickupDate) : dash]);
              if (stats) {
                items.push([t('distance'), stats.km + ' км']);
                items.push([t('delivery_time'), '~' + stats.days + ' дн.']);
              }
              return items.map(([l, v]) => (
                <View key={l} style={s.gridItem}><Text style={[s.gridLabel, { color: v1.textMuted }]}>{l}</Text><Text style={[s.gridValue, { color: v1.text }]}>{v}</Text></View>
              ));
            })()}
          </View>
        </GlassCard>

        <GlassCard accent={v1Accent.main}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={[s.priceLabelV1, { color: v1Accent.main }]}>💰 {t('price')}</Text>
              <Text style={[s.priceValueV1, { color: v1Accent.main }]} numberOfLines={1}>{view.price}</Text>
            </View>
            {/* Stage 9: previously a "Предложить цену" button sat right
                here next to the price block AND on the sticky bar at
                the bottom — clicking either ran the same setBidModal(true).
                The sticky bar is the canonical primary CTA, so this
                inline duplicate is removed. */}
          </View>
        </GlassCard>
        <Text style={[s.bidsTitle, { color: theme.text }]}>{formatBids(bids.length)}</Text>
        {bids.length === 0 && (
          <Text style={{ color: theme.textMuted, textAlign: 'center', padding: 20, fontSize: 13 }}>
            Пока нет предложений. Будьте первым!
          </Text>
        )}
        {bids.map(b => {
          const hasAccepted = bids.some(x => x.status === 'accepted');
          const isCancelled = b.status === 'cancelled';
          const isCountered = b.status === 'countered';
          const isActive = b.status === 'pending' || isCountered;
          return (
            <View key={b.id} style={[s.bidCard, {
              backgroundColor: theme.card,
              borderColor: b.status === 'accepted' ? '#22C55E'
                : b.status === 'rejected' ? '#EF444440'
                : isCancelled ? '#78716C40'
                : isCountered ? '#D97706' /* purple — counter active */
                : b.isMine ? '#22C55E60' : theme.border,
              borderWidth: b.status === 'accepted' || isCountered || b.isMine ? 2 : 1,
              opacity: (b.status === 'rejected' || isCancelled) ? 0.55 : 1,
            }]}>
              <View style={s.bidLeft}>
                <View style={[s.bidFlag, { backgroundColor: b.status === 'accepted' ? '#22C55E' : b.isMine ? '#22C55E' : theme.border }]}>
                  <Text style={{ fontSize: 14 }}>{b.isMine ? '🫵' : b.status === 'accepted' ? '✅' : isCountered ? '🔁' : (FLAGS[b.co] || '🏳️')}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bidName, { color: theme.text }]}>{b.name}{b.isMine ? ' ' + t('you_marker') : ''}</Text>
                  {b.message ? <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{b.message}</Text> : null}
                  <Text style={[s.bidInfo, {
                    color: b.status === 'accepted' ? '#22C55E'
                      : b.status === 'rejected' ? '#EF4444'
                      : isCancelled ? '#78716C'
                      : isCountered ? '#D97706'
                      : '#FBBF24',
                  }]}>
                    {b.status === 'accepted' ? '✅ ' + t('driver_chosen')
                      : b.status === 'rejected' ? '❌ ' + t('bid_rejected')
                      : isCancelled ? '⊘ ' + t('bid_cancelled')
                      : isCountered ? '🔁 ' + (c.isMine ? t('counter_sent_status') : t('bid_countered'))
                      : b.time}
                  </Text>
                  {isCountered && b.counterAmount ? (
                    <Text style={{ color: '#D97706', fontSize: 11, marginTop: 2, fontWeight: '700' }}>
                      {t('counter_amount')}: ${b.counterAmount}{b.counterMessage ? ` · ${b.counterMessage}` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.bidAmt}>${b.amount}</Text>

                {/* Cargo owner — pending: Reject / Counter / Accept / Open chat */}
                {c.isMine && b.status === 'pending' && !hasAccepted && (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                      style={[s.rejectBtn, rejecting === b.id && { opacity: 0.5 }]}
                      onPress={async () => {
                        setRejecting(b.id);
                        try {
                          const r = await marketAPI.rejectBid(b.id);
                          if (r.ok) {
                            toast('❌ ' + t('bid_rejected_toast'), 'success');
                            loadBids();
                          } else {
                            toast(r.detail || t('reject_failed'), 'error');
                          }
                        } catch {
                          toast(t('no_connection'), 'error');
                        }
                        setRejecting(null);
                      }}
                      disabled={!!rejecting || !!accepting}
                    >
                      <Text style={s.rejectBtnText}>{t('reject_btn')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.miniBtn, { borderColor: '#D97706' }]}
                      onPress={() => sendCounter(b)}
                    >
                      <Text style={[s.miniBtnText, { color: '#D97706' }]}>🔁 {t('counter_offer')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.miniBtn, { borderColor: '#22C55E' }]}
                      onPress={() => openChatForBid(b)}
                    >
                      <Text style={[s.miniBtnText, { color: '#22C55E' }]}>💬 {t('open_bid_chat')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.acceptBtn, accepting === b.id && { opacity: 0.5 }]}
                      onPress={async () => {
                        setAccepting(b.id);
                        try {
                          const r = await marketAPI.acceptBid(b.id);
                          if (r.ok) {
                            toast('✓ ' + t('driver_chosen'), 'success');
                            if (r.chat_room_id) setChatRoomId(r.chat_room_id);
                            if (r.deal_id) { setDealId(r.deal_id); setDealStatus('accepted'); }
                            loadBids();
                          } else {
                            toast(r.detail || t('accept_failed'), 'error');
                          }
                        } catch {
                          toast(t('no_connection'), 'error');
                        }
                        setAccepting(null);
                      }}
                      disabled={!!accepting || !!rejecting}
                    >
                      <Text style={s.acceptBtnText}>{t('accept_bid_btn')}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Cargo owner — countered: Reject / Open chat (no direct accept) */}
                {c.isMine && isCountered && (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                      style={[s.rejectBtn, rejecting === b.id && { opacity: 0.5 }]}
                      onPress={async () => {
                        setRejecting(b.id);
                        try {
                          const r = await marketAPI.rejectBid(b.id);
                          if (r.ok) { toast('❌ ' + t('bid_rejected_toast'), 'success'); loadBids(); }
                          else toast(r.detail || t('reject_failed'), 'error');
                        } catch { toast(t('no_connection'), 'error'); }
                        setRejecting(null);
                      }}
                      disabled={!!rejecting}
                    >
                      <Text style={s.rejectBtnText}>{t('reject_btn')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.miniBtn, { borderColor: '#22C55E' }]}
                      onPress={() => openChatForBid(b)}
                    >
                      <Text style={[s.miniBtnText, { color: '#22C55E' }]}>💬 {t('open_bid_chat')}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Driver — countered: Accept / Decline / Open chat */}
                {b.isMine && isCountered && (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                      style={[s.miniBtn, { borderColor: '#EF4444' }]}
                      onPress={() => declineCounter(b)}
                    >
                      <Text style={[s.miniBtnText, { color: '#EF4444' }]}>↩ {t('decline_counter')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.miniBtn, { borderColor: '#22C55E' }]}
                      onPress={() => openChatForBid(b)}
                    >
                      <Text style={[s.miniBtnText, { color: '#22C55E' }]}>💬 {t('open_bid_chat')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.acceptBtn]}
                      onPress={() => acceptCounter(b)}
                    >
                      <Text style={s.acceptBtnText}>{t('accept_counter')} ${b.counterAmount}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Driver — pending: Edit / Discount / Cancel / Open chat */}
                {b.isMine && b.status === 'pending' && !hasAccepted && (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                      style={[s.miniBtn, { borderColor: '#22C55E' }]}
                      onPress={() => {
                        setEditingBid(b);
                        setBidModalMode('edit');
                        setBidModal(true);
                      }}
                    >
                      <Text style={[s.miniBtnText, { color: '#22C55E' }]}>✏️ {t('edit_bid')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.miniBtn, { borderColor: '#F59E0B' }]}
                      onPress={() => {
                        setEditingBid(b);
                        setBidModalMode('discount');
                        setBidModal(true);
                      }}
                    >
                      <Text style={[s.miniBtnText, { color: '#F59E0B' }]}>💸 {t('give_discount')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.miniBtn, { borderColor: '#22C55E' }]}
                      onPress={() => openChatForBid(b)}
                    >
                      <Text style={[s.miniBtnText, { color: '#22C55E' }]}>💬 {t('open_bid_chat')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.miniBtn, { borderColor: '#EF4444' }, cancelling === b.id && { opacity: 0.5 }]}
                      onPress={async () => {
                        const ok = (typeof window !== 'undefined' && window.confirm)
                          ? window.confirm(t('cancel_bid_confirm'))
                          : true;
                        if (!ok) return;
                        setCancelling(b.id);
                        try {
                          const r = await marketAPI.cancelBid(b.id);
                          if (r.ok) {
                            toast('⊘ ' + t('bid_cancelled_toast'), 'success');
                            loadBids();
                          } else {
                            toast(r.detail || t('cancel_failed'), 'error');
                          }
                        } catch {
                          toast(t('no_connection'), 'error');
                        }
                        setCancelling(null);
                      }}
                      disabled={!!cancelling}
                    >
                      <Text style={[s.miniBtnText, { color: '#EF4444' }]}>⊘ {t('cancel_bid')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      {dealStatus && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[s.dealBlock, {
            borderColor: dealStatus === 'delivered' ? '#22C55E'
              : dealStatus === 'in_progress' ? '#F59E0B'
              : dealStatus === 'cancelled' ? '#EF4444'
              : '#F59E0B',
          }]}>
            <Text style={[s.dealStatusLabel, {
              color: dealStatus === 'delivered' ? '#22C55E'
                : dealStatus === 'in_progress' ? '#F59E0B'
                : dealStatus === 'cancelled' ? '#EF4444'
                : '#F59E0B',
            }]}>
              {dealStatus === 'accepted' && '🤝 ' + t('status_accepted')}
              {dealStatus === 'in_progress' && '🚛 ' + t('status_in_progress')}
              {dealStatus === 'delivered' && '✅ ' + t('status_delivered')}
              {dealStatus === 'cancelled' && '❌ ' + t('status_cancelled')}
            </Text>

            {/* Next-step hint */}
            {(dealStatus === 'accepted' || dealStatus === 'in_progress') && (
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center' }}>
                {t('order_next_step')}: {
                  isDriverSide
                    ? (dealStatus === 'accepted' ? t('driver_next_step_accepted') : t('driver_next_step_in_progress'))
                    : (dealStatus === 'accepted' ? t('shipper_next_step_accepted') : t('shipper_next_step_in_progress'))
                }
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
              {/* Driver — accepted: Start delivery */}
              {isDriverSide && dealStatus === 'accepted' && (
                <TouchableOpacity style={s.dealActionBtn} onPress={() => changeDealStatus('in_progress')} disabled={statusLoading}>
                  <Text style={s.dealActionText}>{statusLoading ? '...' : '🚛 ' + t('start_delivery')}</Text>
                </TouchableOpacity>
              )}
              {/* Driver — in_progress: I have arrived */}
              {isDriverSide && dealStatus === 'in_progress' && (
                <TouchableOpacity style={[s.dealActionBtn, { backgroundColor: '#22C55E' }]} onPress={() => changeDealStatus('delivered')} disabled={statusLoading}>
                  <Text style={s.dealActionText}>{statusLoading ? '...' : '✅ ' + t('mark_arrived')}</Text>
                </TouchableOpacity>
              )}
              {/* Shipper — in_progress: Confirm delivery */}
              {isShipper && dealStatus === 'in_progress' && (
                <TouchableOpacity style={[s.dealActionBtn, { backgroundColor: '#22C55E' }]} onPress={() => changeDealStatus('delivered')} disabled={statusLoading}>
                  <Text style={s.dealActionText}>{statusLoading ? '...' : '✅ ' + t('confirm_delivery')}</Text>
                </TouchableOpacity>
              )}
              {/* Both — chat */}
              {chatRoomId && (
                <TouchableOpacity
                  style={[s.dealActionBtn, { backgroundColor: '#22C55E' }]}
                  onPress={() => navigation.navigate('Chat', { roomId: chatRoomId, role })}
                >
                  <Text style={s.dealActionText}>💬 {t('order_chat')}</Text>
                </TouchableOpacity>
              )}
              {/* Both — cancel deal */}
              {(dealStatus === 'accepted' || dealStatus === 'in_progress') && (
                <TouchableOpacity
                  style={[s.dealActionBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444' }]}
                  disabled={statusLoading}
                  onPress={async () => {
                    const ok = (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm)
                      ? window.confirm(t('cancel_deal_confirm'))
                      : true;
                    if (!ok) return;
                    changeDealStatus('cancelled');
                  }}
                >
                  <Text style={[s.dealActionText, { color: '#EF4444' }]}>⊘ {t('cancel_deal')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}
      {dealStatus === 'delivered' && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[s.paymentBlock, { backgroundColor: theme.card, borderColor: '#F59E0B' }]}>
            <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '700' }}>💰 Ожидается оплата</Text>
            <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>Договоритесь об оплате в чате. Наличные, перевод или по договору.</Text>
          </View>
        </View>
      )}
      {dealStatus === 'delivered' && !reviewSent && (isShipper ? acceptedDriverId : shipperId) && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[s.reviewBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.reviewTitle, { color: theme.text }]}>{isShipper ? t('rate_driver') : t('rate_shipper')}</Text>
            <View style={s.starsRow}>
              {[1,2,3,4,5].map(n => (
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
              style={[s.reviewSubmitBtn, reviewRating === 0 && { opacity: 0.4 }]}
              disabled={reviewRating === 0 || reviewLoading}
              onPress={async () => {
                setReviewLoading(true);
                try {
                  await reviewsAPI.create({
                    targetId: isShipper ? acceptedDriverId : shipperId,
                    // Backend reviews API accepts only 'driver' | 'client' (Pydantic pattern).
                    // Driver leaves review on the cargo owner — that's role 'client' on the server.
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
              <Text style={s.reviewSubmitText}>{reviewLoading ? '...' : t('submit_rating')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {dealStatus === 'delivered' && reviewSent && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center' }}>
          <Text style={{ color: '#22C55E', fontSize: 14, fontWeight: '600' }}>✓ Спасибо за оценку!</Text>
        </View>
      )}
      {/* Legacy "Open chat with driver" button removed: deal-block above
          already renders a single chat CTA ("Чат по заказу") for both sides
          to avoid duplicate buttons. */}
      {c.isMine && !chatRoomId && (
        <View style={{ padding: 16, paddingTop: 0 }}>
          <TouchableOpacity style={s.deleteMyBtn} onPress={onDeleteCargo}>
            <Text style={s.deleteMyBtnText}>🗑 {t('delete_cargo')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Sticky CTA — pinned bottom row.
          - non-owner with no accepted bid yet: «Откликнуться» + «Чат» (если room уже создан).
          - owner / accepted: bar скрывается, обычные блоки detail дают нужные действия. */}
      {!c.isMine && !dealStatus ? (
        <StickyCTABar
          accent={v1Accent.main}
          primary={{
            label: t('suggestPrice'),
            onPress: async () => {
              const ok = await requireLevel(LEVELS.PHONE, 'bid');
              if (ok) setBidModal(true);
            },
            testID: 'cargo-sticky-bid',
          }}
          secondary={chatRoomId ? {
            label: '💬 ' + t('order_chat'),
            onPress: () => navigation.navigate('Chat', { roomId: chatRoomId, role }),
            testID: 'cargo-sticky-chat',
          } : null}
        />
      ) : null}
      <BidModal
        visible={bidModal}
        onClose={() => { setBidModal(false); setBidModalMode('create'); setEditingBid(null); }}
        onSubmit={handleBid}
        mode={bidModalMode}
        currentPrice={c.price}
        currency={c.currency}
        cargoId={c.id}
        bidId={editingBid?.id}
        initialAmount={editingBid?.amount}
        initialMessage={editingBid?.message}
      />
      <ShareModal
        visible={shareModal}
        onClose={() => setShareModal(false)}
        shareText={buildCargoShareText(c, `${WEB_URL || 'https://urtruck.kz'}/cargo/${c.id}`)}
        url={`${WEB_URL || 'https://urtruck.kz'}/cargo/${c.id}`}
      />
      {Gate}
    </SafeAreaView>
  );
}

