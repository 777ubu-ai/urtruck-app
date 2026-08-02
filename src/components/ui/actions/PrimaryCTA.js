// Дизайн-система 2026: primary CTA — одно главное действие на экране.
// Высота 56px, role-accent фон, черный/белый текст по контрасту (onAccent из
// v1AccentFor). При успехе (success=true) — семантический зелёный #22C55E
// (не driver-неон), плюс галочка и заблокированное состояние. Иерархия:
// primary 56 > secondary 48 > destructive 48. Одна кнопка на экран.

import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import { v1AccentFor } from '../../../theme/designV1';

const SUCCESS_GREEN = '#22C55E';
const SUCCESS_ON = '#FFFFFF';

export default function PrimaryCTA({
  label,
  icon,
  onPress,
  role = 'client',
  loading = false,
  disabled = false,
  success = false,
  testID,
  style,
}) {
  const accent = v1AccentFor(role);
  const bg = success ? SUCCESS_GREEN : accent.main;
  const fg = success ? SUCCESS_ON : accent.onAccent;
  const isDisabled = disabled || loading || success;

  return (
    <TouchableOpacity
      style={[s.btn, { backgroundColor: bg, opacity: (disabled && !success) || loading ? 0.55 : 1 }, style]}
      onPress={success ? undefined : onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={s.row}>
          {icon ? <Text style={[s.icon, { color: fg }]}>{icon}</Text> : null}
          <Text style={[s.label, { color: fg }]} numberOfLines={1}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  // 56px — стандарт primary CTA (Apple HIG, Material 3). Не 44 (это mini).
  btn: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 16, fontWeight: '800', letterSpacing: 0.1 },
});
