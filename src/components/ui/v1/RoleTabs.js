// RoleTabs — driver/cargo-owner segment switcher used on signup & profile.
// One side is filled with its accent (selected), the other is outlined.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius, v1Typography, v1AccentFor } from '../../../theme/designV1';

export default function RoleTabs({ value, onChange, t }) {
  const colors = useV1Colors();
  return (
    <View style={s.row}>
      <Tab
        active={value === 'driver'}
        accent={v1AccentFor('driver')}
        idle={colors}
        emoji="🚚"
        label={t('role_driver_title')}
        onPress={() => onChange('driver')}
      />
      <Tab
        active={value === 'client'}
        accent={v1AccentFor('client')}
        idle={colors}
        emoji="📦"
        label={t('role_client_title')}
        onPress={() => onChange('client')}
      />
    </View>
  );
}

function Tab({ active, accent, idle, emoji, label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        s.tab,
        active
          ? { backgroundColor: accent.soft, borderColor: accent.main }
          : { backgroundColor: 'transparent', borderColor: idle.border },
      ]}
    >
      <Text style={s.emoji}>{emoji}</Text>
      <Text style={[s.label, { color: active ? accent.main : idle.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: v1Radius.pill,
    borderWidth: 1,
  },
  emoji: { fontSize: 16 },
  label: { ...v1Typography.body, fontWeight: '700' },
});
