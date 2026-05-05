// Checkbox — emerald/orange tick aligned to the left of a label.
// Stage 6: theme-aware label colour, theme-aware empty-box border.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useV1Colors, v1Typography } from '../../../theme/designV1';

export default function Checkbox({ value, onToggle, label, accent = 'driver', testID }) {
  const colors = useV1Colors();
  const color = accent === 'cargo' ? colors.cargoOwner : colors.driver;
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8} style={s.row} testID={testID}>
      <View
        style={[
          s.box,
          value
            ? { backgroundColor: color, borderColor: color }
            : { borderColor: colors.borderStrong },
        ]}
      >
        {value ? <Text style={s.tick}>✓</Text> : null}
      </View>
      <Text style={[s.label, { color: colors.textMuted }]}>{label}</Text>
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
