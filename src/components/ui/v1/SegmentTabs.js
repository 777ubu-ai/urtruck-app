// SegmentTabs — pill row used on My Trips / My Cargoes (11 / 12).
// Items: [{ key, label, count? }]. Active tab is filled with the role accent.

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius } from '../../../theme/designV1';

// variant='underline' — промпт-дизайн клиента: активная вкладка = текст
// акцентом + полоса 3px снизу, без заливки. По умолчанию 'pill' (водитель
// остаётся как был).
export default function SegmentTabs({ items = [], value, onChange, accent, variant = 'pill' }) {
  const colors = useV1Colors();
  const activeAccent = accent || colors.driver;
  const underline = variant === 'underline';
  // QA-аудит P2-5: на 390px длинные RU/KK-лейблы (4 driver-вкладки —
  // «Предложения»/«Завершённые») усекались в «Предложе…». Масштабируем
  // шрифт по числу вкладок + плотный трекинг, чтобы помещались целиком.
  const n = items.length;
  const fontSize = n >= 5 ? 11 : n === 4 ? 12 : 13;
  const letterSpacing = n >= 4 ? -0.3 : 0;
  return (
    <View style={s.row}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <TouchableOpacity
            key={it.key}
            onPress={() => onChange(it.key)}
            activeOpacity={0.85}
            testID={it.testID}
            accessibilityLabel={typeof it.label === 'string' ? it.label : undefined}
            style={[
              s.tab,
              underline
                ? { borderWidth: 0, borderRadius: 0, borderBottomWidth: 3,
                    borderBottomColor: active ? activeAccent : 'transparent',
                    backgroundColor: 'transparent' }
                : active
                ? { backgroundColor: activeAccent, borderColor: activeAccent }
                : { backgroundColor: 'transparent', borderColor: colors.border },
            ]}
          >
            <Text
              style={[s.label, {
                color: underline
                  ? (active ? activeAccent : colors.textMuted)
                  : (active ? '#0A0A0A' : colors.textMuted),
                fontSize, letterSpacing,
              }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {it.label}{it.count != null ? ` · ${it.count}` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flex: 1, paddingVertical: 10,
    borderRadius: v1Radius.pill, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '800' },
});
