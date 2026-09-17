import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { v1Colors, v1Spacing, v1Typography } from '../../theme/designV1';
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
    padding: v1Spacing.xxl,
    paddingTop: 60,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: v1Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: v1Spacing.lg,
  },
  icon: {
    color: v1Colors.textDim,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    // v3 h2 was { fontSize: 18, fontWeight: '700', lineHeight: 24 } — kept
    // verbatim on top of the v1 h2 family.
    ...v1Typography.h2,
    fontSize: 18,
    lineHeight: 24,
    color: v1Colors.text,
    textAlign: 'center',
    marginBottom: v1Spacing.sm,
  },
  desc: {
    // v3 body was { fontSize: 14, fontWeight: '400', lineHeight: 20 }.
    ...v1Typography.bodyMd,
    lineHeight: 20,
    color: v1Colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  btn: {
    marginTop: v1Spacing.xl,
    minWidth: 200,
  },
});
