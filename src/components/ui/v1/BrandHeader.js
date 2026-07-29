// BrandHeader — top bar with optional back arrow + "UrTruck" wordmark.
//
// `accent` controls the back-arrow color so the header reads emerald
// on the driver flow and orange on the cargo-owner flow.
//
// Stage 16: removed the green "FTL" pill that used to sit next to the
// wordmark. The badge added another bright emerald spot to a header
// that already carries a green back arrow and a green-accented bell;
// the brief was to quiet the screen down to one primary green accent
// per surface.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useV1Colors, v1Typography, v1Spacing } from '../../../theme/designV1';

export default function BrandHeader({ onBack, accent, compact = false }) {
  const colors = useV1Colors();
  const arrowColor = accent || colors.driver;
  return (
    <View style={[s.row, compact && { paddingTop: 8 }]}>
      <View style={s.side}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID="brand-back">
            <Text style={[s.back, { color: arrowColor }]}>‹</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={s.center}>
        <Text style={[v1Typography.brand, { color: colors.text }]}>UrTruck</Text>
      </View>
      <View style={s.side} />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: v1Spacing.md,
    paddingBottom: v1Spacing.sm,
  },
  side: { width: 40 },
  back: { fontSize: 32, fontWeight: '300', lineHeight: 32, paddingHorizontal: 4 },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
