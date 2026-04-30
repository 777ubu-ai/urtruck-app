import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import RouteMap from '../components/RouteMap';
import { startTracking, stopTracking, getTracking, subscribe, addNotification, getTrips, requestTracking, respondTracking, stopTrackingPermission } from '../utils/store';
import { parseCity, routeStats, isNearBorder } from '../utils/geo';

export default function TrackScreen({ navigation, route }) {
  const { role } = route.params || {};
  const isDriver = role === 'driver';
  const accent = isDriver ? '#2563EB' : '#F59E0B';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const [currentStatus, setCurrentStatus] = useState(1);
  const [tracking, setTracking] = useState(getTracking());
  const [trip, setTrip] = useState(getTrips()[0]);

  useEffect(() => {
    const unsub = subscribe(() => {
      const tr = getTracking();
      setTracking(tr);
      setTrip(getTrips()[0]);
      // Авто-статусы по геозонам
      if (tr && tr.currentCoord) {
        const border = isNearBorder(tr.currentCoord[0], tr.currentCoord[1]);
        if (border && currentStatus < 3) {
          setCurrentStatus(3);
          toast(`🛃 ${border} · граница близко`, 'warn', 4000);
          addNotification({ type: 'status', icon: '🛃', title: 'Граница', text: `Подъезжаете к ${border}` });
        }
        if (tr.progress >= 0.95 && currentStatus < 5) {
          setCurrentStatus(5);
          toast('🏭 Прибыл к точке выгрузки', 'success');
        }
      }
    });
    return () => unsub();
  }, [currentStatus]);

  const fromName = 'Москва';
  const toName = 'Иу';
  const transitName = 'Алматы';
  const stats = routeStats(fromName, toName, transitName);

  const onStartTracking = () => {
    const f = parseCity(fromName), tc = parseCity(toName), tr = parseCity(transitName);
    if (f && tc) {
      startTracking('demo', f, tc, tr);
      toast('📍 GPS-трекинг включён · обновление каждые 5с', 'success', 4000);
    }
  };

  const onStopTracking = () => {
    stopTracking();
    toast('📍 GPS-трекинг остановлен', 'info');
  };
  const [rated, setRated] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const STATUSES = [
    { key: 'dep', label: t('st1'), icon: '🚛' },
    { key: 'load', label: t('st2'), icon: '📦' },
    { key: 'queue', label: t('st3'), icon: '🚧' },
    { key: 'check', label: t('st4'), icon: '🔍' },
    { key: 'out', label: t('st5'), icon: '✅' },
    { key: 'unload', label: t('st6'), icon: '🏭' },
  ];

  const updateStatus = () => {
    if (currentStatus < STATUSES.length - 1) {
      const next = STATUSES[currentStatus + 1];
      setCurrentStatus(prev => prev + 1);
      toast(`${next.icon} ${next.label}`, 'success');
    }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={[s.title, { color: theme.text }]}>{t('myTrips')}</Text>
        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Универсальный маршрут с транзитом */}
          <View style={s.routeRow}>
            <Text style={[s.routeCity, { color: theme.text }]}>Москва, 🇷🇺</Text>
            <View style={s.statusBadge}><Text style={s.statusBadgeText}>{currentStatus >= STATUSES.length - 1 ? t('completed') : t('inTransit')}</Text></View>
          </View>
          <View style={s.routePath}>
            <Text style={[s.pathArrow, { color: theme.textMuted }]}>↓</Text>
            <Text style={[s.transitCity, { color: theme.textSecondary }]}>{t('through')}: Алматы, 🇰🇿</Text>
            <Text style={[s.pathArrow, { color: theme.textMuted }]}>↓</Text>
            <Text style={[s.routeCity, { color: theme.text }]}>Иу, 🇨🇳</Text>
          </View>
          <View style={[s.dateRow, { borderTopColor: theme.border }]}>
            <Text style={[s.dateLabel, { color: theme.textMuted }]}>🚀 {t('departure')}: 15.04.2026</Text>
            <Text style={[s.dateLabel, { color: theme.textMuted }]}>🏁 {t('arrival')}: 25.04.2026</Text>
          </View>
          {/* Карта показывается только если tracking_allowed === true */}
          {trip?.tracking_allowed ? (
            <>
              <RouteMap
                from={fromName}
                to={toName}
                transit={transitName}
                liveCoord={tracking?.isActive ? tracking.currentCoord : null}
                height={200}
              />
              <View style={s.routeStatsRow}>
                <View style={[s.statBadge, { backgroundColor: theme.border }]}>
                  <Text style={[s.statBadgeText, { color: theme.text }]}>📏 {stats?.km || '—'} км</Text>
                </View>
                <View style={[s.statBadge, { backgroundColor: theme.border }]}>
                  <Text style={[s.statBadgeText, { color: theme.text }]}>⏱ ~{stats?.days || '—'} дн.</Text>
                </View>
                {tracking?.isActive && (
                  <View style={[s.statBadge, { backgroundColor: '#22C55E20' }]}>
                    <Text style={[s.statBadgeText, { color: '#22C55E' }]}>🚛 GPS · {Math.round(tracking.progress * 100)}%</Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            // Без согласия — закрытый блок
            <View style={[s.lockedMap, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={{ fontSize: 36 }}>🔒</Text>
              <Text style={[s.lockedTitle, { color: theme.text }]}>Карта недоступна</Text>
              <Text style={[s.lockedDesc, { color: theme.textMuted }]}>
                {isDriver
                  ? 'Карта станет доступной после вашего согласия на трекинг'
                  : trip?.tracking_request === 'pending'
                    ? 'Запрос отправлен · ждём ответа водителя'
                    : trip?.tracking_request === 'denied'
                      ? 'Водитель отклонил трекинг'
                      : 'Запросите у водителя согласие на отслеживание'}
              </Text>
              <View style={s.routeStatsRow}>
                <View style={[s.statBadge, { backgroundColor: theme.border }]}>
                  <Text style={[s.statBadgeText, { color: theme.text }]}>📏 {stats?.km || '—'} км</Text>
                </View>
                <View style={[s.statBadge, { backgroundColor: theme.border }]}>
                  <Text style={[s.statBadgeText, { color: theme.text }]}>⏱ ~{stats?.days || '—'} дн.</Text>
                </View>
              </View>
            </View>
          )}

          <Text style={[s.mapText, { color: theme.textMuted, marginBottom: 12 }]}>📍 {STATUSES[currentStatus].label}</Text>

          {/* Кнопки согласия — для клиента */}
          {!isDriver && !trip?.tracking_allowed && trip?.tracking_request !== 'pending' && (
            <TouchableOpacity
              style={[s.gpsBtn, { backgroundColor: accent }]}
              onPress={() => { requestTracking(trip.id, 'client'); toast('📍 Запрос отправлен водителю', 'info'); }}
            >
              <Text style={s.gpsBtnText}>📍 Запросить отслеживание</Text>
            </TouchableOpacity>
          )}
          {!isDriver && trip?.tracking_request === 'pending' && (
            <View style={[s.pendingBox, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' }]}>
              <Text style={s.pendingText}>⏳ Ждём ответа от водителя...</Text>
            </View>
          )}

          {/* Кнопки согласия — для водителя */}
          {isDriver && trip?.tracking_request === 'pending' && (
            <View style={[s.permissionBox, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' }]}>
              <Text style={[s.permissionTitle, { color: '#F59E0B' }]}>📍 Запрос на трекинг</Text>
              <Text style={[s.permissionDesc, { color: theme.textSecondary }]}>
                Клиент просит включить GPS-трекинг. Разрешить отслеживание вашего местоположения?
              </Text>
              <View style={s.permissionRow}>
                <TouchableOpacity
                  style={[s.permBtn, { backgroundColor: '#EF4444' }]}
                  onPress={() => { respondTracking(trip.id, false); toast('❌ Трекинг отклонён', 'info'); }}
                >
                  <Text style={s.permBtnText}>❌ Отклонить</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.permBtn, { backgroundColor: '#22C55E' }]}
                  onPress={() => { respondTracking(trip.id, true); toast('✅ Трекинг разрешён', 'success'); }}
                >
                  <Text style={s.permBtnText}>✅ Разрешить</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Управление GPS — водитель */}
          {isDriver && trip?.tracking_allowed && (
            <>
              {tracking?.isActive ? (
                <TouchableOpacity style={[s.gpsBtn, { backgroundColor: '#EF4444' }]} onPress={onStopTracking}>
                  <Text style={s.gpsBtnText}>🛑 Остановить GPS-трекинг</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.gpsBtn, { backgroundColor: '#22C55E' }]} onPress={onStartTracking}>
                  <Text style={s.gpsBtnText}>📍 Включить GPS</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.gpsBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444', marginTop: 6 }]}
                onPress={() => { stopTracking(); stopTrackingPermission(trip.id); toast('🔒 Отслеживание выключено', 'info'); }}
              >
                <Text style={[s.gpsBtnText, { color: '#EF4444' }]}>🔒 Полностью выключить отслеживание</Text>
              </TouchableOpacity>
            </>
          )}
          {isDriver && <View style={s.infoBox}>
            <Text style={[s.infoText, { color: theme.textMuted }]}>💡 {t('whoFills')}</Text>
          </View>}
          <View style={s.timeline}>
            {STATUSES.map((status, i) => (
              <View key={status.key} style={s.timelineItem}>
                <View style={s.timelineLeft}>
                  <View style={[s.timelineDot, { backgroundColor: i <= currentStatus ? accent : theme.border }]}>
                    {i < currentStatus && <Text style={s.checkmark}>✓</Text>}
                    {i === currentStatus && <View style={s.activeDot} />}
                  </View>
                  {i < STATUSES.length - 1 && <View style={[s.timelineLine, { backgroundColor: i < currentStatus ? accent : theme.border }]} />}
                </View>
                <View style={s.timelineContent}>
                  <Text style={{ fontSize: 16, marginRight: 6 }}>{status.icon}</Text>
                  <View>
                    <Text style={[s.timelineLabel, { color: i <= currentStatus ? theme.text : theme.textMuted, fontWeight: i === currentStatus ? '700' : '400' }]}>{status.label}</Text>
                    {i === currentStatus && <Text style={[s.currentTag, { color: accent }]}>{t('current')}</Text>}
                  </View>
                </View>
              </View>
            ))}
          </View>
          {isDriver && currentStatus < STATUSES.length - 1 && (
            <TouchableOpacity style={[s.updateBtn, { backgroundColor: accent }]} onPress={updateStatus}>
              <Text style={s.updateBtnText}>{STATUSES[currentStatus + 1].icon} {t('update')}: {STATUSES[currentStatus + 1].label}</Text>
            </TouchableOpacity>
          )}
          {currentStatus === STATUSES.length - 1 && trip?.deal_id && trip?.status === 'delivered' && (
            <View style={s.doneBlock}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>🎉</Text>
              <Text style={s.doneTitle}>{t('tripDone')}</Text>
              {!reviewSubmitted ? (
                <>
                  <View style={s.starsRow}>
                    {[1,2,3,4,5].map(n => (
                      <TouchableOpacity key={n} style={[s.starBtn, n <= rated && s.starBtnActive]} onPress={() => setRated(n)}>
                        <Text style={{ fontSize: 20 }}>{n <= rated ? '★' : '☆'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={s.reviewInput}
                    placeholder={t('leaveReview')}
                    placeholderTextColor="#57534E"
                    value={reviewText}
                    onChangeText={setReviewText}
                    multiline
                  />
                  <TouchableOpacity
                    style={[s.sendReviewBtn, rated === 0 && { opacity: 0.4 }]}
                    disabled={rated === 0}
                    onPress={() => {
                      setReviewSubmitted(true);
                      toast(`★${rated} · ${t('reviewSent')}`, 'success');
                    }}
                  >
                    <Text style={s.sendReviewText}>{t('sendReview')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={s.submittedText}>✓ {t('reviewSent')}</Text>
                  <TouchableOpacity style={[s.viewAllBtn, { borderColor: accent }]} onPress={() => navigation.navigate('Reviews', { role })}>
                    <Text style={[s.viewAllText, { color: accent }]}>{t('allReviews')} →</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontWeight: '900', marginBottom: 14 },
  card: { borderRadius: 18, padding: 20, borderWidth: 1 },
  routeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  routeCity: { fontSize: 17, fontWeight: '800' },
  routePath: { alignItems: 'flex-start', marginBottom: 10 },
  pathArrow: { fontSize: 14, marginVertical: 1 },
  transitCity: { fontSize: 12, fontStyle: 'italic', marginVertical: 2 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, marginBottom: 10 },
  dateLabel: { fontSize: 11, fontWeight: '500' },
  infoBox: { backgroundColor: '#2563EB15', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#2563EB30' },
  infoText: { fontSize: 11, lineHeight: 16 },
  arrow: {},
  statusBadge: { marginLeft: 'auto', backgroundColor: '#22C55E15', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  statusBadgeText: { color: '#22C55E', fontSize: 10, fontWeight: '700' },
  mapPlaceholder: { borderRadius: 12, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  mapText: { fontSize: 12 },
  timeline: { marginBottom: 8 },
  timelineItem: { flexDirection: 'row', minHeight: 46 },
  timelineLeft: { width: 28, alignItems: 'center' },
  timelineDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timelineLine: { width: 2, flex: 1, marginVertical: 2 },
  checkmark: { color: '#fff', fontSize: 10, fontWeight: '700' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  timelineContent: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 8, paddingBottom: 12 },
  timelineLabel: { fontSize: 13 },
  currentTag: { fontSize: 10, marginTop: 1 },
  updateBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  updateBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  doneBlock: { backgroundColor: '#052E16', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#14532D', marginTop: 14, alignItems: 'center' },
  doneTitle: { color: '#22C55E', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  starBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#0a0f1a', borderWidth: 1, borderColor: '#14532D', alignItems: 'center', justifyContent: 'center' },
  starBtnActive: { backgroundColor: '#FBBF2420', borderColor: '#FBBF24' },
  reviewInput: { width: '100%', backgroundColor: '#0a0f1a', borderRadius: 12, padding: 14, color: '#FAFAF9', fontSize: 13, borderWidth: 1, borderColor: '#14532D', minHeight: 60 },
  sendReviewBtn: { width: '100%', backgroundColor: '#22C55E', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  sendReviewText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  submittedText: { color: '#22C55E', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  viewAllBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1 },
  viewAllText: { fontSize: 13, fontWeight: '700' },
  routeStatsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  statBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  statBadgeText: { fontSize: 11, fontWeight: '700' },
  gpsBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4, marginBottom: 8 },
  gpsBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  lockedMap: { borderRadius: 14, padding: 24, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', gap: 6, marginBottom: 12 },
  lockedTitle: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  lockedDesc: { fontSize: 11, textAlign: 'center', lineHeight: 16, marginBottom: 8 },
  permissionBox: { borderRadius: 14, padding: 16, borderWidth: 1, marginVertical: 6 },
  permissionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  permissionDesc: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  permissionRow: { flexDirection: 'row', gap: 8 },
  permBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  permBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  pendingBox: { borderRadius: 12, padding: 14, borderWidth: 1, alignItems: 'center', marginVertical: 6 },
  pendingText: { color: '#F59E0B', fontSize: 13, fontWeight: '700' },
});
