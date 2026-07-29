// FilterChips — horizontal pill row with dropdown chevron.
// Each chip is { key, icon, label, active, onPress }. Active state highlights
// with the role accent (emerald/orange) — caller passes accent color.

import React from 'react';
import { ScrollView, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius } from '../../../theme/designV1';

export default function FilterChips({ items = [], accent }) {
  const colors = useV1Colors();
  const activeAccent = accent || colors.driver;
  const inactiveText = colors.textMuted;
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
          testID={it.testID || `feed-chip-${it.key}`}
          style={[
            s.chip,
            it.active
              ? { borderColor: activeAccent, backgroundColor: `${activeAccent}1A` }
              : { borderColor: colors.border, backgroundColor: 'transparent' },
          ]}
        >
          {it.icon ? <Text style={[s.icon, { color: it.active ? activeAccent : inactiveText }]}>{it.icon}</Text> : null}
          <Text style={[s.label, { color: it.active ? activeAccent : inactiveText }]} numberOfLines={1}>
            {it.label}
          </Text>
          <Text style={[s.caret, { color: it.active ? activeAccent : inactiveText }]}>⌄</Text>
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
