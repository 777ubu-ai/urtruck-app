// Дизайн-система 2026: primary CTA — одно главное действие на экране.
// На телефоне кнопка занимает доступную ширину, на desktop/tablet не
// растягивается бесконечной полосой. Для специальных панелей есть fullWidth.

import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { v1AccentFor } from '../../../theme/designV1';
import { useTheme } from '../../../utils/ThemeContext';
import { SAFE_BUTTON_STYLE, SAFE_ROW_STYLE, SAFE_ICON_STYLE, SAFE_LABEL_STYLE, safeFontSize } from './safeButtonStyles';

const ICONS = {
  '✓': 'check',
  '💬': 'message-circle',
  '📞': 'phone',
};

export default function PrimaryCTA({
  label,
  icon,
  onPress,
  role = 'client',
  loading = false,
  disabled = false,
  success = false,
  fullWidth = false,
  testID,
  style,
  numberOfLines = 1,
}) {
  const accent = v1AccentFor(role);
  const { theme } = useTheme();
  const fg = accent.main;
  const isDisabled = disabled || loading || success;

  return (
    <TouchableOpacity
      style={[
        s.btn,
        fullWidth ? s.fullWidth : s.responsiveWidth,
        {
          backgroundColor: theme.card,
          borderColor: accent.main,
          opacity: (disabled && !success) || loading ? 0.55 : 1,
        },
        style,
      ]}
      onPress={success ? undefined : onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={4}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={s.row}>
          {icon ? <Feather name={ICONS[icon] || icon} size={20} color={fg} style={s.icon} /> : null}
          <Text style={[s.label, { color: fg }]} numberOfLines={numberOfLines} ellipsizeMode="tail">{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    ...SAFE_BUTTON_STYLE,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    // Белая кнопка с аккуратным контуром: без тяжёлой заливки и теней.
  },
  responsiveWidth: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  fullWidth: {
    width: '100%',
    alignSelf: 'stretch',
  },
  row: { ...SAFE_ROW_STYLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  icon: { ...SAFE_ICON_STYLE },
  label: { ...SAFE_LABEL_STYLE, fontSize: safeFontSize(16), fontWeight: '700', textAlign: 'center' },
});
