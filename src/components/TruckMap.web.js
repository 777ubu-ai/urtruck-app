// TruckMap (web) — real HERE map for browser builds when a HERE key is present.
// If the key is absent, keep the branded UrTruck fallback instead of a blank map.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

const HERE_API_KEY =
  (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_HERE_API_KEY) || '';

const HERE_SCRIPT_URLS = [
  'https://js.api.here.com/v3/3.1/mapsjs-core.js',
  'https://js.api.here.com/v3/3.1/mapsjs-service.js',
  'https://js.api.here.com/v3/3.1/mapsjs-mapevents.js',
  'https://js.api.here.com/v3/3.1/mapsjs-ui.js',
];

const HERE_CSS_URL = 'https://js.api.here.com/v3/3.1/mapsjs-ui.css';

let hereLoadPromise;

const loadScript = (src) => new Promise((resolve, reject) => {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    existing.addEventListener('load', resolve, { once: true });
    existing.addEventListener('error', reject, { once: true });
    if (existing.dataset.loaded === 'true') resolve();
    return;
  }
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.dataset.loaded = 'false';
  script.onload = () => {
    script.dataset.loaded = 'true';
    resolve();
  };
  script.onerror = reject;
  document.head.appendChild(script);
});

const loadHereSdk = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('HERE Maps web SDK requires a browser'));
  }
  if (window.H?.Map) return Promise.resolve(window.H);
  if (!hereLoadPromise) {
    const existingLink = document.querySelector(`link[href="${HERE_CSS_URL}"]`);
    if (!existingLink) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = HERE_CSS_URL;
      document.head.appendChild(link);
    }
    hereLoadPromise = HERE_SCRIPT_URLS
      .reduce((promise, src) => promise.then(() => loadScript(src)), Promise.resolve())
      .then(() => window.H);
  }
  return hereLoadPromise;
};

function HereMap({ lat, lng, title }) {
  const containerRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const markerRef = React.useRef(null);
  const [state, setState] = React.useState('loading');

  React.useEffect(() => {
    let alive = true;
    let resizeObserver;

    loadHereSdk()
      .then((H) => {
        if (!alive || !containerRef.current) return;
        const platform = new H.service.Platform({ apikey: HERE_API_KEY });
        const layers = platform.createDefaultLayers({ lg: 'rus' });
        const map = new H.Map(containerRef.current, layers.vector.normal.map, {
          center: { lat, lng },
          zoom: 11,
          pixelRatio: window.devicePixelRatio || 1,
        });

        const behavior = new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
        H.ui.UI.createDefault(map, layers);
        behavior.disable(H.mapevents.Behavior.Feature.WHEEL_ZOOM);

        const marker = new H.map.Marker({ lat, lng });
        marker.setData(title || 'UrTruck');
        map.addObject(marker);

        mapRef.current = map;
        markerRef.current = marker;
        if (window.ResizeObserver) {
          resizeObserver = new ResizeObserver(() => map.getViewPort().resize());
          resizeObserver.observe(containerRef.current);
        }
        setState('ready');
      })
      .catch(() => {
        if (alive) setState('fallback');
      });

    return () => {
      alive = false;
      resizeObserver?.disconnect?.();
      mapRef.current?.dispose?.();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const position = { lat, lng };
    marker.setGeometry(position);
    marker.setData(title || 'UrTruck');
    map.setCenter(position, true);
  }, [lat, lng, title]);

  return (
    <View style={s.hereShell}>
      <View ref={containerRef} style={s.hereCanvas} testID="here-map-canvas" />
      <View style={s.brandBadge}>
        <Text style={s.brandText}>UrTruck HERE</Text>
        <Text style={s.brandSubtext}>{state === 'ready' ? 'Live map' : 'Connecting map'}</Text>
      </View>
      {state === 'fallback' ? <FallbackMap lat={lat} lng={lng} title={title} /> : null}
    </View>
  );
}

function FallbackMap({ lat, lng, title }) {
  return (
    <View style={s.map}>
      <View style={[s.road, s.roadOne]} />
      <View style={[s.road, s.roadTwo]} />
      <View style={[s.road, s.roadThree]} />
      <View style={s.routeLine} />
      <View style={s.startDot} />
      <View style={s.markerShadow} />
      <View style={s.marker}>
        <Feather name="truck" size={21} color="#FFFFFF" />
      </View>
      <View style={s.label}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.coords}>Live location inside UrTruck</Text>
      </View>
    </View>
  );
}

export default function TruckMap({ lat, lng, title }) {
  const canUseHere = HERE_API_KEY.length >= 20 && typeof window !== 'undefined';
  if (canUseHere) return <HereMap lat={lat} lng={lng} title={title} />;
  return (
    <FallbackMap lat={lat} lng={lng} title={title} />
  );
}

const s = StyleSheet.create({
  hereShell: { flex: 1, minHeight: 220, overflow: 'hidden', position: 'relative', backgroundColor: '#EAF1ED' },
  hereCanvas: { ...StyleSheet.absoluteFillObject },
  brandBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: '#DDE5E0',
  },
  brandText: { color: '#14221C', fontSize: 12, fontWeight: '900', letterSpacing: 0.2 },
  brandSubtext: { color: '#617067', fontSize: 10, fontWeight: '700', marginTop: 1 },
  map: { flex: 1, minHeight: 220, overflow: 'hidden', backgroundColor: '#EEF2EF', position: 'relative' },
  road: { position: 'absolute', height: 22, width: '145%', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE5E0' },
  roadOne: { top: '18%', left: '-18%', transform: [{ rotate: '-12deg' }] },
  roadTwo: { top: '58%', left: '-20%', transform: [{ rotate: '18deg' }] },
  roadThree: { top: '42%', left: '-24%', transform: [{ rotate: '76deg' }] },
  routeLine: { position: 'absolute', left: '16%', top: '64%', width: '58%', height: 5, borderRadius: 3, backgroundColor: '#168759', transform: [{ rotate: '-22deg' }] },
  startDot: { position: 'absolute', left: '14%', top: '67%', width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#168759' },
  markerShadow: { position: 'absolute', left: '66%', top: '34%', width: 42, height: 16, borderRadius: 21, backgroundColor: 'rgba(15,107,71,0.18)' },
  marker: { position: 'absolute', left: '66%', top: '24%', width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F6B47', borderWidth: 3, borderColor: '#FFFFFF' },
  label: { position: 'absolute', left: 14, top: 14, maxWidth: '68%', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: '#DDE5E0' },
  title: { color: '#14221C', fontSize: 13, fontWeight: '800' },
  coords: { color: '#617067', fontSize: 10, fontWeight: '600', marginTop: 2 },
});
