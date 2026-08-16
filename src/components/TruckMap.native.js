// TruckMap (native) — branded live map card with UrTruck marker.
// Full HERE Native SDK is intentionally kept out of this quick test branch:
// it needs native package integration and store-safe iOS/Android rebuilds.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Feather from '@expo/vector-icons/Feather';

const URTRUCK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#EEF4F0' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#405047' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#CAD9D1' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#E7F0EA' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#DCE8E2' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F7FBF8' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#BFD4C8' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D9E9F2' }] },
];

export default function TruckMap({ lat, lng, title }) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  return (
    <View style={s.shell}>
      <MapView
        style={s.map}
        customMapStyle={URTRUCK_MAP_STYLE}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        region={{ latitude, longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
      >
        <Marker coordinate={{ latitude, longitude }} title={title}>
          <View style={s.markerWrap}>
            <View style={s.marker}>
              <Feather name="truck" size={20} color="#FFFFFF" />
            </View>
            <View style={s.markerTail} />
          </View>
        </Marker>
      </MapView>
      <View pointerEvents="none" style={s.brandBadge}>
        <Text style={s.brandText}>UrTruck Map</Text>
        <Text style={s.brandSubtext}>Live location</Text>
      </View>
      <View pointerEvents="none" style={s.infoPill}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.coords}>Live location inside UrTruck</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, minHeight: 220, overflow: 'hidden', backgroundColor: '#EAF1ED', position: 'relative' },
  map: { flex: 1 },
  markerWrap: { alignItems: 'center' },
  marker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F6B47',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#0F6B47',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#0F6B47',
    marginTop: -2,
  },
  brandBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: '#DDE5E0',
  },
  brandText: { color: '#14221C', fontSize: 12, fontWeight: '900', letterSpacing: 0.2 },
  brandSubtext: { color: '#617067', fontSize: 10, fontWeight: '700', marginTop: 1 },
  infoPill: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#DDE5E0',
  },
  title: { color: '#14221C', fontSize: 13, fontWeight: '900' },
  coords: { color: '#617067', fontSize: 11, fontWeight: '700', marginTop: 2 },
});
