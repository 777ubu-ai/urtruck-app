// TruckMap (native) — embedded map with planned route + live truck point.
// Web/PWA uses Yandex JS API and can expose real road distance/ETA. Native
// never fabricates road metrics: it renders the route context and live GPS,
// while route summary remains null until the native Yandex routing layer is
// connected.
import React from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';

const asPoint = (value) => {
  if (Array.isArray(value) && value.length >= 2) {
    const latitude = Number(value[0]);
    const longitude = Number(value[1]);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }
  const latitude = Number(value?.lat ?? value?.latitude);
  const longitude = Number(value?.lng ?? value?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

export default function TruckMap({ lat, lng, title, routePoints = [], onRouteSummary }) {
  const live = asPoint([lat, lng]);
  const planned = React.useMemo(() => (routePoints || []).map(asPoint).filter(Boolean), [routePoints]);
  const all = React.useMemo(() => [...planned, ...(live ? [live] : [])], [planned, live?.latitude, live?.longitude]);

  React.useEffect(() => {
    onRouteSummary?.(null);
  }, [onRouteSummary, live?.latitude, live?.longitude, planned.length]);

  const region = React.useMemo(() => {
    const points = all.length ? all : [{ latitude: 43.2389, longitude: 76.8897 }];
    const lats = points.map((p) => p.latitude);
    const lngs = points.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.08, (maxLat - minLat) * 1.35),
      longitudeDelta: Math.max(0.08, (maxLng - minLng) * 1.35),
    };
  }, [all]);

  return (
    <MapView style={{ flex: 1 }} initialRegion={region}>
      {planned.length >= 2 ? (
        <Polyline coordinates={planned} strokeColor="#168759" strokeWidth={4} lineDashPattern={[8, 6]} />
      ) : null}
      {planned.map((point, index) => (
        <Marker
          key={`${point.latitude}:${point.longitude}:${index}`}
          coordinate={point}
          title={index === 0 ? 'Старт' : (index === planned.length - 1 ? 'Назначение' : 'Точка маршрута')}
          pinColor="#168759"
        />
      ))}
      {live ? <Marker coordinate={live} title={title || 'Машина'} /> : null}
    </MapView>
  );
}
