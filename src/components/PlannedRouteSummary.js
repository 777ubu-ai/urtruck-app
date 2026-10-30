// Один запрос планового маршрута; без карты, GPS и периодических обновлений.
import React from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { routingAPI } from '../utils/routingAPI';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { pausedLocationCopy } from '../utils/locationPolicy';

export default function PlannedRouteSummary({ routePoints = [], vehicle = null, enabled = true, onRouteSummary }) {
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const [result, setResult] = React.useState(null);
  const callback = React.useRef(onRouteSummary);
  callback.current = onRouteSummary;
  const requestKey = JSON.stringify({ points: routePoints, vehicle });
  React.useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const request = JSON.parse(requestKey);
    setResult(null);
    if (!enabled) return () => { alive = false; controller.abort(); };
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') { controller.abort(); if (alive) setResult({ ok: false }); }
    });
    if (AppState.currentState === 'active' && request.points.length >= 2) {
      routingAPI.roadRoute(request.points, request.vehicle, { signal: controller.signal, timeoutMs: 15000 })
        .then(value => { if (alive && !controller.signal.aborted) setResult(value); })
        .catch(() => { if (alive) setResult({ ok: false }); });
    } else setResult({ ok: false });
    return () => { alive = false; controller.abort(); listener.remove(); };
  }, [requestKey, enabled]);
  const summary = React.useMemo(() => {
    const meters = Number(result?.distance_m);
    if (!result?.ok || result.distance_m == null || !Number.isFinite(meters) || meters <= 0) return null;
    const km = meters / 1000;
    const distanceText = `${km >= 100 ? Math.round(km) : Math.round(km * 10) / 10} ${t('km_short')}`;
    const seconds = Number(result.duration_s);
    const durationText = result.duration_s != null && Number.isFinite(seconds) && seconds > 0
      ? `${Math.max(1, Math.round(seconds / 60))} ${t('track_min')}` : '—';
    return { distanceText, totalDistanceText: distanceText, durationText, totalDurationText: durationText,
      durationLabelKey: 'delivery_time', isRemaining: false, blocked: false, provider: result.provider };
  }, [result, t, lang]);
  React.useEffect(() => { callback.current?.(summary); }, [summary]);
  return (
    <View style={[s.root, { backgroundColor: theme.card }]} testID="planned-route-no-gps">
      <Text style={[s.title, { color: theme.text }]}>{t('planned_route_title')}</Text>
      <Text style={[s.distance, { color: theme.text }]}>{summary?.distanceText || (result ? t('map_road_route_unavailable') : '…')}</Text>
      <Text style={[s.notice, { color: theme.textMuted }]}>{pausedLocationCopy[lang] || pausedLocationCopy.RU}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 16, fontWeight: '700' },
  distance: { fontSize: 20, fontWeight: '700' },
  notice: { fontSize: 13, lineHeight: 19 },
});
