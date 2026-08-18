// TruckMap (web/PWA) — Yandex remains the visual map.
// Preferred road geometry/metrics come from UrTruck backend:
//   KZ/RU/CIS -> Yandex Router API mode=truck
//   unsupported China corridors -> global HGV fallback.
// Browser never receives provider secrets.
import React from 'react';
import { View, Text, StyleSheet, findNodeHandle } from 'react-native';
import { routingAPI } from '../utils/routingAPI';

const asPoint = (p) => {
  if (Array.isArray(p) && p.length >= 2) {
    const lat = Number(p[0]);
    const lng = Number(p[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }
  const lat = Number(p?.lat ?? p?.latitude);
  const lng = Number(p?.lng ?? p?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
};

const pointKey = (point) => point ? `${point[0]}:${point[1]}` : 'none';
const routeKey = (points) => (points || [])
  .map((point) => `${Number(point?.[0]).toFixed(4)}:${Number(point?.[1]).toFixed(4)}`)
  .join('|');

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

function YandexMap({ livePoint, plannedPoints, serverRoute, onRouteSummary }) {
  const hostRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const retryTimerRef = React.useRef(null);
  const routeRequestRef = React.useRef(0);
  const [status, setStatus] = React.useState('loading');
  const [mountAttempt, setMountAttempt] = React.useState(0);
  const [fallbackActive, setFallbackActive] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let timer = null;
    let attempts = 0;

    const fail = () => {
      if (cancelled) return;
      setStatus('error');
      retryTimerRef.current = setTimeout(() => {
        if (!cancelled) {
          setStatus('loading');
          setMountAttempt((n) => n + 1);
        }
      }, 5000);
    };

    const start = () => {
      const api = globalThis.ymaps;
      const directHost = hostRef.current;
      let legacyHost = null;
      try { legacyHost = findNodeHandle(hostRef.current); } catch { /* no-op */ }
      const host = directHost && typeof directHost === 'object' && directHost.nodeType === 1
        ? directHost
        : (legacyHost && typeof legacyHost === 'object' && legacyHost.nodeType === 1 ? legacyHost : null);

      if (!api || !host) {
        attempts += 1;
        if (attempts >= 200) { fail(); return; }
        timer = setTimeout(start, 100);
        return;
      }

      try {
        api.ready(() => {
          if (cancelled) return;
          try {
            const points = livePoint ? [...plannedPoints, livePoint] : plannedPoints;
            const initial = points[0] || [43.2389, 76.8897];
            const map = new api.Map(host, {
              center: initial,
              zoom: points.length > 1 ? 5 : 10,
              controls: ['zoomControl', 'fullscreenControl'],
            }, { suppressMapOpenBlock: true });
            mapRef.current = map;
            setStatus('ready');
          } catch { fail(); }
        });
      } catch { fail(); }
    };

    start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      routeRequestRef.current += 1;
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
  }, [mountAttempt]);

  React.useEffect(() => {
    const map = mapRef.current;
    const api = globalThis.ymaps;
    if (status !== 'ready' || !map || !api) return undefined;

    let cancelled = false;
    const requestId = ++routeRequestRef.current;
    map.geoObjects.removeAll();
    onRouteSummary?.(null);
    setFallbackActive(false);

    const destination = plannedPoints.length ? plannedPoints[plannedPoints.length - 1] : null;
    const routingPoints = livePoint && destination ? [livePoint, destination] : plannedPoints;

    const emitSummary = (summary) => {
      if (cancelled || requestId !== routeRequestRef.current) return;
      onRouteSummary?.(summary);
    };

    const addMarkers = () => {
      plannedPoints.forEach((coordinates, index) => {
        map.geoObjects.add(new api.Placemark(coordinates, {
          hintContent: index === 0 ? 'Старт' : (index === plannedPoints.length - 1 ? 'Назначение' : 'Точка маршрута'),
        }, { preset: 'islands#greenCircleDotIcon' }));
      });
      if (livePoint) {
        map.geoObjects.add(new api.Placemark(livePoint, {
          iconContent: '🚚', hintContent: 'Машина',
        }, { preset: 'islands#greenStretchyIcon', zIndex: 1000 }));
      }
    };

    const fitBounds = () => {
      const bounds = map.geoObjects.getBounds();
      if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 44 });
    };

    // 1) Trusted server route: real road geometry + authoritative metrics.
    const geometry = (serverRoute?.geometry || []).map(asPoint).filter(Boolean);
    if (geometry.length >= 2) {
      map.geoObjects.add(new api.Polyline(geometry, {}, {
        strokeColor: '#168759', strokeWidth: 6, strokeStyle: 'solid', opacity: 0.96,
      }));
      addMarkers();
      fitBounds();
      const distanceText = distanceTextFromMeters(serverRoute?.distance_m);
      const durationText = durationTextFromSeconds(serverRoute?.duration_s);
      if (distanceText && durationText) {
        emitSummary({
          distanceText,
          durationText,
          blocked: false,
          isRemaining: Boolean(livePoint),
          provider: serverRoute?.provider || 'server-road',
        });
      }
      return () => { cancelled = true; };
    }

    // 2) JS MultiRoute remains a compatibility fallback. If it fails, the
    // direction line is deliberately gray/dashed and explicitly labelled —
    // never presented as a real road route.
    const addDirectionFallback = () => {
      emitSummary(null);
      setFallbackActive(true);
      if (cancelled || requestId !== routeRequestRef.current || routingPoints.length < 2) return;
      map.geoObjects.add(new api.Polyline(routingPoints, {}, {
        strokeColor: '#6B7B73', strokeWidth: 3, strokeStyle: 'dash', opacity: 0.58,
      }));
      addMarkers();
      fitBounds();
    };

    if (routingPoints.length >= 2 && api.multiRouter?.MultiRoute) {
      const multiRoute = new api.multiRouter.MultiRoute({
        referencePoints: routingPoints,
        params: { routingMode: 'auto', results: 1, avoidTrafficJams: false },
      }, {
        boundsAutoApply: true,
        wayPointVisible: true,
        routeActiveStrokeColor: '#168759',
        routeActiveStrokeWidth: 6,
        routeStrokeColor: '#9DB9AC',
        routeStrokeWidth: 4,
        pinVisible: false,
      });
      multiRoute.model?.events?.add?.('requestsuccess', () => {
        try {
          const activeRoute = multiRoute.getActiveRoute?.();
          const distance = activeRoute?.properties?.get?.('distance');
          const duration = activeRoute?.properties?.get?.('duration');
          if (!distance?.text || !duration?.text) { addDirectionFallback(); return; }
          setFallbackActive(false);
          emitSummary({
            distanceText: String(distance.text),
            durationText: String(duration.text),
            blocked: Boolean(activeRoute?.properties?.get?.('blocked')),
            isRemaining: Boolean(livePoint),
            provider: 'yandex-js',
          });
        } catch { addDirectionFallback(); }
      });
      multiRoute.model?.events?.add?.('requestfail', addDirectionFallback);
      map.geoObjects.add(multiRoute);
      addMarkers();
    } else {
      addDirectionFallback();
    }

    if (routingPoints.length < 2) fitBounds();
    return () => { cancelled = true; };
  }, [status, pointKey(livePoint), JSON.stringify(plannedPoints), serverRoute?.routeKey, serverRoute?.distance_m, serverRoute?.duration_s, onRouteSummary]);

  return (
    <View style={s.shell}>
      <View ref={hostRef} style={s.map} testID="truck-map-yandex-web" />
      {status === 'loading' ? (
        <View pointerEvents="none" style={s.loading} testID="truck-map-yandex-loading">
          <Text style={s.loadingText}>Загружаем Яндекс Карту…</Text>
        </View>
      ) : null}
      {status === 'error' ? (
        <View pointerEvents="none" style={s.loading} testID="truck-map-yandex-error">
          <Text style={s.errorTitle}>Яндекс Карта временно недоступна</Text>
          <Text style={s.loadingText}>Повторяем подключение автоматически…</Text>
        </View>
      ) : null}
      {fallbackActive ? (
        <View pointerEvents="none" style={s.routeState} testID="truck-map-road-route-unavailable">
          <Text style={s.routeStateText}>Маршрут по дороге временно недоступен</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TruckMap({
  lat,
  lng,
  title,
  routePoints = [],
  externalRoute = null,
  planned = false,
  plannedTitle = 'Маршрут',
  plannedHint = 'GPS водителя появится автоматически',
  liveTitle = 'Машина на маршруте',
  showBadge = true,
  onRouteSummary,
}) {
  const livePoint = asPoint([lat, lng]);
  const plannedPoints = React.useMemo(() => (routePoints || []).map(asPoint).filter(Boolean), [routePoints]);
  const configured = typeof globalThis !== 'undefined' && globalThis.__URTRUCK_YANDEX_MAPS_CONFIGURED__ === true;
  const showPlanned = planned && !livePoint;
  const destination = plannedPoints.length ? plannedPoints[plannedPoints.length - 1] : null;
  const effectivePoints = React.useMemo(
    () => (livePoint && destination ? [livePoint, destination] : plannedPoints),
    [pointKey(livePoint), JSON.stringify(plannedPoints)],
  );
  const effectiveKey = routeKey(effectivePoints);
  const [serverRoute, setServerRoute] = React.useState(null);
  const [serverLoading, setServerLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (externalRoute || effectivePoints.length < 2) {
      setServerRoute(null);
      setServerLoading(false);
      return () => { cancelled = true; };
    }
    setServerLoading(true);
    routingAPI.roadRoute(effectivePoints).then((result) => {
      if (cancelled) return;
      setServerLoading(false);
      if (result?.ok && Array.isArray(result.geometry) && result.geometry.length >= 2) {
        setServerRoute({ ...result, routeKey: effectiveKey });
      } else {
        setServerRoute(null);
      }
    });
    return () => { cancelled = true; };
  }, [effectiveKey, externalRoute]);

  const resolvedRoute = externalRoute || serverRoute;

  return (
    <View style={s.shell}>
      {configured ? (
        <YandexMap
          livePoint={livePoint}
          plannedPoints={plannedPoints}
          serverRoute={resolvedRoute}
          onRouteSummary={onRouteSummary}
        />
      ) : (
        <View style={s.loading} testID="truck-map-yandex-not-configured">
          <Text style={s.errorTitle}>Яндекс Карта не подключена</Text>
          <Text style={s.loadingText}>Карта не будет заменена другим провайдером.</Text>
        </View>
      )}
      {serverLoading ? (
        <View pointerEvents="none" style={s.routeState} testID="truck-map-road-routing-loading">
          <Text style={s.routeStateText}>Строим маршрут по дороге…</Text>
        </View>
      ) : null}
      {showBadge ? (
        <View pointerEvents="none" style={s.badge}>
          <Text style={s.badgeTitle}>{showPlanned ? plannedTitle : liveTitle}</Text>
          <Text style={s.badgeText}>{showPlanned ? plannedHint : (title || liveTitle)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, minHeight: 240, overflow: 'hidden', position: 'relative', backgroundColor: '#EAF1ED' },
  map: { ...StyleSheet.absoluteFillObject },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2EF', paddingHorizontal: 24 },
  loadingText: { color: '#617067', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  errorTitle: { color: '#14221C', fontSize: 14, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  routeState: {
    position: 'absolute', left: 12, bottom: 12, maxWidth: '82%',
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: '#DDE5E0',
  },
  routeStateText: { color: '#3F4E46', fontSize: 11.5, fontWeight: '800' },
  badge: {
    position: 'absolute', left: 12, top: 12, maxWidth: '72%', paddingHorizontal: 11, paddingVertical: 8,
    borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: '#DDE5E0',
  },
  badgeTitle: { color: '#14221C', fontSize: 12, fontWeight: '900' },
  badgeText: { color: '#617067', fontSize: 10.5, fontWeight: '700', marginTop: 2 },
});