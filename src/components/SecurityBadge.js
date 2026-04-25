import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { securityAPI, COLOR_UI } from '../utils/security';

// Бейдж скоринга 0-100 с цветовым кодом
export default function SecurityBadge({ userId, phone, plate, compact = false }) {
  const { theme } = useTheme();
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Получаем текущий score
      let s = userId ? await securityAPI.getScore(userId) : null;
      // 2. Если нет — запускаем полную проверку
      if (!s || s.total_score == null || s.message) {
        const f = await securityAPI.fullCheck({
          user_id: userId || 'anon-' + Date.now(),
          phone, plate,
          has_insurance: true, experience_years: 3, completed_trips: 5,
          positive_reviews: 4, negative_reviews: 0,
        });
        if (f) s = f;
      }
      if (!cancelled) { setScore(s); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId, phone, plate]);

  if (loading) {
    return (
      <View style={[s.wrap, { backgroundColor: theme.border, borderColor: theme.border }]}>
        <ActivityIndicator size="small" color={theme.textMuted} />
        <Text style={[s.label, { color: theme.textMuted }]}>Проверка...</Text>
      </View>
    );
  }

  if (!score) {
    return (
      <View style={[s.wrap, { backgroundColor: '#78716C20', borderColor: '#78716C' }]}>
        <Text style={s.score}>—</Text>
        <Text style={[s.label, { color: theme.textMuted }]}>Не проверен</Text>
      </View>
    );
  }

  const ui = COLOR_UI[score.color_code] || COLOR_UI.yellow;

  if (compact) {
    return (
      <View style={[s.wrapCompact, { backgroundColor: ui.bg, borderColor: ui.border }]}>
        <Text style={[s.scoreCompact, { color: ui.text }]}>{score.total_score}</Text>
        <Text style={[s.labelCompact, { color: ui.text }]}>{ui.label.split(' ')[0]}</Text>
      </View>
    );
  }

  // Для публичного показа — только балл + цветная метка (без внутренней разбивки по 6 компонентам)
  return (
    <View style={[s.wrap, { backgroundColor: ui.bg, borderColor: ui.border }]}>
      <Text style={[s.score, { color: ui.text }]}>{score.total_score}<Text style={s.small}>/100</Text></Text>
      <Text style={[s.label, { color: ui.text }]}>{ui.label}</Text>
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
