import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { DRIVER_CERAMIC, v1Radius } from '../../../theme/designV1';

export default function Button({ title, onPress, variant = 'primary', disabled = false, loading = false, icon, fullWidth = false, style, testID, accessibilityLabel }) {
  const theme = variant === 'secondary'
    ? { bg: DRIVER_CERAMIC.activeSoft, border: DRIVER_CERAMIC.border, text: DRIVER_CERAMIC.text }
    : { bg: DRIVER_CERAMIC.surface, border: DRIVER_CERAMIC.border, text: DRIVER_CERAMIC.text };
  const inert = disabled || loading;
  return (
    <TouchableOpacity onPress={inert ? undefined : onPress} disabled={inert} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} accessibilityState={{ disabled: inert, busy: loading }} testID={testID} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={[s.btn, fullWidth && s.fullWidth, { backgroundColor: theme.bg, borderColor: theme.border, opacity: disabled ? 0.38 : 1 }, style]}>
      {loading ? <ActivityIndicator color={theme.text} /> : <>{icon ? <Feather name={icon} size={16} color={theme.text} style={s.icon} /> : null}<Text style={[s.label, { color: theme.text }]}>{title}</Text></>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({ btn: { minHeight: 48, borderRadius: v1Radius.button, borderWidth: 1, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minWidth: 120 }, fullWidth: { alignSelf: 'stretch' }, icon: { marginRight: 8 }, label: { fontSize: 14, fontWeight: '700', letterSpacing: 0.15 } });
