// Опасное действие: контур red-500, БЕЗ заливки. Заливка появляется только на
// pressed-state (activeOpacity + быстрая подсветка). Так «Отклонить» не
// перекрикивает «Принять» — visually cheaper, читается как второстепенное.
// Высота 48px. НЕ 56 — этот CTA не должен претендовать на primary.

import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../../utils/ThemeContext';
import { SAFE_BUTTON_STYLE, SAFE_ROW_STYLE, SAFE_ICON_STYLE, SAFE_LABEL_STYLE, safeFontSize } from './safeButtonStyles';

const RED = '#EF4444';
const ICONS = {
  '✕': 'x',
  '↩': 'corner-up-left',
  '⊘': 'trash-2',
};

export default function DestructiveButton({
  label,
  icon,
  onPress,
  loading = false,
  disabled = false,
  testID,
  style,
  numberOfLines = 1,
  fullWidth = false,
}) {
  const isDisabled = disabled || loading;
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        s.btn,
        fullWidth ? s.fullWidth : s.compact,
        { backgroundColor: theme.card, borderColor: RED, opacity: isDisabled ? 0.55 : 1 },
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={4}
    >
      {loading ? (
        <ActivityIndicator color={RED} size="small" />
      ) : (
        <View style={s.row}>
          {icon ? <Feather name={ICONS[icon] || icon} size={20} color={RED} style={s.icon} /> : null}
          <Text style={[s.label, { color: RED }]} numberOfLines={numberOfLines} ellipsizeMode="tail">{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    ...SAFE_BUTTON_STYLE,
    height: 52,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
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
  row: { ...SAFE_ROW_STYLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  icon: { ...SAFE_ICON_STYLE },
  label: { ...SAFE_LABEL_STYLE, fontSize: safeFontSize(16), fontWeight: '700', textAlign: 'center' },
});
