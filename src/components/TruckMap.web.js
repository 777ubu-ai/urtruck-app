// TruckMap (web/PWA) — Yandex Maps is the primary embedded provider.
// With a Router API key, the planned truck route follows real roads. OpenStreetMap
// remains only a safety fallback so a deal never gets a blank map.
import React from 'react';
import { View, Text, StyleSheet, findNodeHandle } from 'react-native';

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
let leafletPromise;

const DEFAULT_TRUCK = {
  weight: 40,
  maxWeight: 40,
  axleWeight: 10,
  payload: 20,
  height: 4,
  width: 2.5,
  length: 16,
  ecoClass: 4,
  hasTrailer: true,
};

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

const toYandex = ([lat, lng]) => [lng, lat];
const pointKey = (point) => point ? `${point[0]}:${point[1]}` : 'none';

const yandexBounds = (points) => {
  if (!points.length) return null;
  const ys = points.map(toYandex);
  const lngs = ys.map((p) => p[0]);
  const lats = ys.map((p) => p[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
};

const makeDot = (kind = 'route') => {
  const el = document.createElement('div');
  if (kind === 'live') {
    Object.assign(el.style, {
      width: '38px', height: '38px', borderRadius: '19px', background: '#0F6B47',
      border: '3px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '20px', lineHeight: '38px', transform: 'translate(-50%, -50%)',
    });
    el.textContent = '🚚';
  } else {
    Object.assign(el.style, {
      width: '14px', height: '14px', borderRadius: '7px', background: '#fff',
      border: '4px solid #168759', boxShadow: '0 1px 4px rgba(0,0,0,.18)',
      transform: 'translate(-50%, -50%)',
    });
  }
  return el;
};

async function fetchYandexTruckRoute(api, plannedPoints) {
  if (!api?.route || plannedPoints.length < 2) return null;
  const routerKey = globalThis.__URTRUCK_YANDEX_ROUTER_API_KEY__;
  if (!routerKey) return null;

  try {
    api.getDefaultConfig?.().setApikeys?.({ router: routerKey });
    const routes = await api.route({
      points: plannedPoints.map(toYandex),
      type: 'truck',
      bounds: true,
      truck: DEFAULT_TRUCK,
    });
    const route = routes?.[0]?.toRoute?.();
    return route?.geometry?.coordinates?.length ? route : null;
  } catch {
    return null;
  }
}

function YandexMap({ livePoint, plannedPoints, title, onFailure }) {
  const hostRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const apiRef = React.useRef(null);
  const objectsRef = React.useRef([]);
  const routeRequestRef = React.useRef(0);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let timer = null;
    let attempts = 0;

    const start = async () => {
      const api = globalThis.ymaps3;
      const directHost = hostRef.current;
      let legacyHost = null;
      try { legacyHost = findNodeHandle(hostRef.current); } catch { /* no-op */ }
      const host = directHost && typeof directHost === 'object' && directHost.nodeType === 1
        ? directHost
        : (legacyHost && typeof legacyHost === 'object' && legacyHost.nodeType === 1 ? legacyHost : null);
      if (!api || !host) {
        attempts += 1;
        if (attempts >= 200) {
          if (!cancelled) onFailure();
          return;
        }
        timer = setTimeout(start, 100);
        return;
      }
      try {
        await api.ready;
        if (cancelled) return;
        const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapFeature, YMapMarker } = api;
        const points = livePoint ? [...plannedPoints, livePoint] : plannedPoints;
        const initial = points[0] ? toYandex(points[0]) : [76.8897, 43.2389];
        const map = new YMap(host, {
          location: { center: initial, zoom: points.length > 1 ? 6 : 10 },
          showScaleInCopyrights: true,
          mode: 'vector',
        }, [new YMapDefaultSchemeLayer({ theme: 'light' }), new YMapDefaultFeaturesLayer({})]);
        mapRef.current = map;
        apiRef.current = { root: api, YMapFeature, YMapMarker };
        setReady(true);
      } catch {
        if (!cancelled) onFailure();
      }
    };

    start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      routeRequestRef.current += 1;
      mapRef.current?.destroy?.();
      mapRef.current = null;
      apiRef.current = null;
      objectsRef.current = [];
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    const api = apiRef.current;
    if (!ready || !map || !api) return undefined;
    let cancelled = false;
    const requestId = ++routeRequestRef.current;

    const render = async () => {
      for (const child of objectsRef.current) {
        try { map.removeChild(child); } catch { /* already removed */ }
      }
      objectsRef.current = [];

      const routePoints = plannedPoints.map(toYandex);
      const roadRoute = await fetchYandexTruckRoute(api.root, plannedPoints);
      if (cancelled || requestId !== routeRequestRef.current) return;

      if (roadRoute) {
        const line = new api.YMapFeature({
          ...roadRoute,
          style: { stroke: [{ color: '#168759', width: 6 }] },
        });
        map.addChild(line);
        objectsRef.current.push(line);
      } else if (routePoints.length >= 2) {
        const line = new api.YMapFeature({
          geometry: { type: 'LineString', coordinates: routePoints },
          style: { stroke: [{ color: '#168759', width: 5, dash: [10, 8] }] },
        });
        map.addChild(line);
        objectsRef.current.push(line);
      }

      routePoints.forEach((coordinates) => {
        const marker = new api.YMapMarker({ coordinates }, makeDot('route'));
        map.addChild(marker);
        objectsRef.current.push(marker);
      });

      if (livePoint) {
        const live = new api.YMapMarker({ coordinates: toYandex(livePoint) }, makeDot('live'));
        map.addChild(live);
        objectsRef.current.push(live);
      }

      if (roadRoute?.properties?.bounds) {
        map.setLocation({ bounds: roadRoute.properties.bounds, duration: 300 });
        return;
      }
      const points = livePoint ? [...plannedPoints, livePoint] : plannedPoints;
      const bounds = yandexBounds(points);
      if (bounds && points.length >= 2) {
        map.setLocation({ bounds, duration: 250 });
      } else if (points.length === 1) {
        map.setLocation({ center: toYandex(points[0]), zoom: 10, duration: 250 });
      }
    };

    render();
    return () => { cancelled = true; };
  }, [ready, pointKey(livePoint), JSON.stringify(plannedPoints)]);

  return (
    <View style={s.shell}>
      <View ref={hostRef} style={s.map} testID="truck-map-yandex-web" />
      {!ready ? (
        <View pointerEvents="none" style={s.loading}>
          <Text style={s.loadingText}>Загружаем Яндекс Карту…</Text>
        </View>
      ) : null}
    </View>
  );
}

