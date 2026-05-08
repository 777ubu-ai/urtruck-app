// BrandBarWithShare — top-of-screen bar with back arrow on the left,
// "UrTruck" wordmark in the centre, optional share/right action on
// the right. Used by detail screens (CargoDetail / TripDetail /
// DriverDetail / EditTripScreen) so the brand strip stays identical
// across them. Theme-aware via useV1Colors().
//
// Stage 16: removed the green "FTL" pill — same reason as
// BrandHeader, header was carrying too many bright accents at once.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors } from '../../../theme/designV1';

// Stage 44: rightIcon switched from `↗` glyph to a real share icon
// (Feather `share-2`). Callers can still override `rightIcon` to a
// string for back-compat, but the default is now the icon component.
export default function BrandBarWithShare({ onBack, onShare, accent, rightTestID, rightIcon }) {
  const colors = useV1Colors();
  const arrowColor = accent || colors.driver;
  return (
    <View style={s.row}>
      <TouchableOpacity
        onPress={onBack}
        style={s.backHit}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Back"
      >
        <Text style={[s.backIcon, { color: arrowColor }]}>‹</Text>
      </TouchableOpacity>
      <View style={s.brandRow}>
        <Text style={[s.brandText, { color: colors.text }]}>UrTruck</Text>
      </View>
      {onShare ? (
        <TouchableOpacity
          onPress={onShare}
          style={[
            s.rightBtn,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
          testID={rightTestID}
          accessibilityLabel="Share"
        >
          {rightIcon ? (
            <Text style={[s.rightIcon, { color: colors.text }]}>{rightIcon}</Text>
          ) : (
            <Feather name="share-2" size={18} color={colors.text} />
          )}
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
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  rightBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  rightIcon: { fontSize: 18 },
});
