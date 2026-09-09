import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors } from '../../../theme/designV1';

export default function BackButton({ onPress, label = 'Назад', testID = 'back-button', disabled = false }) {
  const colors = useV1Colors();
  return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.button, { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]} hitSlop={4} testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}>
    <Feather name="arrow-left" size={22} color={colors.text} />
  </Pressable>;
}

const s = StyleSheet.create({ button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });
