import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors } from '../../../theme/designV1';
import { useI18n } from '../../../utils/useI18n';

// Shared back control: 44×44 visual + hitSlop 4 → 52dp effective target.
// The accessibility label is localized via t('back') (RU «Назад» /
// ZH «返回» / EN «Back» / KK «Артқа»); callers can still override with
// the `label` prop.
export default function BackButton({ onPress, label, testID = 'back-button', disabled = false }) {
  const colors = useV1Colors();
  const { t } = useI18n();
  const a11yLabel = label || t('back');
  return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.button, { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]} hitSlop={4} testID={testID} accessibilityRole="button" accessibilityLabel={a11yLabel} accessibilityState={{ disabled }}>
    <Feather name="arrow-left" size={22} color={colors.text} />
  </Pressable>;
}

const s = StyleSheet.create({ button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });
