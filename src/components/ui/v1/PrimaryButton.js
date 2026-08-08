// PrimaryButton — large pill CTA. Defaults to driver-emerald; pass
// accent="cargo" to switch to orange (used on cargo-owner flow).

import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { v1Colors, v1Radius, v1Typography } from '../../../theme/designV1';

export default function PrimaryButton({ label, onPress, loading, disabled, accent = 'driver', style, testID }) {
  // PR-D1 (build 18): driver-кнопка теперь #00E676 — белый текст на нём
  // нечитаем (контраст 2.07:1). Берём чёрный текст (driverOnAccent),
  // даёт 11.4:1 — WCAG AAA. Для cargo (#FF8400) контраст с белым
  // тоже слабый, переводим на чёрный — 8.6:1.
  const isDriver = accent !== 'cargo';
  const color = isDriver ? v1Colors.driver : v1Colors.cargoOwner;
  const textColor = v1Colors.driverOnAccent;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      testID={testID}
      style={[s.btn, { backgroundColor: color, shadowColor: color, opacity: disabled ? 0.5 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[s.text, { color: textColor }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    height: 48,
    borderRadius: v1Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  // color теперь устанавливается inline (зависит от accent)
  text: { ...v1Typography.button, color: undefined },
});
