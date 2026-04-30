import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/theme';

export default function SectionCard({ title, children, style }) {
  return (
    <View style={[s.card, style]}>
      {title && <Text style={s.title}>{title}</Text>}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  title: {
    ...typography.caption,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
});
