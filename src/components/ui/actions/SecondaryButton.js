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
        <Text style={[s.label, { color: theme.text }]} numberOfLines={numberOfLines} ellipsizeMode="tail">{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  // flex:1 — сохранён для случаев, когда SecondaryButton всё же ставят в
  // ряд (сейчас таких мест не осталось, но не ломаем API); одиночное
  // использование в вертикальном стеке (alignItems:'stretch' родителя)
  // всё равно тянется на всю ширину благодаря SAFE_BUTTON_STYLE.
  btn: {
    ...SAFE_BUTTON_STYLE,
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  row: { ...SAFE_ROW_STYLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  icon: { ...SAFE_ICON_STYLE, fontSize: safeFontSize(16) },
  label: { ...SAFE_LABEL_STYLE, fontSize: safeFontSize(14), fontWeight: '700' },
});
