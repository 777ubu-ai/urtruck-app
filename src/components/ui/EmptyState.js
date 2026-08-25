import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, typography } from '../../theme/theme';
import { useTheme } from '../../utils/ThemeContext';
import PrimaryButton from './PrimaryButton';

// P1 theme-consistency fix (25.08.2026): this is the shared empty-state
// pattern (used by MyTripsScreen's "no trips"/"no cargos"/"auth required"
// states, among others) — it must follow ThemeContext, not the static
// (light-only) `colors` export from theme/theme.js.
export default function EmptyState({ title, description, actionLabel, onAction }) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
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

const makeStyles = (theme) => StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: spacing.xxl,
    paddingTop: 60,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: {
    color: theme.textMuted,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    ...typography.h2,
    color: theme.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  desc: {
    ...typography.body,
    color: theme.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  btn: {
    marginTop: spacing.xl,
    minWidth: 200,
  },
});
