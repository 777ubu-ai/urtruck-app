// TrackTruckScreen — карта сделки внутри UrTruck.
// Маршрут показывается сразу после создания сделки. GPS водителя, когда появится,
// автоматически накладывается на ту же карту; отдельного пустого экрана ожидания нет.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { marketAPI } from '../utils/marketAPI';
import TruckMap from '../components/TruckMap';
import { parseRouteCities } from '../utils/geo';
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
    const iv = setInterval(load, 10000);
    return () => { mounted.current = false; clearInterval(iv); };
  }, [load]);

  const lat = loc ? Number(loc.lat) : null;
  const lng = loc ? Number(loc.lng) : null;

  const routePoints = React.useMemo(() => {
    const points = [...parseRouteCities(from), ...parseRouteCities(to)];
    const seen = new Set();
    return points.filter((point) => {
      const key = point.join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [from, to]);
  const agoMin = (() => {
    if (!loc || !loc.updated_at) return null;
    const ts = Date.parse(String(loc.updated_at).replace(' ', 'T') + (String(loc.updated_at).endsWith('Z') ? '' : 'Z'));
    if (Number.isNaN(ts)) return null;
    return Math.max(0, Math.round((Date.now() - ts) / 60000));
  })();
  const fmtAgo = (m) => {
    if (m == null) return '';
    if (m === 0) return t('track_updated_now');
    const unit = m < 60 ? `${m} ${t('track_min')}`
      : m < 1440 ? `${Math.floor(m / 60)} ${t('track_hour')}`
      : `${Math.floor(m / 1440)} ${t('track_day')}`;
    return `${t('track_updated')} ${unit} ${t('track_ago')}`;
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
      <Text style={[s.route, { color: theme.textMuted }]} numberOfLines={2}>{localizePlace(from || '—', getLanguage())} → {localizePlace(to || '—', getLanguage())}</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={theme.text} />
      ) : (
        <View style={s.cleanMapWrap} testID={loc ? "track-live-map" : "track-planned-map"}>
          <TruckMap
            lat={loc ? lat : undefined}
            lng={loc ? lng : undefined}
            title={loc ? (driverName || t('track_truck_marker')) : undefined}
            routePoints={routePoints}
            planned={!loc}
            plannedTitle={t('planned_route_title')}
            plannedHint={t('tracking_starts_after_start')}
            liveTitle={t('live_route_title')}
            showBadge={false}
          />
          {loc ? (
            <View style={[s.liveMini, { backgroundColor: theme.card, borderColor: theme.border }]} pointerEvents="none">
              <View style={s.liveMiniDot} />
              <Text style={[s.liveMiniText, { color: theme.text }]} numberOfLines={1}>
                {fmtAgo(agoMin) || t('track_updated_now')}
              </Text>
            </View>
          ) : null}
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
  route: { fontSize: 13, textAlign: 'center', marginBottom: 8, paddingHorizontal: 16 },
  cleanMapWrap: { flex: 1, marginHorizontal: 12, marginBottom: 12, borderRadius: 18, overflow: 'hidden', position: 'relative' },
  liveMini: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '72%', paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderRadius: 999 },
  liveMiniDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#168759' },
  liveMiniText: { fontSize: 11.5, fontWeight: '800' },
  planBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  planTitle: { fontSize: 13, fontWeight: '850' },
  planHint: { fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  plannedMap: { flex: 1, minHeight: 360, borderRadius: 16, overflow: 'hidden' },
  stats: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 6, borderWidth: 1, borderRadius: 14, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '900' },
  statLbl: { fontSize: 10.5, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
  statDiv: { width: 1, height: 34 },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 8, minHeight: 18 },
  badgeBorder: { color: '#168759', fontSize: 12, fontWeight: '800' },
  updated: { fontSize: 11, textAlign: 'right', flex: 1 },
  staleBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: 12 },
  staleText: { flex: 1, fontSize: 12, color: '#F59E0B', fontWeight: '600', lineHeight: 16 },
  driverCard: { marginHorizontal: 12, marginTop: 8, marginBottom: 10, padding: 12, borderWidth: 1, borderRadius: 16, gap: 10 },
  driverIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  driverAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F6EF' },
  driverText: { flex: 1, minWidth: 0 },
  driverName: { fontSize: 15, fontWeight: '800' },
  presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#168759' },
  driverStatus: { fontSize: 11, fontWeight: '700' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageBtn: { flex: 1, height: 48, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0F6B47' },
  messageBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});