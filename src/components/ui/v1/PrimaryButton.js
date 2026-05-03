// PrimaryButton — large pill CTA. Defaults to driver-emerald; pass
// accent="cargo" to switch to orange (used on cargo-owner flow).

import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { v1Colors, v1Radius, v1Typography } from '../../../theme/designV1';

export default function PrimaryButton({ label, onPress, loading, disabled, accent = 'driver', style, testID }) {
  const color = accent === 'cargo' ? v1Colors.cargoOwner : v1Colors.driver;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      testID={testID}
      style={[s.btn, { backgroundColor: color, shadowColor: color, opacity: disabled ? 0.5 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.text}>{label}</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    height: 54,
    borderRadius: v1Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  text: { ...v1Typography.button },
});
