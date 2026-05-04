// Textarea — multi-line variant of Field, used in create-route/cargo for
// "Комментарий" block. Stage 6: theme-aware.

import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius, v1Spacing, v1Typography } from '../../../theme/designV1';

export default function Textarea({ icon, label, value, onChangeText, placeholder, minHeight = 80, testID }) {
  const colors = useV1Colors();
  return (
    <View
      style={[
        s.row,
        { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: v1Spacing.sm },
      ]}
    >
      {icon ? <Text style={[s.icon, { color: colors.textMuted }]}>{icon}</Text> : null}
      <View style={{ flex: 1 }}>
        {label ? <Text style={[v1Typography.small, { color: colors.textDim, marginBottom: 4 }]}>{label}</Text> : null}
        <TextInput
          style={[s.input, { color: colors.text, minHeight }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
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
    borderWidth: 1,
    borderRadius: v1Radius.field,
  },
  icon: { fontSize: 16, width: 20, textAlign: 'center', paddingTop: 4 },
  input: { fontSize: 14, paddingVertical: 0, margin: 0 },
});
