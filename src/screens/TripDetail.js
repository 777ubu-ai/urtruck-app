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
import { LEVELS } from '../utils/AuthContext';
import RatingModal from '../components/RatingModal';

const TYPE_LABEL = { tent: 'Тент', ref: 'Рефрижератор', platform: 'Площадка', auto: 'Автовоз', izoterm: 'Изотерм' };

export default function TripDetail({ navigation, route }) {
  const { trip, role } = route.params || {};
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const [shareModal, setShareModal] = React.useState(false);
  const [rateModal, setRateModal] = React.useState(false);

  if (!trip) return null;

  const accent = role === 'driver' ? '#2563EB' : '#F59E0B';
  const stats = routeStats(trip.from, trip.to, trip.transit);

  const onDelete = () => {
    const confirmDelete = () => {
      removeTrip(trip.id);
      toast('🗑 Рейс удалён', 'info');
      navigation.goBack();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Удалить рейс?')) confirmDelete();
    } else {
      Alert.alert('Удалить рейс?', '', [
        { text: 'Отмена' },
        { text: 'Удалить', style: 'destructive', onPress: confirmDelete },
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
        <GradientText style={s.title} colors={['#22C55E', '#0891B2']}>🚛 Рейс</GradientText>
        <TouchableOpacity onPress={() => setShareModal(true)}>
          <Text style={{ fontSize: 20 }}>↗️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}>
        {/* Маршрут на карте */}
        <RouteMap from={trip.from} to={trip.to} transit={trip.transit} height={180} />

        {/* Информация о рейсе */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>МАРШРУТ</Text>
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
            <Text style={[s.city, { color: theme.text }]}>{trip.from}</Text>
          </View>
          {trip.transit && (
            <View style={s.routeRow}>
              <View style={[s.dot, { backgroundColor: '#2563EB' }]} />
              <Text style={[s.transitCity, { color: theme.textSecondary }]}>через {trip.transit}</Text>
            </View>
          )}
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: '#22C55E' }]} />
            <Text style={[s.city, { color: theme.text }]}>{trip.to}</Text>
          </View>

          {stats && (
            <View style={s.statsRow}>
              <View style={[s.statPill, { backgroundColor: theme.border }]}>
                <Text style={[s.statText, { color: theme.text }]}>📏 {stats.km} км</Text>
              </View>
              <View style={[s.statPill, { backgroundColor: theme.border }]}>
                <Text style={[s.statText, { color: theme.text }]}>⏱ ~{stats.days} дн.</Text>
              </View>
            </View>
          )}
        </View>

        {/* Даты */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>ДАТЫ</Text>
          <View style={s.dateRow}>
            <Text style={[s.dateLabel, { color: theme.textMuted }]}>🚀 Выезд</Text>
            <Text style={[s.dateValue, { color: theme.text }]}>{trip.departure || '—'}</Text>
          </View>
          <View style={s.dateRow}>
            <Text style={[s.dateLabel, { color: theme.textMuted }]}>🏁 Прибытие</Text>
            <Text style={[s.dateValue, { color: theme.text }]}>{trip.arrival || '—'}</Text>
          </View>
        </View>

        {/* Транспорт */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>ТРАНСПОРТ</Text>
          <View style={s.dateRow}>
            <Text style={[s.dateLabel, { color: theme.textMuted }]}>Кузов</Text>
            <Text style={[s.dateValue, { color: theme.text }]}>{TYPE_LABEL[trip.truckType] || trip.truckType || '—'}</Text>
          </View>
          <View style={s.dateRow}>
            <Text style={[s.dateLabel, { color: theme.textMuted }]}>Водитель</Text>
            <Text style={[s.dateValue, { color: theme.text }]}>{trip.driverName || '—'}</Text>
          </View>
          {trip.available_volume_m3 && (
            <View style={s.dateRow}>
              <Text style={[s.dateLabel, { color: theme.textMuted }]}>Свободно</Text>
              <Text style={[s.dateValue, { color: theme.text }]}>{trip.available_volume_m3} м³</Text>
            </View>
          )}
        </View>

        {/* Timeline статусов */}
        <View style={[{ backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 12 }]}>📍 Статус рейса</Text>
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
                  }}>{info.label}</Text>
                  {active && (
                    <Text style={{ color: info.color, fontSize: 11, marginTop: 2 }}>Текущий статус</Text>
                  )}
                </View>
                {isOwner && !passed && i === currentIdx + 1 && (
                  <TouchableOpacity
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: info.color }}
                    onPress={() => advanceTripState(trip.id, st)}
                  >
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>Отметить</Text>
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
                toast('💬 Чат открыт с водителем', 'success');
                navigation.navigate('Chat', { partner: { name: trip.driverName, country: trip.country || 'KZ' }, role });
              }}
            >
              <Text style={s.primaryBtnText}>💬 Написать водителю</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.secondaryBtn, { borderColor: accent }]}
              onPress={async () => {
                const ok = await requireLevel(LEVELS.PHONE, 'bid');
                if (!ok) return;
                setRateModal(true);
              }}
            >
              <Text style={[s.secondaryBtnText, { color: accent }]}>⭐ Оставить отзыв</Text>
            </TouchableOpacity>
          </>
        ) : isOwner ? (
          <TouchableOpacity style={[s.dangerBtn, { borderColor: '#EF4444' }]} onPress={onDelete}>
            <Text style={s.dangerBtnText}>🗑 Удалить рейс</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

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
});
