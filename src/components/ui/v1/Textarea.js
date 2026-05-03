// Textarea — multi-line variant of Field, used in create-route/cargo for
// "Комментарий" block.

import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { v1Colors, v1Radius, v1Spacing, v1Typography } from '../../../theme/designV1';

export default function Textarea({ icon, label, value, onChangeText, placeholder, minHeight = 80, testID }) {
  return (
    <View style={[s.row, { marginBottom: v1Spacing.sm }]}>
      {icon ? <Text style={s.icon}>{icon}</Text> : null}
      <View style={{ flex: 1 }}>
        {label ? <Text style={s.label}>{label}</Text> : null}
        <TextInput
          style={[s.input, { minHeight }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={v1Colors.placeholder}
          multiline
          textAlignVertical="top"
          testID={testID}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: v1Colors.surface,
    borderColor: v1Colors.border,
    borderWidth: 1,
    borderRadius: v1Radius.field,
  },
  icon: { fontSize: 16, color: v1Colors.textMuted, width: 20, textAlign: 'center', paddingTop: 4 },
  label: { ...v1Typography.small, marginBottom: 4 },
  input: { color: v1Colors.text, fontSize: 14, paddingVertical: 0, margin: 0 },
});