const loadLeaflet = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.reject(new Error('browser_required'));
  if (window.L?.map) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = LEAFLET_CSS; document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      if (window.L?.map) return resolve(window.L);
      existing.addEventListener('load', () => resolve(window.L), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS; script.async = true;
    script.onload = () => resolve(window.L); script.onerror = reject;
    document.head.appendChild(script);
  });
  return leafletPromise;
};

function OpenStreetMapFallback({ livePoint, plannedPoints, title }) {
  const hostRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const objectsRef = React.useRef([]);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    let resizeObserver;
    loadLeaflet().then((L) => {
      if (!alive || !hostRef.current) return;
      const points = livePoint ? [...plannedPoints, livePoint] : plannedPoints;
      const initial = points[0] || [43.2389, 76.8897];
      const map = L.map(hostRef.current, { zoomControl: true, attributionControl: true, preferCanvas: true })
        .setView(initial, points.length > 1 ? 6 : 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      mapRef.current = map;
      setReady(true);
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => map.invalidateSize(false));
        resizeObserver.observe(hostRef.current);
      }
      setTimeout(() => map.invalidateSize(false), 50);
    }).catch(() => {});
    return () => {
      alive = false; resizeObserver?.disconnect?.(); mapRef.current?.remove?.(); mapRef.current = null; objectsRef.current = [];
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!ready || !map || !L) return;
    for (const obj of objectsRef.current) try { map.removeLayer(obj); } catch { /* noop */ }
    objectsRef.current = [];
    if (plannedPoints.length >= 2) objectsRef.current.push(L.polyline(plannedPoints, { color: '#168759', weight: 5, opacity: 0.85, dashArray: '10 8' }).addTo(map));
    plannedPoints.forEach((point) => objectsRef.current.push(L.circleMarker(point, { radius: 6, color: '#168759', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(map)));
    if (livePoint) {
      const live = L.circleMarker(livePoint, { radius: 10, color: '#fff', weight: 4, fillColor: '#0F6B47', fillOpacity: 1 }).addTo(map);
      if (title) live.bindTooltip(title, { direction: 'top', offset: [0, -8] });
      objectsRef.current.push(live);
    }
    const points = livePoint ? [...plannedPoints, livePoint] : plannedPoints;
    if (points.length >= 2) map.fitBounds(points, { padding: [28, 28], maxZoom: 11 });
  }, [ready, pointKey(livePoint), JSON.stringify(plannedPoints), title]);

  return <View ref={hostRef} style={s.map} testID="truck-map-osm-fallback" />;
}

export default function TruckMap({
  lat,
  lng,
  title,
  routePoints = [],
  planned = false,
  plannedTitle = 'Маршрут',
  plannedHint = 'GPS водителя появится автоматически',
  liveTitle = 'Машина на маршруте',
  showBadge = true,
}) {
  const livePoint = asPoint([lat, lng]);
  const plannedPoints = (routePoints || []).map(asPoint).filter(Boolean);
  const configured = typeof globalThis !== 'undefined' && globalThis.__URTRUCK_YANDEX_MAPS_CONFIGURED__ === true;
  const [useFallback, setUseFallback] = React.useState(!configured);
  const showPlanned = planned && !livePoint;

  return (
    <View style={s.shell}>
      {useFallback ? (
        <OpenStreetMapFallback livePoint={livePoint} plannedPoints={plannedPoints} title={title} />
      ) : (
        <YandexMap livePoint={livePoint} plannedPoints={plannedPoints} title={title} onFailure={() => setUseFallback(true)} />
      )}
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
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2EF' },
  loadingText: { color: '#617067', fontSize: 12, fontWeight: '700' },
  badge: {
    position: 'absolute', left: 12, top: 12, maxWidth: '72%', paddingHorizontal: 11, paddingVertical: 8,
    borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: '#DDE5E0',
  },
  badgeTitle: { color: '#14221C', fontSize: 12, fontWeight: '900' },
  badgeText: { color: '#617067', fontSize: 10.5, fontWeight: '700', marginTop: 2 },
});