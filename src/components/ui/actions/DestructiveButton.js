// Опасное действие: контур red-500, БЕЗ заливки. Заливка появляется только на
// pressed-state (activeOpacity + быстрая подсветка). Так «Отклонить» не
// перекрикивает «Принять» — visually cheaper, читается как второстепенное.
// Высота 48px. НЕ 56 — этот CTA не должен претендовать на primary.

import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';

const RED = '#EF4444';

export default function DestructiveButton({
  label,
  icon,
  onPress,
  loading = false,
  disabled = false,
  testID,
  style,
}) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[s.btn, { borderColor: RED, opacity: isDisabled ? 0.55 : 1 }, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={RED} size="small" />
      ) : (
        <View style={s.row}>
          {icon ? <Text style={[s.icon, { color: RED }]}>{icon}</Text> : null}
          <Text style={[s.label, { color: RED }]} numberOfLines={1}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  icon: { fontSize: 12, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700' },
});
