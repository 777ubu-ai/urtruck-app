import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { securityAPI, COLOR_UI } from '../utils/security';
import { useI18n } from '../utils/useI18n';

// Бейдж скоринга 0-100 с цветовым кодом
export default function SecurityBadge({ userId, phone, plate, compact = false }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Показываем ТОЛЬКО реальный скоринг с сервера. Раньше при
      // отсутствии балла отправлялся fullCheck с захардкоженными
      // «хорошими» фактами (страховка есть, стаж 3г, 5 рейсов, 4 отзыва) —
      // и клиент видел «надёжного» водителя, который на деле не проверен.
      // Это подрывало саму идею скоринга. Теперь честно: нет реального
      // балла → бейдж «Новичок / не проверен» (ветка !score ниже).
      let s = userId ? await securityAPI.getScore(userId) : null;
      if (!s || s.total_score == null || s.message) {
        s = null;
      }
      if (!cancelled) { setScore(s); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId, phone, plate]);

  if (loading) {
    return (
      <View style={[s.wrap, { backgroundColor: theme.border, borderColor: theme.border }]}>
        <ActivityIndicator size="small" color={theme.textMuted} />
        <Text style={[s.label, { color: theme.textMuted }]}>{t('security_checking')}</Text>
      </View>
    );
  }

  if (!score) {
    return (
      <View style={[s.wrap, { backgroundColor: '#78716C20', borderColor: '#78716C' }]}>
        <Text style={s.score}>—</Text>
        <Text style={[s.label, { color: theme.textMuted }]}>{t('security_unverified')}</Text>
      </View>
    );
  }

  const ui = COLOR_UI[score.color_code] || COLOR_UI.yellow;

  if (compact) {
    return (
      <View style={[s.wrapCompact, { backgroundColor: ui.bg, borderColor: ui.border }]}>
        <Text style={[s.scoreCompact, { color: ui.text }]}>{score.total_score}</Text>
        <Text style={[s.labelCompact, { color: ui.text }]}>{ui.emoji}</Text>
      </View>
    );
  }

  // Для публичного показа — только балл + цветная метка (без внутренней разбивки по 6 компонентам)
  return (
    <View style={[s.wrap, { backgroundColor: ui.bg, borderColor: ui.border }]}>
      <Text style={[s.score, { color: ui.text }]}>{score.total_score}<Text style={s.small}>/100</Text></Text>
      <Text style={[s.label, { color: ui.text }]}>{`${ui.emoji} ${t(ui.labelKey)}`}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 4 },
  score: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  small: { fontSize: 14, fontWeight: '700', opacity: 0.6 },
  label: { fontSize: 12, fontWeight: '700' },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, justifyContent: 'center' },
  component: { alignItems: 'center', minWidth: 40 },
  compIcon: { fontSize: 14 },
  compValue: { fontSize: 11, fontWeight: '800' },
  wrapCompact: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, alignItems: 'center', flexDirection: 'row', gap: 4 },
  scoreCompact: { fontSize: 13, fontWeight: '900' },
  labelCompact: { fontSize: 14 },
});
