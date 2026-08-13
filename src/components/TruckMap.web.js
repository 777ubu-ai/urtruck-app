// TruckMap (web) — react-native-maps на web не работает. Показываем спокойную
// схематичную карту с живой точкой машины. Весь маршрут остаётся в UrTruck.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

export default function TruckMap({ lat, lng, title }) {
  return (
    <View style={s.map}>
      <View style={[s.road, s.roadOne]} />
      <View style={[s.road, s.roadTwo]} />
      <View style={[s.road, s.roadThree]} />
      <View style={s.routeLine} />
      <View style={s.startDot} />
      <View style={s.markerShadow} />
      <View style={s.marker}>
        <Feather name="truck" size={21} color="#FFFFFF" />
      </View>
      <View style={s.label}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.coords}>{Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  map: { flex: 1, minHeight: 220, overflow: 'hidden', backgroundColor: '#EEF2EF', position: 'relative' },
  road: { position: 'absolute', height: 22, width: '145%', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE5E0' },
  roadOne: { top: '18%', left: '-18%', transform: [{ rotate: '-12deg' }] },
  roadTwo: { top: '58%', left: '-20%', transform: [{ rotate: '18deg' }] },
  roadThree: { top: '42%', left: '-24%', transform: [{ rotate: '76deg' }] },
  routeLine: { position: 'absolute', left: '16%', top: '64%', width: '58%', height: 5, borderRadius: 3, backgroundColor: '#168759', transform: [{ rotate: '-22deg' }] },
  startDot: { position: 'absolute', left: '14%', top: '67%', width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#168759' },
  markerShadow: { position: 'absolute', left: '66%', top: '34%', width: 42, height: 16, borderRadius: 21, backgroundColor: 'rgba(15,107,71,0.18)' },
  marker: { position: 'absolute', left: '66%', top: '24%', width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F6B47', borderWidth: 3, borderColor: '#FFFFFF' },
  label: { position: 'absolute', left: 14, top: 14, maxWidth: '68%', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: '#DDE5E0' },
  title: { color: '#14221C', fontSize: 13, fontWeight: '800' },
  coords: { color: '#617067', fontSize: 10, fontWeight: '600', marginTop: 2 },
});
