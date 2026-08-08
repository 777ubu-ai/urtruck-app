import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/theme';

export default function PrimaryButton({
  label, onPress, variant = 'primary', loading = false, disabled = false, style,
}) {
  const isDisabled = disabled || loading;
  // Светлая тема: у secondary фон — зелёный тинт, текст — тёмно-зелёный.
  // Белый текст на surface2 (#F0F4F2) был невидим после light-флипа.
  const bg = variant === 'primary' ? colors.green
    : variant === 'secondary' ? colors.greenMuted
    : 'transparent';
  const textColor = variant === 'ghost' ? colors.textMuted
    : variant === 'secondary' ? colors.greenDeep
    : '#fff';
  const borderColor = variant === 'ghost' ? colors.border : 'transparent';

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

const s = StyleSheet.create({
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
