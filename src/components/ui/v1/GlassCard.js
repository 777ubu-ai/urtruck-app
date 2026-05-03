// GlassCard — graphite container card used by detail screens (CargoDetail /
// TripDetail / DriverDetail) to group related fields. Keeps a 1px hairline
// and the v1 surface fill so detail-screens read consistently across roles.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { v1Colors, v1Radius } from '../../../theme/designV1';

export default function GlassCard({ children, style, accent }) {
  return (
    <View
      style={[
        s.card,
        accent ? { borderColor: accent } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: v1Colors.surface,
    borderColor: v1Colors.border,
    borderWidth: 1,
    borderRadius: v1Radius.card,
    padding: 14,
    marginBottom: 10,
  },
});
