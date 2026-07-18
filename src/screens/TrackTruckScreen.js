// TrackTruckScreen — грузоотправитель видит, где сейчас машина (задача B).
// Карта вынесена в TruckMap (native = react-native-maps/Apple Maps без
// ключа; web = фолбэк). Позиция тянется поллингом GET
// /market/deals/{id}/location раз в 15с. «Открыть в Картах» — системное
// приложение карт по координатам.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { marketAPI } from '../utils/marketAPI';
import TruckMap from '../components/TruckMap';
import { parseCity, distance as geoDistance, isNearBorder } from '../utils/geo';
import { localizePlace } from '../utils/places';
import { getLanguage } from '../utils/i18n';

export default function TrackTruckScreen({ navigation, route }) {
  const { dealId, from, to, driverName } = route.params || {};
  const { t } = useI18n();
  const { theme } = useTheme();
  const [loc, setLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!dealId) { setLoading(false); return; }
    const r = await marketAPI.getDealLocation(dealId);
    if (!mounted.current) return;
    setLoading(false);
    if (r && r.has_location && r.location) setLoc(r.location);
  }, [dealId]);

  useEffect(() => {
    mounted.current = true;
    load();
    const iv = setInterval(load, 10000);   // 10с — живее «движение машины»
    return () => { mounted.current = false; clearInterval(iv); };
  }, [load]);

  const lat = loc ? Number(loc.lat) : null;
  const lng = loc ? Number(loc.lng) : null;

  // Живая «расшифровка» как в Яндекс.Такси: осталось км до пункта, скорость,
  // ETA, когда обновлялось, отметка «на границе».
  const destCoord = parseCity(to);
  const driverCoord = (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) ? [lat, lng] : null;
  const kmLeftRaw = (destCoord && driverCoord) ? geoDistance(driverCoord, destCoord) : null;
  const kmLeft = (kmLeftRaw != null && !Number.isNaN(kmLeftRaw)) ? Math.round(kmLeftRaw) : null;
  const speedKmh = (loc && loc.speed != null && loc.speed >= 0) ? Math.round(loc.speed * 3.6) : null;
  const moving = speedKmh != null && speedKmh >= 5;
  const etaMin = (kmLeft != null && moving) ? Math.round((kmLeft / speedKmh) * 60) : null;
  const nearBorder = driverCoord ? isNearBorder(lat, lng) : false;
  const agoMin = (() => {
    if (!loc || !loc.updated_at) return null;
    const ts = Date.parse(String(loc.updated_at).replace(' ', 'T') + (String(loc.updated_at).endsWith('Z') ? '' : 'Z'));
    if (Number.isNaN(ts)) return null;
    return Math.max(0, Math.round((Date.now() - ts) / 60000));
  })();
  const fmtEta = (m) => (m == null ? '—' : m < 60 ? `${m} ${t('track_min')}` : `${Math.floor(m / 60)} ${t('track_hour')} ${m % 60} ${t('track_min')}`);
  const openExternal = () => {
    if (lat == null) return;
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(driverName || 'UrTruck')}`
      : `https://maps.google.com/?q=${lat},${lng}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[s.back, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{t('track_truck_title')}</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={[s.route, { color: theme.textMuted }]} numberOfLines={1}>{localizePlace(from || '—', getLanguage())} → {localizePlace(to || '—', getLanguage())}</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={theme.text} />
      ) : !loc ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 44 }}>🛰️</Text>
          <Text style={[s.emptyTitle, { color: theme.text }]}>{t('track_truck_waiting')}</Text>
          <Text style={[s.emptyDesc, { color: theme.textMuted }]}>{t('track_truck_waiting_desc')}</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Живая расшифровка: осталось · скорость · ETA · обновлено */}
          <View style={[s.stats, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={s.stat}>
              <Text style={[s.statNum, { color: theme.text }]}>{kmLeft != null ? kmLeft : '—'}</Text>
              <Text style={[s.statLbl, { color: theme.textMuted }]}>{t('track_left')} · {t('km_short')}</Text>
            </View>
            <View style={[s.statDiv, { backgroundColor: theme.border }]} />
            <View style={s.stat}>
              <Text style={[s.statNum, { color: moving ? '#22C55E' : theme.textMuted }]}>{speedKmh != null ? speedKmh : '—'}</Text>
              <Text style={[s.statLbl, { color: theme.textMuted }]}>{t('track_speed_label')} · {t('kmh_short')}</Text>
            </View>
            <View style={[s.statDiv, { backgroundColor: theme.border }]} />
            <View style={s.stat}>
              <Text style={[s.statNum, { color: theme.text, fontSize: 15 }]}>{moving ? fmtEta(etaMin) : t('track_stopped')}</Text>
              <Text style={[s.statLbl, { color: theme.textMuted }]}>{t('track_eta_label')}</Text>
            </View>
          </View>
          <View style={s.subRow}>
            {nearBorder ? <Text style={[s.badgeBorder]}>🛂 {t('track_near_border')}</Text> : <View />}
            <Text style={[s.updated, { color: theme.textDim }]}>
              {agoMin == null ? '' : agoMin === 0 ? t('track_updated_now') : `${t('track_updated')} ${agoMin} ${t('track_min')} ${t('track_ago')}`}
            </Text>
          </View>
          <TruckMap lat={lat} lng={lng} title={driverName || t('track_truck_marker')} />
          <TouchableOpacity style={[s.cta, { backgroundColor: '#FF8400' }]} onPress={openExternal} testID="track-open-maps">
            <Text style={s.ctaText}>🧭 {t('track_truck_open_maps')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, fontWeight: '300', width: 24 },
  title: { fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  route: { fontSize: 13, textAlign: 'center', marginBottom: 8 },
  stats: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 6, borderWidth: 1, borderRadius: 14, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '900' },
  statLbl: { fontSize: 10.5, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
  statDiv: { width: 1, height: 34 },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 8, minHeight: 18 },
  badgeBorder: { color: '#2563EB', fontSize: 12, fontWeight: '800' },
  updated: { fontSize: 11, textAlign: 'right', flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  cta: { position: 'absolute', left: 16, right: 16, bottom: 24, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#0C0A09', fontSize: 16, fontWeight: '800' },
});
