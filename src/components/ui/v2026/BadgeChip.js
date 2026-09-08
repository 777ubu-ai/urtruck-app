// Design System 2026 — Badge (§30) and Chip (§10/§63).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTokens, type2026, metrics2026, radius2026 } from '../../../theme/tokens2026';

export function Badge2026({ value, dot = false, tone = 'status.danger.main', style }) {
  const t = useTokens();
  if (dot) {
    return (
      <View style={[s.dot, {
        width: metrics2026.badgeDot, height: metrics2026.badgeDot,
        borderRadius: metrics2026.badgeDot / 2,
        backgroundColor: t[tone], borderColor: t['surface.card'],
      }, style]} />
    );
  }
  const label = Number(value) > 99 ? '99+' : String(value);
  return (
    <View style={[s.count, {
      backgroundColor: t[tone], borderColor: t['surface.card'],
      minWidth: metrics2026.badgeHeight, height: metrics2026.badgeHeight,
      paddingHorizontal: 5,
    }, style]}>
      <Text maxFontSizeMultiplier={1.15} style={[type2026.badge, { color: '#FFFFFF', fontSize: 10.5 }]}>
        {label}
      </Text>
    </View>
  );
}

/** Status chip (§10): soft bg + readable fg, never a saturated plate.
 *  Filter/action chip (§63) via `kind="filter"`. */
export function Chip2026({
  label, icon, tone = 'status.neutral', kind = 'status',
  selected = false, onPress, accessibilityLabel, style,
}) {
  const t = useTokens();
  const isFilter = kind === 'filter';
  const height = isFilter ? metrics2026.chipHeight : metrics2026.statusChipHeight;
  const bg = selected || !isFilter ? t[`${tone}.soft`] : t['surface.muted'];
  const fg = selected || !isFilter ? t[`${tone}.main`] : t['text.secondary'];

  const content = (
    <View style={[s.chip, {
      height, backgroundColor: bg, paddingHorizontal: isFilter ? 12 : 11,
      borderColor: isFilter && selected ? t[`${tone}.main`] : 'transparent',
    }, style]}>
      {icon}
      <Text maxFontSizeMultiplier={1.2}
        style={[isFilter ? type2026.buttonCompact : type2026.caption, { color: fg, fontWeight: '600' }]}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected }} activeOpacity={0.75} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  count: { borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { borderWidth: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: radius2026.pill, borderWidth: 1,
  },
});
