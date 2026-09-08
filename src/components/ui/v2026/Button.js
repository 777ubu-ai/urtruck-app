// Design System 2026 — Button family (§7).
// Variants: primary / secondary / tertiary(ghost) / destructive.
// Sizes: standard 48, cta 54, compact 42. Icon-only → IconButton.
// A button never escapes its container: labels wrap (min 2 lines allowed),
// layout must adapt — shrinking text to fit is forbidden (§2.3).
import React from 'react';
import { Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useTokens, type2026, radius2026, metrics2026, componentState2026 } from '../../../theme/tokens2026';
import Text2026 from './Text';

const HEIGHTS = {
  standard: metrics2026.buttonHeight,
  cta: metrics2026.buttonCtaHeight,
  compact: metrics2026.buttonCompactHeight,
};

export default function Button2026({
  label,
  onPress,
  variant = 'primary',      // primary | secondary | tertiary | destructive
  size = 'standard',        // standard | cta | compact
  role,                     // 'shipper' → role.shipper primary; default brand/driver green
  fullWidth = false,
  loading = false,
  disabled = false,
  accessibilityLabel,
  style,
}) {
  const t = useTokens();
  const isDisabled = disabled || loading;

  const main = variant === 'destructive'
    ? t['status.danger.main']
    : role === 'shipper'
      ? t['role.shipper.main']
      : t['brand.primary'];
  const soft = variant === 'destructive'
    ? t['status.danger.soft']
    : role === 'shipper'
      ? t['role.shipper.soft']
      : t['brand.primarySoft'];

  const bg = variant === 'primary' || variant === 'destructive' ? main
    : variant === 'secondary' ? soft
    : 'transparent';
  const fg = variant === 'primary' || variant === 'destructive' ? t['text.onAccent']
    : variant === 'secondary' ? main
    : t['text.secondary'];
  const borderColor = variant === 'tertiary' ? t['border.default'] : 'transparent';

  const typeVariant = size === 'compact' ? 'buttonCompact' : 'button';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || (typeof label === 'string' ? label : undefined)}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        s.btn,
        {
          minHeight: HEIGHTS[size] || HEIGHTS.standard,
          backgroundColor: bg,
          borderColor,
          borderRadius: size === 'compact' ? radius2026.md : radius2026.lg,
          paddingHorizontal: size === 'compact' ? 14 : size === 'cta' ? 24 : 20,
          opacity: isDisabled ? componentState2026.disabledOpacity : pressed ? componentState2026.pressedOpacity : 1,
        },
        fullWidth && s.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <Text2026 variant={typeVariant} style={{ color: fg, textAlign: 'center', flexShrink: 1 }}>
          {label}
        </Text2026>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: 6,
  },
  fullWidth: { alignSelf: 'stretch' },
});
