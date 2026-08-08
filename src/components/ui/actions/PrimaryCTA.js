// Дизайн-система 2026: primary CTA — одно главное действие на экране.
// На телефоне кнопка занимает доступную ширину, на desktop/tablet не
// растягивается бесконечной полосой. Для специальных панелей есть fullWidth.

import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import { v1AccentFor } from '../../../theme/designV1';
import { SAFE_BUTTON_STYLE, SAFE_ROW_STYLE, SAFE_ICON_STYLE, SAFE_LABEL_STYLE, safeFontSize } from './safeButtonStyles';

const SUCCESS_GREEN = '#168A5B';
const SUCCESS_ON = '#FFFFFF';

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
  const bg = success ? SUCCESS_GREEN : accent.main;
  const fg = success ? SUCCESS_ON : accent.onAccent;
  const isDisabled = disabled || loading || success;

  return (
    <TouchableOpacity
      style={[
        s.btn,
        fullWidth ? s.fullWidth : s.responsiveWidth,
        { backgroundColor: bg, opacity: (disabled && !success) || loading ? 0.55 : 1 },
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
          {icon ? <Text style={[s.icon, { color: fg }]}>{icon}</Text> : null}
          <Text style={[s.label, { color: fg }]} numberOfLines={numberOfLines} ellipsizeMode="tail">{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    ...SAFE_BUTTON_STYLE,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
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
  icon: { ...SAFE_ICON_STYLE, fontSize: safeFontSize(14), fontWeight: '700' },
  label: { ...SAFE_LABEL_STYLE, fontSize: safeFontSize(14), fontWeight: '800', textAlign: 'center' },
});
