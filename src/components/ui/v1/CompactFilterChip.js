import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors } from '../../../theme/designV1';

export default function CompactFilterChip({ icon, label, active = false, onPress, testID, accessibilityLabel }) {
  const colors = useV1Colors();
  return (
    <TouchableOpacity onPress={onPress} testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ selected: active }} style={[s.chip, { borderColor: active ? colors.driver : colors.border, backgroundColor: active ? colors.driverSoft : colors.surface }]}>
      <Feather name={icon} size={16} color={active ? colors.driver : colors.textMuted} />
      {label ? <Text style={[s.label, { color: active ? colors.driver : colors.text }]} numberOfLines={1}>{label}</Text> : null}
      {label ? <Feather name="chevron-down" size={14} color={colors.textMuted} /> : null}
    </TouchableOpacity>
  );
}
const s = StyleSheet.create({ chip: { height: 40, minWidth: 42, paddingHorizontal: 11, borderRadius: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }, label: { fontSize: 13, lineHeight: 18, fontWeight: '600', flexShrink: 1 } });
