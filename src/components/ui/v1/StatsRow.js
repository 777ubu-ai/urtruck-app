// StatsRow — three small stat chips used on My Trips / My Cargoes (11/12).
// Each item: { icon, value, label }. Accent recolors the icon tile.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { v1Colors, v1Radius } from '../../../theme/designV1';

export default function StatsRow({ items = [], accent = v1Colors.driver }) {
  return (
    <View style={s.row}>
      {items.map((it, i) => (
        <View key={i} style={s.cell}>
          <View style={[s.iconBox, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
            <Text style={s.icon}>{it.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.value}>{it.value}</Text>
            <Text style={s.label} numberOfLines={1}>{it.label}</Text>
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
    backgroundColor: v1Colors.surface,
    borderColor: v1Colors.border, borderWidth: 1,
  },
  iconBox: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 16 },
  value: { color: v1Colors.text, fontSize: 15, fontWeight: '900' },
  label: { color: v1Colors.textMuted, fontSize: 10 },
});
