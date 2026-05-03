// BrandHeader — top bar with optional back arrow + "UrTruck" wordmark
// + emerald "FTL" pill. Used across Welcome / SignUp / OTP / Profile setup.
//
// `accent` controls the back-arrow color so the header reads emerald on
// driver flow and orange on cargo-owner flow.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { v1Colors, v1Typography, v1Spacing, v1Radius } from '../../../theme/designV1';

export default function BrandHeader({ onBack, accent = v1Colors.driver, compact = false }) {
  return (
    <View style={[s.row, compact && { paddingTop: 8 }]}>
      <View style={s.side}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[s.back, { color: accent }]}>‹</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={s.center}>
        <Text style={s.brand}>UrTruck</Text>
        <View style={s.ftlPill}>
          <Text style={s.ftlText}>FTL</Text>
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
  brand: { ...v1Typography.brand },
  ftlPill: {
    backgroundColor: v1Colors.driverSoft,
    borderColor: v1Colors.driver,
    borderWidth: 1,
    borderRadius: v1Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  ftlText: {
    color: v1Colors.driver,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
