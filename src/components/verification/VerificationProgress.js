// VerificationProgress — «X из Y пунктов заполнено» + thin track.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useV1Colors } from '../../theme/designV1';
import { useTheme } from '../../utils/ThemeContext';
import { useI18n } from '../../utils/useI18n';

export default function VerificationProgress({ done, total, accent = '#168759' }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <Text style={[s.label, { color: theme.text }]}>
          {done} / {total} · {t('verification_progress_label')}
        </Text>
        <Text style={[s.pct, { color: accent }]}>{pct}%</Text>
      </View>
      <View style={[s.track, { backgroundColor: v1.border }]}>
        <View style={[s.fill, { width: `${pct}%`, backgroundColor: accent }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700' },
  pct: { fontSize: 13, fontWeight: '900' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
