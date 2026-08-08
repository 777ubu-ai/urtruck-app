// OutlineButton — premium secondary/tertiary action.
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius, v1Typography } from '../../../theme/designV1';

export default function OutlineButton({ label, icon, onPress, disabled, subtle, accent, danger = false, style, testID }) {
  const colors = useV1Colors();
  const tint = danger ? colors.error : (accent === 'cargo' ? colors.cargoOwner : colors.driver);
  const emphasized = Boolean(accent || danger);
  const labelColor = emphasized ? tint : colors.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.78}
      accessibilityRole="button"
      testID={testID}
      style={[
        s.btn,
        subtle ? null : {
          borderColor: emphasized ? tint : colors.borderStrong,
          borderWidth: 1,
          backgroundColor: emphasized ? `${tint}0A` : colors.surface,
          shadowColor: colors.shadow || '#000000',
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
        },
        disabled ? { opacity: 0.45 } : null,
        style,
      ]}
    >
      {icon ? <Text style={[s.icon, { color: labelColor }]}>{icon}</Text> : null}
      <Text style={[s.text, { color: labelColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    minHeight: 50,
    borderRadius: Math.max(v1Radius.button, 14),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  icon: { fontSize: 18 },
  text: { ...v1Typography.body, fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },
});
