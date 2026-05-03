// SearchBar — pill input used on home feeds (07 / 08).
// Single-line, leading 🔍 emoji, optional clear (✕) on the right when value
// is non-empty.

import React from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { v1Colors, v1Radius } from '../../../theme/designV1';

export default function SearchBar({ value, onChangeText, placeholder, onClear, testID }) {
  return (
    <View style={s.row}>
      <Text style={s.icon}>🔍</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={v1Colors.placeholder}
        returnKeyType="search"
        testID={testID}
      />
      {value ? (
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.clear}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: v1Colors.surface,
    borderColor: v1Colors.border, borderWidth: 1,
    borderRadius: v1Radius.pill,
    gap: 10,
  },
  icon: { fontSize: 14, color: v1Colors.textMuted },
  input: { flex: 1, color: v1Colors.text, fontSize: 14, paddingVertical: 0 },
  clear: { color: v1Colors.textMuted, fontSize: 14, paddingHorizontal: 4 },
});
