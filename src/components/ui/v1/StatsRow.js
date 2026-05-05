// StatsRow — three small stat chips used on My Trips / My Cargoes (11/12).
// Each item: { icon, value, label }. Accent recolors the icon tile.
// Stage 6: theme-aware fill / border / labels.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius } from '../../../theme/designV1';

export default function StatsRow({ items = [], accent }) {
  const colors = useV1Colors();
  const tint = accent || colors.driver;
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
          <View style={[s.iconBox, { backgroundColor: `${tint}22`, borderColor: `${tint}55` }]}>
            <Text style={s.icon}>{it.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.value, { color: colors.text }]}>{it.value}</Text>
            <Text style={[s.label, { color: colors.textMuted }]} numberOfLines={1}>{it.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  cell: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: v1Radius.field,
    borderWidth: 1,
  },
  iconBox: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 16 },
  value: { fontSize: 15, fontWeight: '900' },
  label: { fontSize: 10 },
});
