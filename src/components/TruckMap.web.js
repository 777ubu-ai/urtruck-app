// TruckMap (web) — react-native-maps на web не работает. Показываем спокойную
// схематичную карту с живой точкой машины. Весь маршрут остаётся в UrTruck.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';

export default function TruckMap({ lat, lng, title, stale = false }) {
  const { t } = useI18n();
  return (
    <View style={s.map}>
      <View style={s.grid} />
      <View style={[s.marker, stale && s.markerStale]}>
        <Feather name={stale ? 'map-pin' : 'truck'} size={24} color="#FFFFFF" />
      </View>
      <View style={s.label}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.coords}>{Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</Text>
        <Text style={s.note}>{t('track_coordinate_only')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  map: { flex: 1, minHeight: 220, overflow: 'hidden', backgroundColor: '#EEF2EF', position: 'relative', alignItems: 'center', justifyContent: 'center' },
  grid: { position: 'absolute', width: '100%', height: '100%', opacity: 0.35, borderWidth: 1, borderColor: '#DDE5E0' },
  marker: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F6B47', borderWidth: 3, borderColor: '#FFFFFF' },
  markerStale: { backgroundColor: '#617067' },
  label: { position: 'absolute', left: 14, top: 14, maxWidth: '68%', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: '#DDE5E0' },
  title: { color: '#14221C', fontSize: 13, fontWeight: '800' },
  coords: { color: '#617067', fontSize: 10, fontWeight: '600', marginTop: 2 },
  note: { color: '#617067', fontSize: 10, marginTop: 3 },
});
