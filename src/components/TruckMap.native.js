// TruckMap (native) — embedded map with planned route + live truck point.
// Preferred road geometry/metrics come from the authenticated UrTruck backend.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { routingAPI } from '../utils/routingAPI';
import { useI18n } from '../utils/useI18n';

// Native screens render the route inside UrTruck. Viewing a planned/live map
// never requests the driver's GPS permission and never opens an external maps
// app. Active-trip permission is owned exclusively by the Start trip action.
// The browser key is injected by CI and is not stored in source.
const YANDEX_MAPS_JS_API_KEY = String(process.env.EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY || '').trim();

const buildYandexMapHtml = (apiKey) => `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#map{width:100%;height:100%;margin:0;background:#eef3f0}</style>
<script src="https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU"></script>
</head><body><div id="map"></div><script>(function(){
var map,objects;function send(type,detail){window.ReactNativeWebView.postMessage(JSON.stringify({type:type,detail:detail||''}));}
function valid(p){return Array.isArray(p)&&p.length===2&&isFinite(p[0])&&isFinite(p[1]);}
window.urtruckUpdateMap=function(p){if(!map)return;try{objects.removeAll();var planned=(p.planned||[]).filter(valid),live=valid(p.live)?p.live:null,road=(p.road||[]).filter(valid);
if(road.length>1)objects.add(new ymaps.Polyline(road,{}, {strokeColor:p.hasRoad?'#168759':'#6B7B73',strokeWidth:p.hasRoad?6:3,strokeStyle:p.hasRoad?'solid':'dash',opacity:.96}));
planned.forEach(function(x,i){objects.add(new ymaps.Placemark(x,{hintContent:i===0?p.startLabel:(i===planned.length-1?p.destinationLabel:p.waypointLabel)},{preset:'islands#greenCircleDotIcon'}));});
if(live)objects.add(new ymaps.Placemark(live,{iconContent:'🚚',hintContent:p.truckLabel},{preset:'islands#greenStretchyIcon',zIndex:1000}));
var bounds=objects.getBounds();if(bounds)map.setBounds(bounds,{checkZoomRange:true,zoomMargin:44});}catch(e){send('update-error',String(e&&e.message||e));}};
if(!window.ymaps){send('api-error','Yandex Maps API script did not load');return;}ymaps.ready(function(){try{map=new ymaps.Map('map',{center:[43.2389,76.8897],zoom:5,controls:['zoomControl']},{suppressMapOpenBlock:true});objects=map.geoObjects;send('ready');}catch(e){send('init-error',String(e&&e.message||e));}});
window.addEventListener('error',function(e){send('js-error',e.message||'JavaScript error');});})();</script></body></html>`;

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
  const webViewRef = React.useRef(null);
  const [mapStatus, setMapStatus] = React.useState(YANDEX_MAPS_JS_API_KEY ? 'loading' : 'error');
  const [mapError, setMapError] = React.useState(YANDEX_MAPS_JS_API_KEY ? '' : 'Yandex Maps JS API key is not configured');

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
  }, [onRouteSummary, resolvedRoute?.routeKey, resolvedRoute?.distance_m, resolvedRoute?.duration_s, live?.latitude, live?.longitude, roadGeometry.length, lang, t]);

  const mapPayload = React.useMemo(() => ({
    live: live ? toPair(live) : null, planned: planned.map(toPair), road: road.map(toPair),
    hasRoad: roadGeometry.length >= 2, startLabel: t('map_point_start'),
    destinationLabel: t('map_point_destination'), waypointLabel: t('map_point_waypoint'),
    truckLabel: title || t('track_truck_marker'),
  }), [live?.latitude, live?.longitude, planned, road, roadGeometry.length, title, lang, t]);

  React.useEffect(() => {
    if (mapStatus === 'ready') {
      webViewRef.current?.injectJavaScript(`window.urtruckUpdateMap(${JSON.stringify(mapPayload)});true;`);
    }
  }, [mapPayload, mapStatus]);

  const onMapMessage = React.useCallback((event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'ready') { setMapStatus('ready'); setMapError(''); return; }
      const detail = `${message.type}: ${message.detail || 'unknown Yandex Maps error'}`;
      console.error('[TruckMap/Yandex]', detail); setMapError(detail); setMapStatus('error');
    } catch (error) { console.error('[TruckMap/Yandex] Invalid WebView message', error); }
  }, []);

  return (
    <View style={s.shell}>
      {YANDEX_MAPS_JS_API_KEY ? <WebView ref={webViewRef} style={s.map}
        source={{ html: buildYandexMapHtml(YANDEX_MAPS_JS_API_KEY), baseUrl: 'https://urtruck.kz' }}
        originWhitelist={['https://*']} javaScriptEnabled domStorageEnabled mixedContentMode="never"
        onMessage={onMapMessage}
        onError={(event) => { const detail = event.nativeEvent?.description || 'WebView network error'; console.error('[TruckMap/Yandex]', detail); setMapError(detail); setMapStatus('error'); }}
        onHttpError={(event) => { const detail = `HTTP ${event.nativeEvent?.statusCode || 'error'}`; console.error('[TruckMap/Yandex]', detail, event.nativeEvent?.url); setMapError(detail); setMapStatus('error'); }}
        testID="truck-map-yandex-webview" /> : null}
      {mapStatus === 'loading' ? <View style={s.mapOverlay} pointerEvents="none"><Text style={s.mapFallbackText}>{t('map_loading')}</Text></View> : null}
      {mapStatus === 'error' ? (
        <View style={s.mapFallback} testID="truck-map-native-unavailable">
          <Text style={s.mapFallbackText}>{t('map_unavailable')}</Text>
          {__DEV__ ? <Text style={s.mapDebugError}>{mapError}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  mapFallback: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, backgroundColor: '#EEF3F0',
  },
  mapOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF3F0' },
  mapFallbackText: { color: '#617067', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  mapDebugError: { marginTop: 8, color: '#9B2C2C', fontSize: 11, textAlign: 'center' },
});