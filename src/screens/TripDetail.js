import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import RouteMap from '../components/RouteMap';
import GradientText from '../components/GradientText';
import ShareModal from '../components/ShareModal';
import { routeStats } from '../utils/geo';
import { removeTrip, advanceTripState, TRIP_STATES, TRIP_STATE_INFO } from '../utils/store';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS, useAuth } from '../utils/AuthContext';
import RatingModal from '../components/RatingModal';
import { marketAPI } from '../utils/marketAPI';

export default function TripDetail({ navigation, route }) {
  const { trip, tripId, role, dealId: routeDealId } = route.params || {};
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const { session } = useAuth();
  const myUserId = session?.user?.id;
  const [shareModal, setShareModal] = React.useState(false);
  const [rateModal, setRateModal] = React.useState(false);
  // Deal-block state (mirrors CargoDetail)
  const [dealId, setDealId] = React.useState(routeDealId || null);
  const [dealStatus, setDealStatus] = React.useState(null);
  const [chatRoomId, setChatRoomId] = React.useState(null);
  const [shipperId, setShipperId] = React.useState(null);
  const [driverId, setDriverId] = React.useState(null);
  const [statusLoading, setStatusLoading] = React.useState(false);

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

  // Pull deal once on mount when navigated from MyTripsScreen → Orders.
  // Without this the deal-block stays empty after re-open.
  React.useEffect(() => {
    const tid = (trip && trip.id) || tripId;
    if (!tid) return;
    if (routeDealId) {
      marketAPI.getDeal(routeDealId).then(d => { if (d && d.ok !== false) applyDeal(d); }).catch(() => {});
    } else {
      marketAPI.myDashboard().then(d => {
        const found = (d?.my_deals || []).find(x => x.trip_id === tid);
        if (found) applyDeal(found);
      }).catch(() => {});
    }
  }, [trip && trip.id, tripId, routeDealId]);

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
  if (!trip) {
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
          <GradientText style={s.title} colors={['#22C55E', '#0891B2']}>🚛 {t('trip_title')}</GradientText>
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
            : dealStatus === 'in_progress' ? '#3B82F6'
            : dealStatus === 'cancelled' ? '#EF4444'
            : '#F59E0B',
          borderWidth: 2,
        }]}>
          <Text style={[s.sectionTitle, {
            color: dealStatus === 'delivered' ? '#22C55E'
              : dealStatus === 'in_progress' ? '#3B82F6'
              : dealStatus === 'cancelled' ? '#EF4444'
              : '#F59E0B',
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
              <TouchableOpacity style={[s.dealActionBtn, { backgroundColor: '#3B82F6' }]} onPress={() => changeDealStatus('in_progress')} disabled={statusLoading}>
                <Text style={s.dealActionText}>{statusLoading ? '...' : '🚛 ' + t('start_delivery')}</Text>
              </TouchableOpacity>
            )}
            {isDriverSide && dealStatus === 'in_progress' && (
              <TouchableOpacity style={[s.dealActionBtn, { backgroundColor: '#22C55E' }]} onPress={() => changeDealStatus('delivered')} disabled={statusLoading}>
                <Text style={s.dealActionText}>{statusLoading ? '...' : '✅ ' + t('mark_arrived')}</Text>
              </TouchableOpacity>
            )}
            {isShipper && dealStatus === 'in_progress' && (
              <TouchableOpacity style={[s.dealActionBtn, { backgroundColor: '#22C55E' }]} onPress={() => changeDealStatus('delivered')} disabled={statusLoading}>
                <Text style={s.dealActionText}>{statusLoading ? '...' : '✅ ' + t('confirm_delivery')}</Text>
              </TouchableOpacity>
            )}
            {chatRoomId && (
              <TouchableOpacity
                style={[s.dealActionBtn, { backgroundColor: '#3B82F6' }]}
                onPress={() => navigation.navigate('Chat', { roomId: chatRoomId, role })}
              >
                <Text style={s.dealActionText}>💬 {t('order_chat')}</Text>
              </TouchableOpacity>
            )}
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
    );
  }

  const accent = role === 'driver' ? '#2563EB' : '#F59E0B';
  const stats = routeStats(trip.from, trip.to, trip.transit);

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

  const isOwner = trip.driverName === 'Вы' || trip.driverName === 'You';

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <GradientText style={s.title} colors={['#22C55E', '#0891B2']}>🚛 {t('trip_title')}</GradientText>
        <TouchableOpacity onPress={() => setShareModal(true)}>
          <Text style={{ fontSize: 20 }}>↗️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}>
        {/* Маршрут на карте */}
        <RouteMap from={trip.from} to={trip.to} transit={trip.transit} height={180} />

        {/* Информация о рейсе */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{t('trip_route').toUpperCase()}</Text>
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
            <Text style={[s.city, { color: theme.text }]}>{trip.from}</Text>
          </View>
          {trip.transit && (
            <View style={s.routeRow}>
              <View style={[s.dot, { backgroundColor: '#2563EB' }]} />
              <Text style={[s.transitCity, { color: theme.textSecondary }]}>{t('trip_via')} {trip.transit}</Text>
            </View>
          )}
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: '#22C55E' }]} />
            <Text style={[s.city, { color: theme.text }]}>{trip.to}</Text>
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
        </View>

        {/* Даты */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{t('trip_dates').toUpperCase()}</Text>
          <View style={s.dateRow}>
            <Text style={[s.dateLabel, { color: theme.textMuted }]}>🚀 {t('trip_dep')}</Text>
            <Text style={[s.dateValue, { color: theme.text }]}>{trip.departure || '—'}</Text>
          </View>
          <View style={s.dateRow}>
            <Text style={[s.dateLabel, { color: theme.textMuted }]}>🏁 {t('trip_arr')}</Text>
            <Text style={[s.dateValue, { color: theme.text }]}>{trip.arrival || '—'}</Text>
          </View>
        </View>

        {/* Транспорт */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{t('trip_transport').toUpperCase()}</Text>
          <View style={s.dateRow}>
            <Text style={[s.dateLabel, { color: theme.textMuted }]}>{t('trip_truck_body')}</Text>
            <Text style={[s.dateValue, { color: theme.text }]}>{trip.truckType ? (t(trip.truckType) !== trip.truckType ? t(trip.truckType) : trip.truckType) : '—'}</Text>
          </View>
          <View style={s.dateRow}>
            <Text style={[s.dateLabel, { color: theme.textMuted }]}>{t('trip_driver')}</Text>
            <Text style={[s.dateValue, { color: theme.text }]}>{trip.driverName || '—'}</Text>
          </View>
          {trip.available_volume_m3 && (
            <View style={s.dateRow}>
              <Text style={[s.dateLabel, { color: theme.textMuted }]}>{t('trip_free')}</Text>
              <Text style={[s.dateValue, { color: theme.text }]}>{trip.available_volume_m3} м³</Text>
            </View>
          )}
        </View>

        {/* Timeline статусов */}
        <View style={[{ backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 12 }]}>📍 {t('trip_status')}</Text>
          {TRIP_STATES.map((st, i) => {
            const info = TRIP_STATE_INFO[st];
            const currentIdx = TRIP_STATES.indexOf(trip.trip_state || 'planned');
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
        </View>

        {/* Кнопки */}
        {role === 'client' ? (
          <>
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: accent }]}
              onPress={async () => {
                const ok = await requireLevel(LEVELS.PHONE, 'contact');
                if (!ok) return;
                toast('💬 ' + t('chat_opened_toast'), 'success');
                navigation.navigate('Chat', { partner: { name: trip.driverName, country: trip.country || 'KZ' }, role });
              }}
            >
              <Text style={s.primaryBtnText}>💬 {t('write_driver')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.secondaryBtn, { borderColor: accent }]}
              onPress={async () => {
                const ok = await requireLevel(LEVELS.PHONE, 'bid');
                if (!ok) return;
                setRateModal(true);
              }}
            >
              <Text style={[s.secondaryBtnText, { color: accent }]}>⭐ {t('leave_review')}</Text>
            </TouchableOpacity>
          </>
        ) : isOwner ? (
          <TouchableOpacity style={[s.dangerBtn, { borderColor: '#EF4444' }]} onPress={onDelete}>
            <Text style={s.dangerBtnText}>🗑 {t('trip_delete')}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {dealStatus ? renderDealBlock() : null}

      <ShareModal visible={shareModal} onClose={() => setShareModal(false)} shareText={`UrTruck рейс: ${trip.from} → ${trip.to}`} driverId={trip.id} />
      <RatingModal
        visible={rateModal}
        onClose={() => setRateModal(false)}
        targetId={trip.driverId || trip.id}
        targetRole="driver"
        targetName={trip.driverName}
        tripId={trip.id}
      />
      {Gate}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  title: { flex: 1, fontSize: 20, fontWeight: '900' },
  section: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' },
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
  secondaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8, borderWidth: 1.5 },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dangerBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  dangerBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '800' },
  dealActionBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  dealActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
