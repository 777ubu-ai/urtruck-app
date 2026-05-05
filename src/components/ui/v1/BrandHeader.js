// BrandHeader — top bar with optional back arrow + "UrTruck" wordmark
// + emerald "FTL" pill. Used across Welcome / SignUp / OTP / Profile setup.
//
// `accent` controls the back-arrow color so the header reads emerald on
// driver flow and orange on cargo-owner flow.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useV1Colors, v1Typography, v1Spacing, v1Radius } from '../../../theme/designV1';

export default function BrandHeader({ onBack, accent, compact = false }) {
  const colors = useV1Colors();
  const arrowColor = accent || colors.driver;
  return (
    <View style={[s.row, compact && { paddingTop: 8 }]}>
      <View style={s.side}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[s.back, { color: arrowColor }]}>‹</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={s.center}>
        <Text style={[v1Typography.brand, { color: colors.text }]}>UrTruck</Text>
        <View style={[s.ftlPill, { backgroundColor: colors.driverSoft, borderColor: colors.driver }]}>
          <Text style={[s.ftlText, { color: colors.driver }]}>FTL</Text>
        </View>
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
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ftlPill: {
    borderWidth: 1,
    borderRadius: v1Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  ftlText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
