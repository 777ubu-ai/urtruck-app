// Button — THE canonical v1 button (Design Bible "Direction B",
// owner-approved 2026-09-09, Commit 1). All new CTAs go through this
// component; do not fork another button style.
//
// Variants:
//   primary     — filled driver-green, white 15/700 label, h 48–52, radius 14
//   secondary   — accentSoft bg (driverSoft), accentDeep text (driverDeep)
//   tertiary    — 1px border, text color, transparent bg
//   destructive — error color (errorDark on dark theme)
//
// Contract: disabled → 38% opacity + inert onPress; loading →
// ActivityIndicator replaces the label with a stable width; icon (Feather
// name) sits 8px before the label; min touch target 44dp (visual height
// 48–52 already covers it; hitSlop guards small overrides).
import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1Radius, v1Typography } from '../../../theme/designV1';

const HEIGHT = 50;
const OPACITY_DISABLED = 0.38;
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

const variantTheme = (colors, variant) => {
  switch (variant) {
    case 'secondary':
      return { bg: colors.driverSoft, border: colors.driverSoft, text: colors.driverDeep };
    case 'tertiary':
      return { bg: 'transparent', border: colors.borderStrong, text: colors.text };
    case 'destructive': {
      const err = colors.errorDark || colors.error;
      return { bg: err, border: err, text: colors.driverOnAccent };
    }
    case 'primary':
    default:
      return { bg: colors.driver, border: colors.driver, text: colors.driverOnAccent };
  }
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  style,
  testID,
  accessibilityLabel,
}) {
  const colors = useV1Colors();
  const t = variantTheme(colors, variant);
  const inert = disabled || loading;
  return (
    <TouchableOpacity
      onPress={inert ? undefined : onPress}
      disabled={inert}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || (typeof title === 'string' ? title : undefined)}
      accessibilityState={{ disabled: inert, busy: loading }}
      testID={testID}
      hitSlop={HIT_SLOP}
      style={[
        s.btn,
        fullWidth && s.fullWidth,
        {
          backgroundColor: t.bg,
          borderColor: t.border,
          opacity: disabled ? OPACITY_DISABLED : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.text} />
      ) : (
        <React.Fragment>
          {icon ? <Feather name={icon} size={16} color={t.text} style={s.icon} /> : null}
          <Text style={[s.label, { color: t.text }]}>{title}</Text>
        </React.Fragment>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    minHeight: HEIGHT,
    borderRadius: v1Radius.button,
    borderWidth: 1,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Stable width in loading state: the ActivityIndicator occupies the
    // same centered row slot as the label, minHeight + fixed padding keep
    // the button box from collapsing.
    minWidth: 120,
  },
  fullWidth: { alignSelf: 'stretch' },
  icon: { marginRight: 8 },
  label: { ...v1Typography.button, fontWeight: '700', letterSpacing: 0.15 },
});
