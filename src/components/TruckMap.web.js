// TruckMap (web/PWA) — Yandex Maps is the primary embedded provider.
// The build injects JS API v3 only when the production Yandex key is present.
// OpenStreetMap/Leaflet stays as a safety fallback so a deal never gets a blank map.
import React from 'react';
import { View, Text, StyleSheet, findNodeHandle } from 'react-native';

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
let leafletPromise;

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

function YandexMap({ livePoint, plannedPoints, title, onFailure }) {
  const hostRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const apiRef = React.useRef(null);
  const objectsRef = React.useRef([]);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let timer = null;
    let attempts = 0;

    const start = async () => {
      const api = globalThis.ymaps3;
      const host = findNodeHandle(hostRef.current) || hostRef.current;
      if (!api || !host) {
        attempts += 1;
        if (attempts >= 80) {
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
          theme: 'light',
        }, [new YMapDefaultSchemeLayer({}), new YMapDefaultFeaturesLayer({})]);
        mapRef.current = map;
        apiRef.current = { YMapFeature, YMapMarker };
        setReady(true);
      } catch {
        if (!cancelled) onFailure();
      }
    };

    start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      mapRef.current?.destroy?.();
      mapRef.current = null;
      apiRef.current = null;
      objectsRef.current = [];
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    const api = apiRef.current;
    if (!ready || !map || !api) return;

    for (const child of objectsRef.current) {
      try { map.removeChild(child); } catch { /* already removed */ }
    }
    objectsRef.current = [];

    const route = plannedPoints.map(toYandex);
    if (route.length >= 2) {
      const line = new api.YMapFeature({
        geometry: { type: 'LineString', coordinates: route },
        style: { stroke: [{ color: '#168759', width: 5 }] },
      });
      map.addChild(line);
      objectsRef.current.push(line);
    }

    route.forEach((coordinates) => {
      const marker = new api.YMapMarker({ coordinates }, makeDot('route'));
      map.addChild(marker);
      objectsRef.current.push(marker);
    });

    if (livePoint) {
      const live = new api.YMapMarker({ coordinates: toYandex(livePoint) }, makeDot('live'));
      map.addChild(live);
      objectsRef.current.push(live);
    }

    const points = livePoint ? [...plannedPoints, livePoint] : plannedPoints;
    const bounds = yandexBounds(points);
    if (bounds && points.length >= 2) {
      map.setLocation({ bounds, duration: 250 });
    } else if (points.length === 1) {
      map.setLocation({ center: toYandex(points[0]), zoom: 10, duration: 250 });
    }
  }, [ready, latKey(livePoint), JSON.stringify(plannedPoints)]);

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

const latKey = (point) => point ? `${point[0]}:${point[1]}` : 'none';

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
    if (!map || !L) return;
    for (const obj of objectsRef.current) try { map.removeLayer(obj); } catch { /* noop */ }
    objectsRef.current = [];
    if (plannedPoints.length >= 2) objectsRef.current.push(L.polyline(plannedPoints, { color: '#168759', weight: 5, opacity: 0.85 }).addTo(map));
    plannedPoints.forEach((point) => objectsRef.current.push(L.circleMarker(point, { radius: 6, color: '#168759', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(map)));
    if (livePoint) {
      const live = L.circleMarker(livePoint, { radius: 10, color: '#fff', weight: 4, fillColor: '#0F6B47', fillOpacity: 1 }).addTo(map);
      if (title) live.bindTooltip(title, { direction: 'top', offset: [0, -8] });
      objectsRef.current.push(live);
    }
    const points = livePoint ? [...plannedPoints, livePoint] : plannedPoints;
    if (points.length >= 2) map.fitBounds(points, { padding: [28, 28], maxZoom: 11 });
  }, [latKey(livePoint), JSON.stringify(plannedPoints), title]);

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
      <View pointerEvents="none" style={s.badge}>
        <Text style={s.badgeTitle}>{showPlanned ? plannedTitle : liveTitle}</Text>
        <Text style={s.badgeText}>{showPlanned ? plannedHint : (title || liveTitle)}</Text>
      </View>
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
