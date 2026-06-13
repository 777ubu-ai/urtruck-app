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
    const iv = setInterval(load, 15000);
    return () => { mounted.current = false; clearInterval(iv); };
  }, [load]);

  const lat = loc ? Number(loc.lat) : null;
  const lng = loc ? Number(loc.lng) : null;
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
      <Text style={[s.route, { color: theme.textMuted }]} numberOfLines={1}>{(from || '—')} → {(to || '—')}</Text>

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
          <TruckMap lat={lat} lng={lng} title={driverName || t('track_truck_marker')} />
          <TouchableOpacity style={[s.cta, { backgroundColor: '#F59E0B' }]} onPress={openExternal} testID="track-open-maps">
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  cta: { position: 'absolute', left: 16, right: 16, bottom: 24, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#0C0A09', fontSize: 16, fontWeight: '800' },
});
