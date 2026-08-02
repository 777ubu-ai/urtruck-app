// StatsRow — three small stat tiles used on My Trips / My Cargoes
// (screens 11 / 12). Each item is { icon, value, label }.
//
// Stage 6: theme-aware fill / border / labels.
//
// Stage 16: visual cleanup. Earlier the tile carried an accent-tinted
// 32×32 emoji box on the left — pretty, but the coloured halo +
// border made every counter look like a tappable button when in
// fact StatsRow only ever rendered <View> wrappers. The component
// is now a compact stat block:
//   * no icon halo (emoji becomes a small muted glyph above the value);
//   * no accent border — neutral surface card with the same hairline
//     border as the rest of the screen;
//   * value rendered large and unaccented (only the screen-level
//     primary CTA stays bright green by design).
//
// `accent` prop is still accepted for API compatibility but no
// longer drives a halo colour. If a caller wants a tappable summary
// they should switch to a regular button.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius } from '../../../theme/designV1';

export default function StatsRow({ items = [] }) {
  const colors = useV1Colors();
  return (
    <View style={s.row}>
      {items.map((it, i) => (
        <View
          key={i}
          style={[
            s.cell,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {it.icon ? (
            <Text style={[s.icon, { color: colors.textMuted }]} numberOfLines={1}>
              {it.icon}
            </Text>
          ) : null}
          <Text style={[s.value, { color: colors.text }]} numberOfLines={1}>
            {it.value}
          </Text>
          <Text style={[s.label, { color: colors.textMuted }]} numberOfLines={1}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Дизайн 2026 v4 (03.08): горизонтальная строка вместо трёх высоких карточек.
// Раньше «2 / 0 / 1» занимали треть экрана вертикально. Теперь одна плоская
// строка ~40px: [📦 2 Мои  🚚 0 Везут  ✅ 1 Доставлено]. Шрифт значения 14,
// label 12 — компакт, помещается больше грузов ниже.
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 6, marginBottom: 10 },
  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  icon: { fontSize: 12, opacity: 0.7 },
  value: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  label: { fontSize: 11, fontWeight: '600' },
});
