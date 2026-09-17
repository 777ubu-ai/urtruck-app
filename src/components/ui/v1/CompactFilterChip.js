import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';

export default function CompactFilterChip({ icon, label, active = false, onPress, testID, accessibilityLabel, variant = 'default' }) {
  const colors = useV1Colors();
  const ceramic = useDriverCeramicColors();
  const palette = variant === 'driver' ? ceramic : colors;
  return (
    <TouchableOpacity onPress={onPress} testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ selected: active }} style={[s.chip, { borderColor: active ? palette.active || palette.driver : palette.border, backgroundColor: active ? palette.activeSoft || palette.driverSoft : palette.surface }]}>
      <Feather name={icon} size={16} color={active ? palette.active || palette.driver : palette.textMuted} />
      {label ? <Text style={[s.label, { color: active ? palette.active || palette.driver : palette.text }]} numberOfLines={1}>{label}</Text> : null}
      {label ? <Feather name="chevron-down" size={14} color={palette.textMuted} /> : null}
    </TouchableOpacity>
  );
}
const s = StyleSheet.create({ chip: { height: 40, minWidth: 42, paddingHorizontal: 11, borderRadius: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }, label: { fontSize: 13, lineHeight: 18, fontWeight: '600', flexShrink: 1 } });
