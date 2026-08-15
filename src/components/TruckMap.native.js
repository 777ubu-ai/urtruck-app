// TruckMap (native) — карта с маркером машины. На iOS react-native-maps
// использует Apple Maps по умолчанию (без API-ключа). Метро подхватывает
// именно этот файл на ios/android; web берёт TruckMap.web.js (без либы).
import React from 'react';
import MapView, { Marker } from 'react-native-maps';

export default function TruckMap({ lat, lng, title, stale = false }) {
  return (
    <MapView
      style={{ flex: 1 }}
      region={{ latitude: lat, longitude: lng, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
    >
      <Marker coordinate={{ latitude: lat, longitude: lng }} title={title} opacity={stale ? 0.55 : 1} />
    </MapView>
  );
}
