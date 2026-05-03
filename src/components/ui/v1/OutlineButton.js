// OutlineButton — secondary action (Apple / Google placeholders, "Войти", etc.).
// Borderless on demand (`subtle`) for tertiary text-only buttons.

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { v1Colors, v1Radius, v1Typography } from '../../../theme/designV1';

export default function OutlineButton({ label, icon, onPress, disabled, subtle, accent, style, testID }) {
  const tint = accent === 'cargo' ? v1Colors.cargoOwner : v1Colors.driver;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      testID={testID}
      style={[
        s.btn,
        subtle ? null : { borderColor: v1Colors.borderStrong, borderWidth: 1, backgroundColor: v1Colors.surface },
        accent ? { borderColor: tint } : null,
        disabled ? { opacity: 0.5 } : null,
        style,
      ]}
    >
      {icon ? <Text style={s.icon}>{icon}</Text> : null}
      <Text style={[s.text, accent ? { color: tint } : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    height: 50,
    borderRadius: v1Radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  icon: { fontSize: 18 },
  text: { ...v1Typography.body, fontWeight: '700' },
});
