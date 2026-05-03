// FilterChips — horizontal pill row with dropdown chevron.
// Each chip is { key, icon, label, active, onPress }. Active state highlights
// with the role accent (emerald/orange) — caller passes accent color.

import React from 'react';
import { ScrollView, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { v1Colors, v1Radius } from '../../../theme/designV1';

export default function FilterChips({ items = [], accent = v1Colors.driver }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.scroll}
    >
      {items.map((it) => (
        <TouchableOpacity
          key={it.key}
          onPress={it.onPress}
          activeOpacity={0.85}
          style={[
            s.chip,
            it.active
              ? { borderColor: accent, backgroundColor: `${accent}1A` }
              : { borderColor: v1Colors.border, backgroundColor: 'transparent' },
          ]}
        >
          {it.icon ? <Text style={[s.icon, { color: it.active ? accent : v1Colors.textMuted }]}>{it.icon}</Text> : null}
          <Text style={[s.label, { color: it.active ? accent : v1Colors.textMuted }]} numberOfLines={1}>
            {it.label}
          </Text>
          <Text style={[s.caret, { color: it.active ? accent : v1Colors.textMuted }]}>⌄</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: v1Radius.pill, borderWidth: 1,
  },
  icon: { fontSize: 12 },
  label: { fontSize: 12, fontWeight: '700', maxWidth: 110 },
  caret: { fontSize: 12, fontWeight: '900' },
});
