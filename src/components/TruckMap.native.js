// TruckMap (native) — embedded map with planned route + live truck point.
// Preferred road geometry/metrics come from the authenticated UrTruck backend.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { routingAPI } from '../utils/routingAPI';
import { useI18n } from '../utils/useI18n';

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
const routeKey = (points) => (points || [])
  .map((point) => `${Number(point?.[0]).toFixed(4)}:${Number(point?.[1]).toFixed(4)}`)
  .join('|');

const buildYandexRouteUrl = (points) => {
  const safe = (points || []).filter(Boolean);
  if (safe.length < 2) return null;
  const rtext = safe.map((p) => `${p[0]},${p[1]}`).join('~');
  return `https://yandex.ru/maps/?rtext=${encodeURIComponent(rtext)}&rtt=auto`;
};

// 2026-08-20 (App Store release audit, P0 locale leak): distance/duration
// units and map marker titles were hardcoded in Russian, so a ZH/EN/KK user
// saw «км / д / ч / мин» and «Старт/Назначение/Точка маршрута/Машина» in the
// map UI regardless of the selected language. Both formatters now take the
// translator; units come from the existing km_short / track_day / track_hour
// / track_min keys (present in all four languages). Confirmed still absent
// on main as of the 2026-08-21 merge (main's copy has no `t` parameter at
// all) — this is a real fix being restored, not main's work being discarded.
const distanceTextFromMeters = (value, t) => {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters <= 0) return null;
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

export default function TruckMap({
  lat, lng, title, routePoints = [], externalRoute = null, onRouteSummary,
  // 2026-08-19 (P1 re-review, независимый merge-block): см. комментарий в
  // TruckMap.web.js — partial vehicle.payload_t (НЕ weight_t) из уже
  // собранной грузоподъёмности, полные габариты пока не собираются в анкете.
  vehicle = null,
}) {
  const { t, lang } = useI18n();
  const live = asPoint([lat, lng]);
  const planned = React.useMemo(() => (routePoints || []).map(asPoint).filter(Boolean), [routePoints]);
  const destination = planned.length ? planned[planned.length - 1] : null;
  const effectivePairs = React.useMemo(() => {
    const pairs = live && destination ? [toPair(live), toPair(destination)] : planned.map(toPair);
    return pairs.filter(Boolean);
  }, [live?.latitude, live?.longitude, destination?.latitude, destination?.longitude, planned.length]);
  const effectiveKey = routeKey(effectivePairs);
  const vehicleKey = vehicle ? JSON.stringify(vehicle) : '';
  const [serverRoute, setServerRoute] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    if (externalRoute || effectivePairs.length < 2) {
      setServerRoute(null);
      return () => { cancelled = true; };
    }
    routingAPI.roadRoute(effectivePairs, vehicle).then((result) => {
      if (cancelled) return;
      if (result?.ok && Array.isArray(result.geometry) && result.geometry.length >= 2) {
        setServerRoute({ ...result, routeKey: effectiveKey });
      } else {
        setServerRoute(null);
      }
    });
    return () => { cancelled = true; };
  }, [effectiveKey, externalRoute, vehicleKey]);

  const resolvedRoute = externalRoute || serverRoute;
  const roadGeometry = React.useMemo(
    () => (resolvedRoute?.geometry || []).map(asPoint).filter(Boolean),
    [resolvedRoute?.routeKey],
  );
  const road = roadGeometry.length >= 2 ? roadGeometry : planned;
  const all = React.useMemo(() => [...road, ...(live ? [live] : [])], [road, live?.latitude, live?.longitude]);
  const routeUrl = React.useMemo(() => buildYandexRouteUrl(effectivePairs), [effectiveKey]);
  const openRoute = React.useCallback(() => {
    if (routeUrl) Linking.openURL(routeUrl).catch(() => {});
  }, [routeUrl]);

  React.useEffect(() => {
    const distanceText = distanceTextFromMeters(resolvedRoute?.distance_m, t);
    const durationText = durationTextFromSeconds(resolvedRoute?.duration_s, t);
    if (roadGeometry.length >= 2 && distanceText && durationText) {
      onRouteSummary?.({
        distanceText,
        durationText,
        blocked: false,
        isRemaining: Boolean(live),
        provider: resolvedRoute?.provider || 'server-road',
      });
    } else {
      onRouteSummary?.(null);
    }
    // `lang` is a dependency: the summary strings are localized, so switching
    // language must re-emit them instead of leaving the previous locale's text.
  }, [onRouteSummary, resolvedRoute?.routeKey, resolvedRoute?.distance_m, resolvedRoute?.duration_s, live?.latitude, live?.longitude, roadGeometry.length, lang, t]);

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
    <View style={s.shell}>
      <MapView style={s.map} initialRegion={region}>
        {road.length >= 2 ? (
          <Polyline
            coordinates={road}
            strokeColor={roadGeometry.length >= 2 ? '#168759' : '#6B7B73'}
            strokeWidth={roadGeometry.length >= 2 ? 6 : 3}
            lineDashPattern={roadGeometry.length >= 2 ? undefined : [8, 6]}
          />
        ) : null}
        {planned.map((point, index) => (
          <Marker
            key={`${point.latitude}:${point.longitude}:${index}`}
            coordinate={point}
            title={index === 0 ? t('map_point_start') : (index === planned.length - 1 ? t('map_point_destination') : t('map_point_waypoint'))}
            pinColor="#168759"
          />
        ))}
        {live ? <Marker coordinate={live} title={title || t('track_truck_marker')} /> : null}
      </MapView>
      {routeUrl ? (
        <TouchableOpacity style={s.routeAction} onPress={openRoute} activeOpacity={0.84} testID="truck-map-route-action">
          <Text style={s.routeActionText}>{t('route_action')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  routeAction: {
    position: 'absolute', right: 12, bottom: 12, minHeight: 40, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  routeActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
