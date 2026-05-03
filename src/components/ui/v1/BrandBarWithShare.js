// BrandBarWithShare — top-of-screen bar with back arrow on the left,
// "UrTruck" wordmark + "FTL" pill in the centre, optional share/right action
// on the right. Used by detail screens (CargoDetail / TripDetail /
// DriverDetail / EditTripScreen) so the brand strip stays identical
// across them.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { v1Colors } from '../../../theme/designV1';

export default function BrandBarWithShare({ onBack, onShare, accent = v1Colors.driver, rightTestID, rightIcon = '↗' }) {
  return (
    <View style={s.row}>
      <TouchableOpacity
        onPress={onBack}
        style={s.backHit}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Back"
      >
        <Text style={[s.backIcon, { color: accent }]}>‹</Text>
      </TouchableOpacity>
      <View style={s.brandRow}>
        <Text style={s.brandText}>UrTruck</Text>
        <View style={[s.ftlPill, { backgroundColor: accent + '22', borderColor: accent }]}>
          <Text style={[s.ftlText, { color: accent }]}>FTL</Text>
        </View>
      </View>
      {onShare ? (
        <TouchableOpacity onPress={onShare} style={s.rightBtn} testID={rightTestID}>
          <Text style={s.rightIcon}>{rightIcon}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
  },
  backHit: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 30, fontWeight: '300' },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  brandText: { color: v1Colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  ftlPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  ftlText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  rightBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: v1Colors.border,
    backgroundColor: v1Colors.surface,
  },
  rightIcon: { fontSize: 18, color: v1Colors.text },
});
