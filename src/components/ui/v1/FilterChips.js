// FilterChips — compact premium filter controls with a clear active state.
import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1Radius } from '../../../theme/designV1';

export default function FilterChips({ items = [], accent }) {
  const colors = useV1Colors();
  const activeAccent = accent || colors.driver;
  const inactiveText = colors.textMuted;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scroll}>
      {items.map((it) => (
        <TouchableOpacity
          key={it.key}
          onPress={it.onPress}
          activeOpacity={0.78}
          accessibilityRole="button"
          testID={it.testID || `feed-chip-${it.key}`}
          style={[
            s.chip,
            it.active
              ? { borderColor: `${activeAccent}55`, backgroundColor: `${activeAccent}12` }
              : { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          {it.icon ? <Text style={[s.icon, { color: it.active ? activeAccent : inactiveText }]}>{it.icon}</Text> : null}
          <Text style={[s.label, { color: it.active ? activeAccent : inactiveText }]} numberOfLines={1}>{it.label}</Text>
          <Feather name="chevron-down" size={14} color={it.active ? activeAccent : inactiveText} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 8, paddingVertical: 5 },
  chip: {
    minHeight: 40,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: v1Radius.pill, borderWidth: 1,
  },
  icon: { fontSize: 12 },
  label: { fontSize: 13, fontWeight: '700', maxWidth: 118 },
});
