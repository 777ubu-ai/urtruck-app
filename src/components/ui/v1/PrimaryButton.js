// PrimaryButton — premium B2B primary CTA.
import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius, v1Typography } from '../../../theme/designV1';

export default function PrimaryButton({ label, onPress, loading, disabled, accent = 'driver', style, testID }) {
  const colors = useV1Colors();
  const color = accent === 'cargo' ? colors.cargoOwner : colors.driver;
  const textColor = color;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
      accessibilityRole="button"
      testID={testID}
      style={[s.btn, {
        backgroundColor: colors.surface,
        borderColor: color,
        opacity: disabled ? 0.48 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[s.text, { color: textColor }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: Math.max(v1Radius.button, 14),
    borderWidth: 1,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    // Один современный стиль с кнопками действий: белый фон, цветной контур.
  },
  text: { ...v1Typography.button, color: undefined, fontSize: 15, fontWeight: '700', letterSpacing: 0.15 },
});
