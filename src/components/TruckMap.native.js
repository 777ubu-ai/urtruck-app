// Native TruckMap — Yandex MapKit renderer.
// Route geometry comes from the authenticated UrTruck routing endpoint. The
// MapKit instance stays mounted while GPS updates move only the truck marker.
import React from 'react';
import { NativeModules, StyleSheet, Text, View } from 'react-native';
import YaMap, { Marker, Polyline } from 'react-native-yamap';
import { routingAPI } from '../utils/routingAPI';
import { routeProgress } from '../utils/routeProgress';
import { routeMetricNumbers } from '../utils/routeMetricNumbers';
import { useI18n } from '../utils/useI18n';

const YANDEX_MAPKIT_API_KEY = String(process.env.EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY || '').trim();
const MAPKIT_AVAILABLE = Boolean(NativeModules?.yamap);

const asPoint = (value) => {
  const rawLat = Array.isArray(value) ? value[0] : value?.lat ?? value?.latitude;
  const rawLon = Array.isArray(value) ? value[1] : value?.lon ?? value?.lng ?? value?.longitude;
  if (rawLat == null || rawLon == null || String(rawLat).trim() === '' || String(rawLon).trim() === ''
      || !Number.isFinite(Number(rawLat)) || !Number.isFinite(Number(rawLon))
      || Math.abs(Number(rawLat)) > 90 || Math.abs(Number(rawLon)) > 180) return null;
  if (Array.isArray(value) && value.length >= 2) {
    const lat = Number(value[0]);
    const lon = Number(value[1]);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }
  const lat = Number(value?.lat ?? value?.latitude);
  const lon = Number(value?.lon ?? value?.lng ?? value?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
};

const toPair = (point) => (point ? [point.lat, point.lon] : null);
const routeKey = (points) => (points || [])
  .map((point) => `${Number(point?.lat).toFixed(4)}:${Number(point?.lon).toFixed(4)}`)
  .join('|');

const distanceTextFromMeters = (value, t) => {
  const meters = Number(value);
  if (value == null || !Number.isFinite(meters) || meters < 0) return null;
  const km = meters / 1000;
  const rounded = km >= 100 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${String(rounded).replace('.', ',')} ${t('km_short')}`;
};

const durationTextFromSeconds = (value, t) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const d = t('track_day');
  const h = t('track_hour');
  const m = t('track_min');
  if (days > 0) return hours > 0 ? `${days} ${d} ${hours} ${h}` : `${days} ${d}`;
  if (hours > 0) return minutes > 0 ? `${hours} ${h} ${minutes} ${m}` : `${hours} ${h}`;
  return `${minutes} ${m}`;
};

function EndpointMarker({ label }) {
  return (
    <View style={s.endpointMarkerWrap}>
      <View style={s.endpointMarker}><View style={s.endpointInner} /></View>
      {label ? <View style={s.endpointLabel}><Text style={s.endpointLabelText} numberOfLines={1}>{label}</Text></View> : null}
    </View>
  );
}

function TruckMarker({ label }) {
  return <View style={s.truckMarker} accessibilityLabel={label}><Text style={s.truckEmoji}>🚚</Text></View>;
}

export default function TruckMap({
  lat, lng, title, routePoints = [], externalRoute = null, onRouteSummary,
  vehicle = null, startLabel = null, endLabel = null,
}) {
  const { t, lang } = useI18n();
  const live = asPoint([lat, lng]);
  const planned = React.useMemo(() => (routePoints || []).map(asPoint).filter(Boolean), [routePoints]);
  const effectiveKey = routeKey(planned);
  const vehicleKey = vehicle ? JSON.stringify(vehicle) : '';
  const [serverRoute, setServerRoute] = React.useState(null);
  const mapRef = React.useRef(null);
  const truckMarkerRef = React.useRef(null);
  const previousLiveRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    if (externalRoute || planned.length < 2) {
      setServerRoute(null);
      return () => { cancelled = true; };
    }
    setServerRoute(null);
    routingAPI.roadRoute(planned.map(toPair), vehicle).then((result) => {
      if (cancelled) return;
      if (result?.ok && Array.isArray(result.geometry) && result.geometry.length >= 2) {
        setServerRoute({ ...result, routeKey: effectiveKey, vehicleKey });
      } else {
        setServerRoute(null);
      }
    });
    return () => { cancelled = true; };
  }, [effectiveKey, externalRoute, vehicleKey]);

  const resolvedRoute = externalRoute || (serverRoute?.routeKey === effectiveKey && serverRoute?.vehicleKey === vehicleKey ? serverRoute : null);
  const roadGeometry = React.useMemo(
    () => (resolvedRoute?.geometry || []).map(asPoint).filter(Boolean),
    [resolvedRoute?.geometry],
  );
  // Never paint planned city coordinates as a solid route: until the
  // authenticated road geometry arrives, keep the map in its loading state.
  const road = roadGeometry.length >= 2 ? roadGeometry : [];
  const fitTarget = road.length >= 2 ? road : planned;
  const progress = React.useMemo(
    () => routeProgress(road.map(toPair), live ? toPair(live) : null),
    [road, live?.lat, live?.lon],
  );

  React.useEffect(() => {
    const numbers = routeMetricNumbers(resolvedRoute, progress);
    const totalDistanceText = distanceTextFromMeters(numbers.totalMeters, t);
    const remainingText = distanceTextFromMeters(numbers.remainingMeters, t);
    const passedDistanceText = distanceTextFromMeters(numbers.passedMeters, t);
    const totalDurationText = durationTextFromSeconds(numbers.totalDurationSeconds, t);
    const drivingDurationText = durationTextFromSeconds(numbers.drivingDurationSeconds, t);
    if (roadGeometry.length >= 2 && totalDistanceText) {
      onRouteSummary?.({
        distanceText: numbers.isRemaining ? remainingText : totalDistanceText,
        durationText: totalDurationText,
        totalDistanceText,
        passedDistanceText,
        totalDurationText,
        drivingDurationText,
        progressPercent: numbers.progressPercent,
        progressReason: progress.reason,
        blocked: false,
        isRemaining: numbers.isRemaining,
        provider: resolvedRoute?.provider || 'server-road',
      });
    } else {
      onRouteSummary?.(null);
    }
  }, [onRouteSummary, resolvedRoute?.routeKey, resolvedRoute?.distance_m, resolvedRoute?.duration_s, resolvedRoute?.driving_duration_s, live?.lat, live?.lon, roadGeometry.length, progress.totalMeters, progress.remainingMeters, progress.passedMeters, progress.progressPercent, progress.matched, progress.reason, lang, t]);

  React.useEffect(() => {
    if (mapRef.current && fitTarget.length >= 2) mapRef.current.fitMarkers(fitTarget);
  }, [resolvedRoute?.routeKey, fitTarget.length]);

  React.useEffect(() => {
    const previous = previousLiveRef.current;
    if (live && previous && truckMarkerRef.current?.animatedMoveTo) {
      truckMarkerRef.current.animatedMoveTo({ lat: live.lat, lon: live.lon }, 450);
    }
    previousLiveRef.current = live ? { lat: live.lat, lon: live.lon } : null;
  }, [live?.lat, live?.lon]);

  const hasNothingToShow = !live && planned.length < 2;
  const mapReady = MAPKIT_AVAILABLE && Boolean(YANDEX_MAPKIT_API_KEY);
  if (hasNothingToShow) {
    return <View style={s.shell}><View style={s.mapFallback} testID="truck-map-native-unavailable-no_route_coordinates"><Text style={s.mapFallbackText}>{t('map_no_route_coordinates')}</Text></View></View>;
  }
  if (!mapReady) {
    return (
      <View style={s.shell}>
        <View style={s.mapFallback} testID="truck-map-native-unavailable-provider_not_configured">
          <Text style={s.mapFallbackText}>{t('map_unavailable')}</Text>
          {__DEV__ ? <Text style={s.mapDebugError}>{MAPKIT_AVAILABLE ? 'EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY is missing' : 'Yandex MapKit native module is not linked'}</Text> : null}
        </View>
      </View>
    );
  }

      const initial = road[0] || planned[0] || live || { lat: 43.2389, lon: 76.8897 };
  const polylinePoints = road.map((point) => ({ lat: point.lat, lon: point.lon }));
  const routePointLabel = (index) => index === 0
    ? (startLabel || t('map_point_start'))
    : index === planned.length - 1
      ? (endLabel || t('map_point_destination'))
      : t('map_point_waypoint');
  const endpointPoints = planned.length >= 2 ? [
    { point: planned[0], label: routePointLabel(0) },
    { point: planned[planned.length - 1], label: routePointLabel(planned.length - 1) },
  ] : [];

  return (
    <View style={s.shell} testID="truck-map-yandex-mapkit">
      <YaMap
        ref={mapRef}
        style={s.map}
        initialRegion={{ lat: initial.lat, lon: initial.lon, zoom: road.length > 1 ? 4 : 10 }}
        showUserPosition={false}
        followUser={false}
        logoPosition={{ horizontal: 'right', vertical: 'bottom' }}
        logoPadding={{ horizontal: 12, vertical: 10 }}
            onMapLoaded={() => mapRef.current?.fitMarkers?.(fitTarget)}
      >
        {polylinePoints.length >= 2 ? <Polyline points={polylinePoints} strokeColor="#168759" strokeWidth={5} zIndex={1} /> : null}
        {endpointPoints.map(({ point, label }, index) => <Marker key={`endpoint-${index}`} point={{ lat: point.lat, lon: point.lon }} zIndex={5}><EndpointMarker label={label} /></Marker>)}
            {live ? <Marker ref={truckMarkerRef} point={{ lat: live.lat, lon: live.lon }} zIndex={20} anchor={{ x: 0.5, y: 0.5 }}><TruckMarker label={title || t('track_truck_marker')} /></Marker> : null}
      </YaMap>
      {!resolvedRoute && planned.length >= 2 ? <View style={s.mapOverlay} pointerEvents="none"><Text style={s.mapFallbackText}>{t('map_building_route')}</Text></View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, position: 'relative', backgroundColor: '#EEF3F0' },
  map: { flex: 1 },
  mapFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: '#EEF3F0' },
  mapOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(238,243,240,0.72)' },
  mapFallbackText: { color: '#617067', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  mapDebugError: { marginTop: 8, color: '#9B2C2C', fontSize: 11, textAlign: 'center' },
  endpointMarker: { width: 24, height: 24, borderRadius: 12, borderWidth: 4, borderColor: '#168759', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(20,34,28,0.18)' },
  endpointMarkerWrap: { alignItems: 'center', justifyContent: 'center' },
  endpointLabel: { marginTop: 4, maxWidth: 120, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, backgroundColor: '#FFFFFF', boxShadow: '0 2px 5px rgba(20,34,28,0.14)' },
  endpointLabelText: { color: '#14221C', fontSize: 11, fontWeight: '800' },
  endpointInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#168759' },
  truckMarker: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#168759', boxShadow: '0 2px 7px rgba(20,34,28,0.20)' },
  truckEmoji: { fontSize: 18 },
});
