// Checkbox — emerald/orange tick aligned to the left of a label.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { v1Colors, v1Typography } from '../../../theme/designV1';

export default function Checkbox({ value, onToggle, label, accent = 'driver', testID }) {
  const color = accent === 'cargo' ? v1Colors.cargoOwner : v1Colors.driver;
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8} style={s.row} testID={testID}>
      <View style={[s.box, value ? { backgroundColor: color, borderColor: color } : { borderColor: v1Colors.borderStrong }]}>
        {value ? <Text style={s.tick}>✓</Text> : null}
      </View>
      <Text style={s.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  box: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  tick: { color: '#0A0A0A', fontSize: 12, fontWeight: '900', lineHeight: 14 },
  label: { ...v1Typography.bodyMd, flex: 1, lineHeight: 18 },
});
