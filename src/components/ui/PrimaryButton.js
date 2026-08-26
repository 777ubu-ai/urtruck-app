import React, { useMemo } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { radius, spacing, typography } from '../../theme/theme';
import { useTheme } from '../../utils/ThemeContext';

// P1 theme-consistency fix (25.08.2026): variant colors now derive from
// ThemeContext instead of the static (light-only) `colors` export in
// theme/theme.js. Brand green stays a semantic constant across both themes
// (CLAUDE.md: "бренд-зелёный ОБЕИХ ролей #168759"); the soft-green
// "secondary" surface and the "ghost" muted text/border must adapt, or a
// ghost button on a dark screen renders invisible light-grey text.
const GREEN = '#168759';
const GREEN_DEEP = '#0F6B47';

export default function PrimaryButton({
  label, onPress, variant = 'primary', loading = false, disabled = false, style,
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(), []);
  const isDisabled = disabled || loading;
  const bg = variant === 'primary' ? GREEN
    : variant === 'secondary' ? theme.cardActive
    : 'transparent';
  const textColor = variant === 'ghost' ? theme.textMuted
    : variant === 'secondary' ? GREEN_DEEP
    : '#fff';
  const borderColor = variant === 'ghost' ? theme.border : 'transparent';

  return (
    <TouchableOpacity
      style={[s.btn, { backgroundColor: bg, borderColor, opacity: isDisabled ? 0.5 : 1 }, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[s.label, { color: textColor }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = () => StyleSheet.create({
  btn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 50,
  },
  label: {
    ...typography.title,
  },
});
