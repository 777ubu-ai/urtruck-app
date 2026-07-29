// SearchBar — pill input used on home feeds (07 / 08).
// Single-line, leading 🔍 emoji, optional clear (✕) on the right when
// value is non-empty. Stage 6: theme-aware.

import React from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1Radius } from '../../../theme/designV1';

export default function SearchBar({ value, onChangeText, placeholder, onClear, testID }) {
  const colors = useV1Colors();
  return (
    <View
      style={[
        s.row,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Feather name="search" size={15} color={colors.textMuted} />
      <TextInput
        style={[s.input, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        returnKeyType="search"
        testID={testID}
      />
      {value ? (
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={15} color={colors.textMuted} style={s.clear} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1,
    borderRadius: v1Radius.pill,
    gap: 10,
  },
  icon: { fontSize: 14 },
  input: { flex: 1, fontSize: 14, paddingVertical: 0 },
  clear: { fontSize: 14, paddingHorizontal: 4 },
});
