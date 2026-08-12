// SegmentTabs — pill row used on My Trips / My Cargoes (11 / 12).
// Items: [{ key, label, count?, attentionCount? }]. `count` is the total;
// `attentionCount` is a small notification badge for new/actionable items.

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
            <View style={s.labelRow}>
              <Text
                style={[s.label, {
                  color: underline
                    ? (active ? activeAccent : colors.textMuted)
                    : (active ? '#FFFFFF' : colors.textMuted),
                  fontSize, letterSpacing,
                }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {it.label}{it.count != null ? ` · ${it.count}` : ''}
              </Text>
              {(it.attentionCount || 0) > 0 ? (
                <View style={s.attentionBadge} testID={`${it.testID || it.key}-attention`}>
                  <Text style={s.attentionText}>{it.attentionCount > 9 ? '9+' : it.attentionCount}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Дизайн 2026 v4 (03.08): chip-стиль, компактнее. Раньше 10pt vertical padding
// и жирный 13pt текст — pill'ы толстые. Теперь 6pt padding, шрифт 12,
// gap 6 — плотный ряд табов.
const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flex: 1, minHeight: 44, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 12, fontWeight: '700', flexShrink: 1, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, maxWidth: '100%' },
  attentionBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D64545' },
  attentionText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
});
