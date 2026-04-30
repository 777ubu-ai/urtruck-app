import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme/theme';
import PrimaryButton from './PrimaryButton';

export default function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <View style={s.container}>
      <View style={s.iconWrap}>
        <Text style={s.icon}>---</Text>
      </View>
      <Text style={s.title}>{title}</Text>
      {description && <Text style={s.desc}>{description}</Text>}
      {actionLabel && onAction && (
        <PrimaryButton label={actionLabel} onPress={onAction} variant="secondary" style={s.btn} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: spacing.xxl,
    paddingTop: 60,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: {
    color: colors.textDim,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  desc: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  btn: {
    marginTop: spacing.xl,
    minWidth: 200,
  },
});
