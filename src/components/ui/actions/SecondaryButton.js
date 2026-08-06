// Вторичное действие: прозрачный фон, серая граница, текст акцентом роли.
// Высота 48px (не 56 — не спорит с primary CTA). Используется парами (Чат/Торг).

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { v1AccentFor } from '../../../theme/designV1';
import { useTheme } from '../../../utils/ThemeContext';
import { SAFE_BUTTON_STYLE, SAFE_ROW_STYLE, SAFE_ICON_STYLE, SAFE_LABEL_STYLE, safeFontSize } from './safeButtonStyles';

export default function SecondaryButton({
  label,
  icon,
  onPress,
  role = 'client',
  disabled = false,
  testID,
  style,
  numberOfLines = 1,
  fullWidth = false,
}) {
  const accent = v1AccentFor(role);
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        s.btn,
        fullWidth ? s.fullWidth : s.compact,
        { borderColor: theme.border, opacity: disabled ? 0.55 : 1 },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
    >
      <View style={s.row}>
        {icon ? <Text style={[s.icon, { color: accent.main }]}>{icon}</Text> : null}
        <Text style={[s.label, { color: theme.text }]} numberOfLines={numberOfLines} ellipsizeMode="tail">{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    ...SAFE_BUTTON_STYLE,
    height: 48,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'transparent',
  },
  compact: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    flexGrow: 0,
    flexShrink: 1,
  },
  fullWidth: {
    width: '100%',
    alignSelf: 'stretch',
    flexGrow: 0,
    flexShrink: 1,
  },
  row: { ...SAFE_ROW_STYLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  icon: { ...SAFE_ICON_STYLE, fontSize: safeFontSize(16) },
  label: { ...SAFE_LABEL_STYLE, fontSize: safeFontSize(14), fontWeight: '700', textAlign: 'center' },
});
