// RoleCard — large tappable row used on the Welcome screen (macro 01).
// Two of these stack vertically: emerald (driver), orange (cargo owner).

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useV1Colors, v1Radius, v1Spacing, v1Typography, v1AccentFor } from '../../../theme/designV1';

export default function RoleCard({ role, emoji, title, subtitle, onPress, loading, testID }) {
  const colors = useV1Colors();
  const accent = v1AccentFor(role);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      disabled={!!loading}
      testID={testID}
      style={[
        s.card,
        {
          borderColor: accent.main,
          backgroundColor: colors.surface,
          shadowColor: accent.main,
        },
      ]}
    >
      <View style={[s.iconBox, { backgroundColor: accent.soft, borderColor: accent.main }]}>
        {loading ? (
          <ActivityIndicator color={accent.main} />
        ) : (
          <Text style={s.emoji}>{emoji}</Text>
        )}
      </View>
      <View style={s.body}>
        <Text style={[v1Typography.h2, { color: accent.main }]}>{title}</Text>
        <Text style={[v1Typography.bodyMd, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={2}>{subtitle}</Text>
      </View>
      <Text style={[s.arrow, { color: accent.main }]}>›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: v1Radius.card,
    padding: v1Spacing.md,
    marginBottom: v1Spacing.sm,
    // Subtle outer glow that hints at the role color without dominating
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 30 },
  body: { flex: 1 },
  title: { ...v1Typography.h2 },
  subtitle: { ...v1Typography.bodyMd, marginTop: 2 },
  arrow: { fontSize: 28, fontWeight: '300' },
});
