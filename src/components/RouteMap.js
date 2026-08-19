import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { localizePlace } from '../utils/places';
import { marketAPI } from '../utils/marketAPI';
import { parseRouteCities } from '../utils/geo';
import TruckMap from './TruckMap';

const dedupePoints = (points) => {
  const seen = new Set();
  return points.filter((point) => {
    if (!Array.isArray(point) || point.length < 2) return false;
    const key = `${point[0]}:${point[1]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// RouteMap — canonical embedded route card. The old implementation estimated
// distance with Haversine ×1.25 and invented ~600 km/day delivery times. That
// looked authoritative even when no road route existed. Now the map delegates
// route geometry and distance/duration to TruckMap (Yandex MultiRoute on web)
// and hides metrics when the provider cannot return a real road result.
export default function RouteMap({ from, to, transit, dealId, dealStatus, driverName, capacityTons }) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const [location, setLocation] = React.useState(null);
  const [locationLoading, setLocationLoading] = React.useState(false);
  const [routeSummary, setRouteSummary] = React.useState(null);

  // 2026-08-19 (P1, независимый re-review PR #239): грузоподъёмность рейса —
  // единственные реальные данные о машине, которые уже собираются в анкете
  // (vehicle_capacity_kg) и доступны на этом экране. Полных габаритов
  // (высота/ширина/длина/осевая нагрузка) анкета не собирает — это
  // отдельная, Graphify-gated задача (изменение backend registration).
  // ВАЖНО: это payload_t (грузоподъёмность/масса перевозимого груза), а
  // НЕ weight_t (фактическая полная масса тягача+прицепа+груза) — Yandex
  // Router API различает эти параметры (weight vs payload). Мы нигде не
  // собираем фактическую полную массу автомобиля, поэтому weight_t
  // оставляем null — искажать весовые ограничения маршрута нельзя.
  const vehicle = React.useMemo(() => {
    const tons = Number(capacityTons);
    return Number.isFinite(tons) && tons > 0 ? { payload_t: tons } : null;
  }, [capacityTons]);

  const trackingActive = Boolean(dealId && ['in_progress', 'at_border', 'delivered'].includes(dealStatus));
  const routePoints = React.useMemo(() => dedupePoints([
    ...parseRouteCities(from),
    ...(transit ? parseRouteCities(transit) : []),
    ...parseRouteCities(to),
  ]), [from, to, transit]);

  React.useEffect(() => {
    if (!trackingActive) {
      setLocation(null);
      setLocationLoading(false);
      return undefined;
    }
    let alive = true;
    const load = async () => {
      setLocationLoading(true);
      try {
        const result = await marketAPI.getDealLocation(dealId);
        if (!alive) return;
        if (result?.has_location && result.location) setLocation(result.location);
      } finally {
        if (alive) setLocationLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => { alive = false; clearInterval(interval); };
  }, [dealId, trackingActive]);

  const lat = location ? Number(location.lat) : null;
  const lng = location ? Number(location.lng) : null;
  const hasLivePoint = Number.isFinite(lat) && Number.isFinite(lng);
  const handleSummary = React.useCallback((summary) => setRouteSummary(summary || null), []);

  return (
    <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]} testID="planned-route-card">
      <View style={s.headerRow}>
        <Feather name="map" size={14} color={theme.textMuted} />
        <Text style={[s.title, { color: theme.textMuted }]}>
          {t(hasLivePoint ? 'live_route_title' : 'planned_route_title')}
        </Text>
      </View>

      <Text style={[s.route, { color: theme.text }]} numberOfLines={2}>
        {localizePlace(from, lang)}
        {transit ? `  ·  ${t('trip_via')} ${localizePlace(transit, lang)}` : ''}
        {'  →  '}
        {localizePlace(to, lang)}
      </Text>

      <View style={s.mapWrap} testID={hasLivePoint ? 'trip-live-map' : 'trip-planned-map'}>
        <TruckMap
          lat={hasLivePoint ? lat : undefined}
          lng={hasLivePoint ? lng : undefined}
          title={driverName || t('track_truck_marker')}
          routePoints={routePoints}
          planned={!hasLivePoint}
          plannedTitle={t('planned_route_title')}
          plannedHint={t('tracking_starts_after_start')}
          liveTitle={t('live_route_title')}
          showBadge={false}
          onRouteSummary={handleSummary}
          vehicle={vehicle}
        />
        {locationLoading && trackingActive && !hasLivePoint ? (
          <View style={s.loadingPill} pointerEvents="none">
            <ActivityIndicator size="small" color="#168759" />
          </View>
        ) : null}
      </View>

      {routeSummary ? (
        <View style={[s.metrics, { borderTopColor: theme.border }]} testID="route-map-real-metrics">
          <View style={s.metric}>
            <Text style={[s.metricLabel, { color: theme.textMuted }]}>{t('distance')}</Text>
            <Text style={[s.metricValue, { color: theme.text }]}>{routeSummary.distanceText}</Text>
          </View>
          <View style={[s.metricDivider, { backgroundColor: theme.border }]} />
          <View style={s.metric}>
            <Text style={[s.metricLabel, { color: theme.textMuted }]}>{t('delivery_time')}</Text>
            <Text style={[s.metricValue, { color: theme.text }]}>{routeSummary.durationText}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingTop: 11 },
  title: { fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.35 },
  route: { fontSize: 14, fontWeight: '800', paddingHorizontal: 12, paddingTop: 5, paddingBottom: 10 },
  mapWrap: { height: 250, position: 'relative', overflow: 'hidden', backgroundColor: '#EAF1ED' },
  loadingPill: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)' },
  metrics: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 9 },
  metric: { flex: 1 },
  metricLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  metricValue: { fontSize: 16, fontWeight: '900', marginTop: 2 },
  metricDivider: { width: 1, alignSelf: 'stretch', marginHorizontal: 12 },
});
