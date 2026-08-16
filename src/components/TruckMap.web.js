// TruckMap (web) — real in-app map for browser/PWA builds.
// Uses Leaflet + OpenStreetMap tiles as a zero-key fallback so a deal map is
// visible immediately, even before the first GPS point. When the driver starts
// the trip, the live marker is placed on the same map automatically.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
let leafletPromise;

const loadLeaflet = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('browser_required'));
  }
  if (window.L?.map) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      if (window.L?.map) { resolve(window.L); return; }
      existing.addEventListener('load', () => resolve(window.L), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return leafletPromise;
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

export default function TruckMap({ lat, lng, title, routePoints = [], planned = false }) {
  const hostRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const objectsRef = React.useRef([]);
  const [failed, setFailed] = React.useState(false);

  const livePoint = asPoint([lat, lng]);
  const plannedPoints = (routePoints || []).map(asPoint).filter(Boolean);
  const allPoints = livePoint ? [...plannedPoints, livePoint] : plannedPoints;

  React.useEffect(() => {
    let alive = true;
    let resizeObserver;

    loadLeaflet().then((L) => {
      if (!alive || !hostRef.current) return;
      const initial = allPoints[0] || [43.2389, 76.8897];
      const map = L.map(hostRef.current, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
      }).setView(initial, allPoints.length > 1 ? 6 : 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      mapRef.current = map;
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => map.invalidateSize(false));
        resizeObserver.observe(hostRef.current);
      }
      setTimeout(() => map.invalidateSize(false), 50);
      setFailed(false);
    }).catch(() => {
      if (alive) setFailed(true);
    });

    return () => {
      alive = false;
      resizeObserver?.disconnect?.();
      mapRef.current?.remove?.();
      mapRef.current = null;
      objectsRef.current = [];
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!map || !L) return;

    for (const obj of objectsRef.current) {
      try { map.removeLayer(obj); } catch { /* noop */ }
    }
    objectsRef.current = [];

    const route = plannedPoints;
    if (route.length >= 2) {
      const line = L.polyline(route, {
        color: '#168759',
        weight: 5,
        opacity: 0.85,
        lineCap: 'round',
      }).addTo(map);
      objectsRef.current.push(line);

      route.forEach((point, index) => {
        const dot = L.circleMarker(point, {
          radius: index === 0 || index === route.length - 1 ? 6 : 5,
          color: '#168759',
          weight: 3,
          fillColor: '#FFFFFF',
          fillOpacity: 1,
        }).addTo(map);
        objectsRef.current.push(dot);
      });
    }

    if (livePoint) {
      const live = L.circleMarker(livePoint, {
        radius: 10,
        color: '#FFFFFF',
        weight: 4,
        fillColor: '#0F6B47',
        fillOpacity: 1,
      }).addTo(map);
      if (title) live.bindTooltip(title, { direction: 'top', offset: [0, -8] });
      objectsRef.current.push(live);
    }

    const boundsPoints = livePoint ? [...route, livePoint] : route;
    if (boundsPoints.length >= 2) {
      map.fitBounds(boundsPoints, { padding: [28, 28], maxZoom: 11 });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 10, { animate: false });
    }
  }, [lat, lng, title, JSON.stringify(plannedPoints)]);

  if (failed) {
    return (
      <View style={s.fallback}>
        <Text style={s.fallbackTitle}>UrTruck Map</Text>
        <Text style={s.fallbackText}>{title || (planned ? 'Маршрут сделки' : 'Карта временно недоступна')}</Text>
      </View>
    );
  }

  return (
    <View style={s.shell}>
      <View ref={hostRef} style={s.map} testID="truck-map-web" />
      <View pointerEvents="none" style={s.badge}>
        <Text style={s.badgeTitle}>{planned && !livePoint ? 'Маршрут сделки' : 'Машина на маршруте'}</Text>
        <Text style={s.badgeText}>{planned && !livePoint ? 'GPS появится здесь автоматически' : (title || 'UrTruck')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, minHeight: 240, overflow: 'hidden', position: 'relative', backgroundColor: '#EAF1ED' },
  map: { ...StyleSheet.absoluteFillObject },
  badge: {
    position: 'absolute', left: 12, top: 12, maxWidth: '72%',
    paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: '#DDE5E0',
  },
  badgeTitle: { color: '#14221C', fontSize: 12, fontWeight: '900' },
  badgeText: { color: '#617067', fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  fallback: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#EEF2EF' },
  fallbackTitle: { color: '#14221C', fontSize: 16, fontWeight: '900' },
  fallbackText: { color: '#617067', fontSize: 12, marginTop: 5, textAlign: 'center' },
});