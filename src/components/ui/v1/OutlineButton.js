// OutlineButton — secondary action (Apple / Google placeholders,
// "Войти", etc.). Borderless on demand (`subtle`) for tertiary text-only
// buttons. Stage 6: theme-aware fill, border, label.

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius, v1Typography } from '../../../theme/designV1';

export default function OutlineButton({ label, icon, onPress, disabled, subtle, accent, style, testID }) {
  const colors = useV1Colors();
  const tint = accent === 'cargo' ? colors.cargoOwner : colors.driver;
  const labelColor = accent ? tint : colors.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      testID={testID}
      style={[
        s.btn,
        subtle ? null : { borderColor: colors.borderStrong, borderWidth: 1, backgroundColor: colors.surface },
        accent ? { borderColor: tint } : null,
        disabled ? { opacity: 0.5 } : null,
        style,
      ]}
    >
      {icon ? <Text style={s.icon}>{icon}</Text> : null}
      <Text style={[s.text, { color: labelColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    height: 48,
    borderRadius: v1Radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  icon: { fontSize: 18 },
  text: { ...v1Typography.body, fontWeight: '600' },
});
