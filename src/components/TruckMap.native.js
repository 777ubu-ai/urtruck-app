// TruckMap (native) — embedded map with planned route + live truck point.
// Road geometry can be supplied by UrTruck's authenticated global routing
// backend so international corridors remain real roads instead of straight
// lines. The visual map provider stays inside UrTruck.
import React from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { routingAPI } from '../utils/routingAPI';

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

const toPair = (point) => point ? [point.latitude, point.longitude] : null;
const routeKey = (points) => (points || []).map((point) => `${Number(point?.[0]).toFixed(3)}:${Number(point?.[1]).toFixed(3)}`).join('|');
const needsGlobalRoadRouting = (points) => (points || []).some((point) => {
  const lat = Number(point?.[0]);
  const lng = Number(point?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (lng > 85 && lat < 55) || (lat < 35 && lng > 70);
});

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
  const destination = planned.length ? planned[planned.length - 1] : null;
  const effectivePairs = React.useMemo(() => {
    const pairs = live && destination ? [toPair(live), toPair(destination)] : planned.map(toPair);
    return pairs.filter(Boolean);
  }, [live?.latitude, live?.longitude, destination?.latitude, destination?.longitude, planned.length]);
  const globalNeeded = needsGlobalRoadRouting(effectivePairs);
  const effectiveKey = routeKey(effectivePairs);
  const [autoExternalRoute, setAutoExternalRoute] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!globalNeeded || effectivePairs.length < 2 || externalRoute) {
      setAutoExternalRoute(null);
      return () => { cancelled = true; };
    }
    routingAPI.roadRoute(effectivePairs).then((result) => {
      if (cancelled) return;
      if (result?.ok && Array.isArray(result.geometry) && result.geometry.length >= 2) {
        setAutoExternalRoute({ ...result, routeKey: effectiveKey });
      } else {
        setAutoExternalRoute(null);
      }
    });
    return () => { cancelled = true; };
  }, [globalNeeded, effectiveKey, externalRoute]);

  const resolvedExternalRoute = externalRoute || autoExternalRoute;
  const external = React.useMemo(
    () => (resolvedExternalRoute?.geometry || []).map(asPoint).filter(Boolean),
    [resolvedExternalRoute?.routeKey],
  );
  const road = external.length >= 2 ? external : planned;
  const all = React.useMemo(() => [...road, ...(live ? [live] : [])], [road, live?.latitude, live?.longitude]);

  React.useEffect(() => {
    const distanceText = distanceTextFromMeters(resolvedExternalRoute?.distance_m);
    const durationText = durationTextFromSeconds(resolvedExternalRoute?.duration_s);
    if (external.length >= 2 && distanceText && durationText) {
      onRouteSummary?.({
        distanceText,
        durationText,
        blocked: false,
        isRemaining: Boolean(live),
        provider: resolvedExternalRoute?.provider || 'global',
      });
    } else {
      onRouteSummary?.(null);
    }
  }, [onRouteSummary, resolvedExternalRoute?.routeKey, resolvedExternalRoute?.distance_m, resolvedExternalRoute?.duration_s, live?.latitude, live?.longitude, external.length]);

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
