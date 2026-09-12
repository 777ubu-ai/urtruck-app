import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

const DEFAULT_COLORS = {
  bg: '#F6F8F7',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF3F0',
  border: '#E5ECE8',
  text: '#14221C',
  textMuted: '#617067',
  accent: '#168759',
};

const formatValue = (value, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
};

export default function TripMapInfoSheet({
  copy,
  colors = DEFAULT_COLORS,
  tripNumber,
  routeLabel,
  statusLabel,
  progress = 0,
  metrics = [],
  weather = null,
  nextPoint = null,
  onWeatherPress,
  compact = false,
}) {
  const palette = { ...DEFAULT_COLORS, ...colors };
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  const weatherLabel = weather?.current || copy.weatherUnavailable;
  const weatherAhead = weather?.ahead || copy.weatherUnavailable;
  const nextPointLabel = nextPoint?.name || copy.nextPointUnavailable;
  const nextPointMeta = nextPoint?.meta || '';

  if (compact) {
    return (
      <View style={[s.compactCard, { backgroundColor: palette.surface, borderColor: palette.border }]} testID="deal-map-compact-overlay">
        <View style={s.compactRouteRow}>
          <View style={s.compactRouteCopy}>
            <Text style={[s.compactRoute, { color: palette.text }]} numberOfLines={1}>{routeLabel}</Text>
            <Text style={[s.compactMeta, { color: palette.textMuted }]} numberOfLines={1}>
              {copy.remaining}: {formatValue(metrics.find((item) => item.key === 'remaining')?.value)} · {copy.eta}: {formatValue(metrics.find((item) => item.key === 'eta')?.value)}
            </Text>
          </View>
          <View style={[s.statusPill, { backgroundColor: palette.surfaceMuted }]}>
            <View style={[s.statusDot, { backgroundColor: palette.accent }]} />
            <Text style={[s.statusText, { color: palette.text }]}>{statusLabel}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[s.sheet, { backgroundColor: palette.bg }]}
      contentContainerStyle={s.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      testID="deal-map-info-sheet"
    >
      <View style={[s.sheetCard, { backgroundColor: palette.surface }]}>
        <View style={s.sheetHeader}>
          <View style={s.headerCopy}>
            <Text style={[s.eyebrow, { color: palette.textMuted }]}>{copy.tripNumber} {tripNumber}</Text>
            <Text style={[s.routeTitle, { color: palette.text }]} numberOfLines={1}>{routeLabel}</Text>
          </View>
          <View style={[s.statusPill, { backgroundColor: palette.surfaceMuted }]}>
            <View style={[s.statusDot, { backgroundColor: palette.accent }]} />
            <Text style={[s.statusText, { color: palette.text }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={s.progressHeader}>
          <Text style={[s.progressLabel, { color: palette.textMuted }]}>{copy.progress}</Text>
          <Text style={[s.progressValue, { color: palette.text }]}>{safeProgress}%</Text>
        </View>
        <View style={[s.progressTrack, { backgroundColor: palette.border }]}>
          <View style={[s.progressFill, { width: `${safeProgress}%`, backgroundColor: palette.accent }]} />
        </View>

        <View style={s.metricGrid}>
          {metrics.map((item) => (
            <View key={item.key} style={[s.metricCard, { backgroundColor: palette.surface, borderColor: palette.border }]} testID={`deal-map-metric-${item.key}`}>
              <View style={s.metricIconRow}>
                <Feather name={item.icon || 'circle'} size={18} color={item.accent ? palette.accent : palette.textMuted} />
                <Text style={[s.metricLabel, { color: palette.textMuted }]} numberOfLines={1}>{item.label}</Text>
              </View>
              <Text style={[s.metricValue, { color: palette.text }]} numberOfLines={1}>{formatValue(item.value)}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[s.wideCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={onWeatherPress}
          disabled={!onWeatherPress}
          activeOpacity={0.82}
          testID="deal-map-weather"
        >
          <View style={[s.wideIcon, { backgroundColor: palette.surfaceMuted }]}>
            <Feather name="cloud-rain" size={20} color={palette.textMuted} />
          </View>
          <View style={s.wideCopy}>
            <Text style={[s.wideTitle, { color: palette.text }]} numberOfLines={1}>{copy.weatherNow}: {weatherLabel}</Text>
            <Text style={[s.wideSubtitle, { color: palette.textMuted }]} numberOfLines={1}>{copy.weatherAhead}: {weatherAhead}</Text>
          </View>
          {onWeatherPress ? <Feather name="chevron-right" size={19} color={palette.textMuted} /> : null}
        </TouchableOpacity>

        <View style={[s.wideCard, { backgroundColor: palette.surface, borderColor: palette.border }]} testID="deal-map-next-point">
          <View style={[s.wideIcon, { backgroundColor: palette.surfaceMuted }]}>
            <Feather name="flag" size={20} color={palette.accent} />
          </View>
          <View style={s.wideCopy}>
            <Text style={[s.wideTitle, { color: palette.text }]} numberOfLines={1}>{copy.nextPoint}: <Text style={s.inlineStrong}>{nextPointLabel}</Text></Text>
            {nextPointMeta ? <Text style={[s.wideSubtitle, { color: palette.textMuted }]} numberOfLines={1}>{nextPointMeta}</Text> : null}
          </View>
          <Feather name="chevron-right" size={19} color={palette.textMuted} />
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  sheet: { flex: 1 },
  content: { padding: 10, paddingBottom: 24 },
  sheetCard: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 14, gap: 12, boxShadow: '0 -3px 14px rgba(20,34,28,0.07)' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 12, fontWeight: '700' },
  routeTitle: { fontSize: 23, fontWeight: '900', marginTop: 2 },
  statusPill: { minHeight: 34, borderRadius: 17, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontSize: 13, fontWeight: '800' },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { fontSize: 13, fontWeight: '700' },
  progressValue: { fontSize: 13, fontWeight: '900' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { width: '48%', minHeight: 72, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 10, justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(20,34,28,0.05)' },
  metricIconRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
  metricLabel: { flex: 1, fontSize: 11, fontWeight: '700' },
  metricValue: { fontSize: 17, fontWeight: '900', marginTop: 4 },
  wideCard: { minHeight: 66, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: '0 2px 8px rgba(20,34,28,0.05)' },
  wideIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  wideCopy: { flex: 1, minWidth: 0 },
  wideTitle: { fontSize: 13, fontWeight: '800' },
  wideSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  inlineStrong: { fontWeight: '900' },
  compactCard: { position: 'absolute', left: 12, right: 12, bottom: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, boxShadow: '0 3px 12px rgba(20,34,28,0.12)' },
  compactRouteRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactRouteCopy: { flex: 1, minWidth: 0 },
  compactRoute: { fontSize: 15, fontWeight: '900' },
  compactMeta: { fontSize: 12, fontWeight: '700', marginTop: 3 },
});
