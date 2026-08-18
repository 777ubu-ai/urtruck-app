// TruckMap (native) — embedded map with planned route + live truck point.
// Road geometry can be supplied by UrTruck's authenticated global routing
// backend so international corridors remain real roads instead of straight
// lines. The visual map provider stays inside UrTruck.
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

const distanceTextFromMeters = (value) => {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters <= 0) return null;
  const km = meters / 1000;
  const rounded = km >= 100 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${String(rounded).replace('.', ',')} км`;
};

const durationTextFromSeconds = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days} д ${hours} ч` : `${days} д`;
  if (hours > 0) return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  return `${minutes} мин`;
};

export default function TruckMap({ lat, lng, title, routePoints = [], externalRoute = null, onRouteSummary }) {
  const live = asPoint([lat, lng]);
  const planned = React.useMemo(() => (routePoints || []).map(asPoint).filter(Boolean), [routePoints]);
  const external = React.useMemo(() => (externalRoute?.geometry || []).map(asPoint).filter(Boolean), [externalRoute?.routeKey]);
  const road = external.length >= 2 ? external : planned;
  const all = React.useMemo(() => [...road, ...(live ? [live] : [])], [road, live?.latitude, live?.longitude]);

  React.useEffect(() => {
    const distanceText = distanceTextFromMeters(externalRoute?.distance_m);
    const durationText = durationTextFromSeconds(externalRoute?.duration_s);
    if (external.length >= 2 && distanceText && durationText) {
      onRouteSummary?.({
        distanceText,
        durationText,
        blocked: false,
        isRemaining: Boolean(live),
        provider: externalRoute?.provider || 'global',
      });
    } else {
      onRouteSummary?.(null);
    }
  }, [onRouteSummary, externalRoute?.routeKey, externalRoute?.distance_m, externalRoute?.duration_s, live?.latitude, live?.longitude, external.length]);

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
      {road.length >= 2 ? (
        <Polyline
          coordinates={road}
          strokeColor="#168759"
          strokeWidth={external.length >= 2 ? 6 : 4}
          lineDashPattern={external.length >= 2 ? undefined : [8, 6]}
        />
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
