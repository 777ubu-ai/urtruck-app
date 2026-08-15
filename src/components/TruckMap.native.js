// Native UrTruck map. This is deliberately a Yandex MapKit bridge; no
// platform-default or external map provider is used here.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import UrTruckYandexMapView from '../../modules/urtruck-yandex-map/src/UrTruckYandexMapView';

function MapFallback({ lat, lng, title, message }) {
  return (
    <View style={styles.fallback} accessibilityLabel="yandex-map-fallback">
      <Text style={styles.truck}>🚚</Text>
      <Text style={styles.title}>{title || 'UrTruck'}</Text>
      <Text style={styles.coords}>{Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

export default function TruckMap({ lat, lng, title, route, zoom = 10 }) {
  const [mapError, setMapError] = useState(null);
  const apiKey = Constants.expoConfig?.extra?.yandexMapKitApiKey
    || Constants.manifest?.extra?.yandexMapKitApiKey;
  const routePoints = useMemo(() => route || [], [route]);

  if (!apiKey) {
    return <MapFallback lat={lat} lng={lng} title={title} message="Yandex MapKit недоступен: ключ не передан в сборку." />;
  }
  if (mapError) {
    return <MapFallback lat={lat} lng={lng} title={title} message="Yandex MapKit временно недоступен." />;
  }

  return (
    <View style={styles.container} accessibilityLabel="urtruck-yandex-map">
      <UrTruckYandexMapView
        style={StyleSheet.absoluteFill}
        apiKey={apiKey}
        latitude={Number(lat)}
        longitude={Number(lng)}
        zoom={Number(zoom)}
        title={title}
        route={routePoints}
        onMapError={(event) => setMapError(event?.nativeEvent?.code || 'mapkit_error')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1C1917' },
  truck: { fontSize: 44 },
  title: { color: '#FAFAF9', fontSize: 16, fontWeight: '800' },
  coords: { color: '#D6D3D1', fontSize: 13 },
  message: { color: '#A8A29E', fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
});
