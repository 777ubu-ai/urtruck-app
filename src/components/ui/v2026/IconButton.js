// Design System 2026 — IconButton (§9 touch targets, §15 icons, §64 a11y).
// Visual icon 20–24 inside a guaranteed 44/48 target. Accessible label is
// MANDATORY for icon-only buttons (not just a bell glyph — "Уведомления").
import React from 'react';
import { TouchableOpacity, Platform, StyleSheet, View, Text } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTokens, type2026, metrics2026 } from '../../theme/tokens2026';

export default function IconButton2026({
  icon,                 // Feather icon name — single icon system (§15)
  onPress,
  accessibilityLabel,   // required
  size = metrics2026.iconMd,
  color,
  badge = 0,            // numeric badge per §30; >99 → "99+"
  dot = false,          // dot badge per §30 ("there is new", no number)
  disabled = false,
  style,
}) {
  const t = useTokens();
  const target = Platform.OS === 'ios' ? metrics2026.touchTargetIos : metrics2026.touchTargetAndroid;
  const resolvedColor = color || t['text.primary'];

  if (!accessibilityLabel && __DEV__) {
    console.warn(`IconButton2026: accessibilityLabel is required (icon="${icon}")`);
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={metrics2026.hitSlop}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
      style={[s.btn, { width: target, height: target, opacity: disabled ? 0.5 : 1 }, style]}
    >
      <Feather name={icon} size={size} color={resolvedColor} />
      {badge > 0 && (
        <Badge2026Count value={badge} />
      )}
      {dot && badge === 0 && (
        <Badge2026Dot />
      )}
    </TouchableOpacity>
  );
}

// Inline minimal badge renderers to keep IconButton self-contained; the full
// Badge primitive lives in ./BadgeChip and is what product code should use.
function Badge2026Count({ value }) {
  const t = useTokens();
  const label = value > 99 ? '99+' : String(value);
  return (
    <View style={[s.count, {
      backgroundColor: t['status.danger.main'],
      borderColor: t['surface.card'],
      minWidth: metrics2026.badgeHeight,
      height: metrics2026.badgeHeight,
      paddingHorizontal: 5,
    }]}>
      <Text maxFontSizeMultiplier={1.15} style={[type2026.badge, { color: '#FFFFFF', fontSize: 10.5 }]}>
        {label}
      </Text>
    </View>
  );
}

function Badge2026Dot() {
  const t = useTokens();
  return (
    <View style={[s.dot, {
      width: metrics2026.badgeDot,
      height: metrics2026.badgeDot,
      borderRadius: metrics2026.badgeDot / 2,
      backgroundColor: t['status.danger.main'],
      borderColor: t['surface.card'],
    }]} />
  );
}

const s = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center' },
  count: {
    position: 'absolute', top: 2, right: 0,
    borderRadius: 999, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  dot: {
    position: 'absolute', top: 5, right: 4,
    borderWidth: 2,
  },
});
