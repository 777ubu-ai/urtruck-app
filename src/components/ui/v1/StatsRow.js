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

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  cell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: v1Radius.field,
    borderWidth: 1,
  },
  icon: { fontSize: 12, opacity: 0.55, marginBottom: 4 },
  value: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  label: { fontSize: 11, marginTop: 2 },
});
