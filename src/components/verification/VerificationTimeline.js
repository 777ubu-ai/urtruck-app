// VerificationTimeline — три шага «Документы загружены / Проверяем / Завершена».
//
// Используется на PendingReview-экране. Текущий шаг — `current`.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useV1Colors } from '../../theme/designV1';
import { useTheme } from '../../utils/ThemeContext';

export default function VerificationTimeline({ steps = [], current = 0 }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  return (
    <View style={s.wrap}>
      {steps.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;
        const future = idx > current;
        const dotColor = done ? '#16A34A' : active ? '#E06D00' : v1.border;
        const lineColor = done ? '#16A34A' : v1.border;
        return (
          <View key={idx} style={s.row}>
            <View style={s.timelineCol}>
              <View style={[s.dot, { backgroundColor: dotColor }]}>
                {done ? <Text style={s.dotIcon}>✓</Text> : null}
              </View>
              {idx < steps.length - 1 ? (
                <View style={[s.line, { backgroundColor: lineColor }]} />
              ) : null}
            </View>
            <View style={s.bodyCol}>
              <Text style={[
                s.title,
                { color: future ? v1.textMuted : theme.text, fontWeight: active ? '900' : '700' },
              ]}>
                {step.title}
              </Text>
              {step.description ? (
                <Text style={[s.desc, { color: v1.textMuted }]}>{step.description}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 20 },
  row: { flexDirection: 'row', minHeight: 70 },
  timelineCol: { width: 22, alignItems: 'center', paddingTop: 2 },
  dot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dotIcon: { color: '#FFF', fontSize: 11, fontWeight: '900', lineHeight: 13 },
  line: { width: 2, flex: 1, marginTop: 4, marginBottom: 4 },
  bodyCol: { flex: 1, marginLeft: 14 },
  title: { fontSize: 15, marginBottom: 4 },
  desc: { fontSize: 13, lineHeight: 19 },
});
