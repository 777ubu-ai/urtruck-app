// GlassCard — surface container used by detail screens (CargoDetail /
// TripDetail / DriverDetail) to group related fields. Keeps a 1px
// hairline and the v1 surface fill so detail screens read consistently
// across roles. Stage 6: theme-aware fill / border.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius } from '../../../theme/designV1';

export default function GlassCard({ children, style, accent }) {
  const colors = useV1Colors();
  return (
    <View
      style={[
        s.card,
        { backgroundColor: colors.surface, borderColor: accent || colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: v1Radius.card,
    padding: 14,
    marginBottom: 10,
  },
});
