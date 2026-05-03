import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { marketAPI } from '../utils/marketAPI';
import { formatStatus, formatTruckType, formatBids } from '../utils/i18n';
import { formatDateForDisplay } from '../utils/dateInput';
import EmptyState from '../components/ui/EmptyState';
import BidModal from '../components/BidModal';
import { colors, spacing, radius, typography } from '../theme/theme';

export default function MyTripsScreen({ navigation, route }) {
  const { role } = route.params || {};
  const isDriver = role === 'driver';
  const accent = isDriver ? '#3B82F6' : '#F59E0B';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();

  const initialTab = route.params?.initialTab || 'my';
  const justCreatedTrip = route.params?.justCreatedTrip || null;
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!justCreatedTrip);
  const [bidModal, setBidModal] = useState(false);
  const [bidModalMode, setBidModalMode] = useState('edit');
  const [editingBid, setEditingBid] = useState(null);
  const [busyBidId, setBusyBidId] = useState(null);

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
          setData({ my_trips: trips.trips || [], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [], authRequired: true });
        } else {
          setData({ my_trips: [], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [], authRequired: true });
        }
      } else {
        let d = await marketAPI.myDashboard();
        if (d.serverError && isDriver) {
          try { const trips = await marketAPI.listTrips({}); d = { ...d, my_trips: (trips.trips || []) }; } catch {}
        }
        setData(d);
      }
    } catch (e) { console.warn('[MyTrips] load error:', e.message); }
    setLoading(false);
  };

  useEffect(() => {
    if (justCreatedTrip) {
      setData({ my_trips: [justCreatedTrip], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [] });
      setLoading(false);
    } else {
      load();
    }
  }, []);

  let myItems = isDriver ? (data?.my_trips || []) : (data?.my_cargos || []);
  if (justCreatedTrip && isDriver && !myItems.find(i => i.id === justCreatedTrip.id)) {
    myItems = [justCreatedTrip, ...myItems];
  }
  const myBids = isDriver ? (data?.my_bids || []) : (data?.incoming_bids || []);
  const myDeals = data?.my_deals || [];

  // ─── Cards ───

  const renderMyItem = ({ item }) => {
    const from = item.from_city || '—';
    const to = item.to_city || '—';
    const desc = item.cargo_desc || '';
    const isCargo = !!item.cargo_desc;
    const badge = isCargo ? t('badge_cargo') : t('badge_trip');
    const badgeColor = isCargo ? '#F59E0B' : '#3B82F6';

    return (
      <TouchableOpacity
        testID={isCargo ? 'my-cargo-card' : 'my-trip-card'}
        style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => {
          if (isCargo) navigation.navigate('CargoDetail', { cargo: { ...item, from, to, cargo: desc, _server: true }, cargoId: item.id, role });
        }}
      >
        <View style={s.cardTop}>
          <View style={[s.badge, { backgroundColor: badgeColor + '20' }]}>
            <Text style={[s.badgeText, { color: badgeColor }]}>{badge}</Text>
          </View>
          <Text style={[s.statusLabel, { color: '#22C55E' }]}>{formatStatus(item.status || 'active')}</Text>
        </View>
        <Text style={[s.route, { color: theme.text }]}>{from} → {to}</Text>
        {desc ? <Text style={[s.desc, { color: theme.textMuted }]} numberOfLines={1}>{desc}</Text> : null}
        <View style={s.cardMeta}>
          <Text style={[s.metaItem, { color: theme.textDim }]}>{formatTruckType(item.truck_type || item.cargo_type)}</Text>
          <Text style={s.metaDot}>·</Text>
          <Text style={[s.metaItem, { color: theme.textDim }]}>{formatDateForDisplay(item.departure || item.created_at)}</Text>
        </View>
        <View style={s.cardBottom}>
          <Text style={s.price}>{(item.price || 0) > 0 ? `$${item.price}` : t('negotiable')}</Text>
          {item.bids_count > 0 && <Text style={[s.bidsLabel, { color: theme.textMuted }]}>{formatBids(item.bids_count)}</Text>}
        </View>
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
    const sc = { accepted: '#22C55E', in_progress: '#3B82F6', delivered: '#22C55E', cancelled: '#EF4444' };
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
          <View style={[s.badge, { backgroundColor: '#22C55E20' }]}>
            <Text style={[s.badgeText, { color: '#22C55E' }]}>{t('order_label')}</Text>
          </View>
          <Text style={[s.statusLabel, { color: sc[item.status] || '#78716C' }]}>{formatStatus(item.status)}</Text>
        </View>
        <Text style={[s.route, { color: theme.text }]}>{item.from_city} → {item.to_city}</Text>
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
              style={[s.acceptBtn, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={() => setDealStatusOnServer(item, 'delivered')}
            >
              <Text style={s.acceptBtnText}>✅ {t('confirm_delivery')}</Text>
            </TouchableOpacity>
          )}
          {(item.status === 'accepted' || item.status === 'in_progress') && (
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
              style={[s.miniBtn, { borderColor: '#3B82F6' }]}
              onPress={() => navigation.navigate('Chat', { roomId: item.chat_room_id, role })}
            >
              <Text style={[s.miniBtnText, { color: '#3B82F6' }]}>💬 {t('order_chat')}</Text>
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
              style={[s.miniBtn, { borderColor: '#3B82F6' }]}
              onPress={() => openChatForBid(item)}
            >
              <Text style={[s.miniBtnText, { color: '#3B82F6' }]}>💬 {t('open_bid_chat')}</Text>
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
              style={[s.miniBtn, { borderColor: '#3B82F6' }]}
              onPress={() => openChatForBid(item)}
            >
              <Text style={[s.miniBtnText, { color: '#3B82F6' }]}>💬 {t('open_bid_chat')}</Text>
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
              style={[s.miniBtn, { borderColor: '#3B82F6' }]}
              onPress={() => openChatForBid(item)}
            >
              <Text style={[s.miniBtnText, { color: '#3B82F6' }]}>💬 {t('open_bid_chat')}</Text>
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
              style={[s.miniBtn, { borderColor: '#3B82F6' }]}
              onPress={() => { setEditingBid(item); setBidModalMode('edit'); setBidModal(true); }}
            >
              <Text style={[s.miniBtnText, { color: '#3B82F6' }]}>✏️ {t('edit_bid')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#F59E0B' }]}
              onPress={() => { setEditingBid(item); setBidModalMode('discount'); setBidModal(true); }}
            >
              <Text style={[s.miniBtnText, { color: '#F59E0B' }]}>💸 {t('give_discount')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.miniBtn, { borderColor: '#3B82F6' }]}
              onPress={() => openChatForBid(item)}
            >
              <Text style={[s.miniBtnText, { color: '#3B82F6' }]}>💬 {t('open_bid_chat')}</Text>
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

  const TABS = [
    { key: 'my', label: isDriver ? t('my_trips_tab') : t('my_cargos_tab'), testID: 'my-work-tab-my' },
    { key: 'bids', label: isDriver ? t('my_bids_tab') : t('responses_tab'), testID: 'my-work-tab-bids' },
    { key: 'deals', label: t('orders_tab'), testID: 'my-work-tab-orders' },
  ];

  return (
    <SafeAreaView testID="my-work-screen" style={[{ flex: 1, backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={[s.headerTitle, { color: theme.text }]}>{t('my_work')}</Text>
          <Text style={[s.headerSub, { color: theme.textMuted }]}>{isDriver ? t('my_work_sub_driver') : t('my_work_sub_client')}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <View style={[s.tabs, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {TABS.map(tb => (
          <TouchableOpacity
            key={tb.key}
            testID={tb.testID}
            style={[s.tab, { borderColor: theme.border }, tab === tb.key && { backgroundColor: tb.key === 'deals' ? '#22C55E' : accent, borderColor: 'transparent' }]}
            onPress={() => setTab(tb.key)}
          >
            <Text style={[s.tabText, { color: tab === tb.key ? '#FFF' : theme.textMuted }]}>{tb.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={tab === 'deals' ? myDeals : tab === 'my' ? myItems : myBids}
        keyExtractor={i => i.id}
        renderItem={tab === 'deals' ? renderDeal : tab === 'my' ? renderMyItem : renderBid}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          data?.authRequired ? (
            <EmptyState title={t('gate_login')} description={t('gate_login_desc')} actionLabel={t('gate_enter')} onAction={() => navigation.navigate('Role')} />
          ) : tab === 'my' ? (
            <EmptyState
              title={isDriver ? t('no_trips_yet') : t('no_cargos_yet')}
              description={isDriver ? t('no_trips_desc') : t('no_cargos_desc')}
              actionLabel={isDriver ? t('publish_route') : t('place_cargo')}
              onAction={() => navigation.navigate('Feed', { role })}
            />
          ) : tab === 'bids' ? (
            <EmptyState
              title={isDriver ? t('no_bids_yet_driver') : t('no_responses_yet')}
              description={isDriver ? t('no_bids_desc') : t('no_responses_desc')}
              actionLabel={isDriver ? t('find_cargos') : t('place_cargo')}
              onAction={() => navigation.navigate('Feed', { role })}
            />
          ) : (
            <EmptyState
              title={t('no_orders_yet')}
              description={isDriver ? t('no_orders_desc_driver') : t('no_orders_desc_client')}
            />
          )
        }
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, fontWeight: '300' },
  headerTitle: { ...typography.h2, textAlign: 'center' },
  headerSub: { ...typography.caption, textAlign: 'center', marginTop: 2 },

  tabs: { flexDirection: 'row', marginHorizontal: spacing.lg, borderRadius: radius.sm, padding: 3, marginBottom: spacing.md, borderWidth: 1 },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: 7, alignItems: 'center', borderWidth: 1 },
  tabText: { ...typography.caption, fontWeight: '700' },

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

  chatBtn: { backgroundColor: '#3B82F6', borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  chatBtnText: { color: '#FFF', ...typography.title },
  acceptBtn: { backgroundColor: '#22C55E', borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  acceptBtnText: { color: '#FFF', ...typography.title },
  rejectBtn: { borderWidth: 1, borderColor: '#EF4444', borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
  rejectBtnText: { color: '#EF4444', ...typography.title },
  miniBtn: { borderWidth: 1, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10 },
  miniBtnText: { fontSize: 11, fontWeight: '700' },
});
