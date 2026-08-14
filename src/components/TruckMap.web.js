// TruckMap (web) — живое положение машины на Яндекс Карте. Скрипт JS API
// добавляется в готовый index.html только CI-сборкой, когда передан
// EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY. Ключ в браузерной карте неизбежно
// публичен, поэтому его использование ограничено доменами UrTruck в
// кабинете Яндекс Карт. Без ключа показываем безопасный фолбэк.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, findNodeHandle } from 'react-native';

function CoordinateFallback({ lat, lng, title }) {
  return (
    <View style={s.fallback}>
      <Text style={s.truck}>🚚</Text>
      <Text style={s.title}>{title}</Text>
      <Text style={s.coords}>{Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</Text>
    </View>
  );
}

export default function TruckMap({ lat, lng, title }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;

    const start = async () => {
      const api = globalThis.ymaps3;
      const host = findNodeHandle(hostRef.current);
      // Скрипт загружается асинхронно из index.html. На быстром рендере
      // React Native Web успевает смонтироваться раньше него.
      if (!api || !host) {
        if (!cancelled) retryTimer = setTimeout(start, 100);
        return;
      }
      try {
        await api.ready;
        const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer } = api;
        const { YMapDefaultMarker } = await api.import('@yandex/ymaps3-default-ui-theme');
        if (cancelled) return;

        const coordinates = [Number(lng), Number(lat)];
        const map = new YMap(host, {
          location: { center: coordinates, zoom: 11 },
          showScaleInCopyrights: true,
        }, [new YMapDefaultSchemeLayer(), new YMapDefaultFeaturesLayer()]);
        const marker = new YMapDefaultMarker({ coordinates, title });
        map.addChild(marker);
        mapRef.current = map;
        markerRef.current = marker;
        setReady(true);
      } catch {
        // Неверный/неактивный ключ или сеть не должны скрывать координаты.
        if (!cancelled) {
          setReady(false);
          setFailed(true);
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      markerRef.current = null;
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const coordinates = [Number(lng), Number(lat)];
    if (!mapRef.current || !markerRef.current || coordinates.some(Number.isNaN)) return;
    mapRef.current.update({ location: { center: coordinates, zoom: 11 } });
    markerRef.current.update({ coordinates, title });
  }, [lat, lng, title]);

  if (!globalThis.ymaps3 || failed) return <CoordinateFallback lat={lat} lng={lng} title={title} />;

  return (
    <View style={s.mapWrap}>
      <View ref={hostRef} style={s.mapHost} />
      {!ready ? <View pointerEvents="none" style={s.loading}><Text style={s.loadingText}>Загружаем карту…</Text></View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  mapWrap: { flex: 1, overflow: 'hidden' },
  mapHost: { flex: 1 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C1917' },
  loadingText: { color: '#A8A29E', fontSize: 13, fontWeight: '700' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  truck: { fontSize: 44 },
  title: { fontSize: 16, fontWeight: '800' },
  coords: { fontSize: 13, opacity: 0.7 },
});
