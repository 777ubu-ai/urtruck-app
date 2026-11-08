import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { v1Colors, v1Radius, v1Spacing, v1Typography } from '../../theme/designV1';

export default function PrimaryButton({
  label, onPress, variant = 'primary', loading = false, disabled = false, style,
}) {
  const isDisabled = disabled || loading;
  // Светлая тема: у secondary фон — зелёный тинт, текст — тёмно-зелёный.
  // Белый текст на surfaceMuted (#F0F4F2) был невидим после light-флипа.
  const bg = variant === 'primary' ? v1Colors.driver
    : variant === 'secondary' ? v1Colors.driverSoft
    : 'transparent';
  const textColor = variant === 'ghost' ? v1Colors.textMuted
    : variant === 'secondary' ? v1Colors.driverDeep
    : '#fff';
  const borderColor = variant === 'ghost' ? v1Colors.border : 'transparent';

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
    paddingVertical: v1Spacing.md,
    paddingHorizontal: v1Spacing.xl,
    borderRadius: v1Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 50,
  },
  label: {
    // v3 title was { fontSize: 15, fontWeight: '600', lineHeight: 20 }.
    ...v1Typography.button,
    lineHeight: 20,
  },
});
