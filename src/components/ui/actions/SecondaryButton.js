// Вторичное действие: прозрачный фон, серая граница, текст акцентом роли.
// Высота 48px (не 56 — не спорит с primary CTA). Используется парами (Чат/Торг).

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { v1AccentFor } from '../../../theme/designV1';
import { useTheme } from '../../../utils/ThemeContext';

export default function SecondaryButton({
  label,
  icon,
  onPress,
  role = 'client',
  disabled = false,
  testID,
  style,
}) {
  const accent = v1AccentFor(role);
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[s.btn, { borderColor: theme.border, opacity: disabled ? 0.55 : 1 }, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      testID={testID}
    >
      <View style={s.row}>
        {icon ? <Text style={[s.icon, { color: accent.main }]}>{icon}</Text> : null}
        <Text style={[s.label, { color: theme.text }]} numberOfLines={1}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { fontSize: 16 },
  label: { fontSize: 14, fontWeight: '700' },
});
