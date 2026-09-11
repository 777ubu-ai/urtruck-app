// Card — base v1 card (Design Bible "Direction B", owner-approved
// 2026-09-09, Commit 1). Radius 16, surface bg, 1px border (`colors.border`,
// dark `#2A3930`), padding 16. NO shadow — border-only separation.
//
// With `onPress` the card becomes a Pressable: pressed state = 0.97 scale
// + accentSoft tint (driverSoft).
import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useV1Colors, useDriverCeramicColors, v1Radius } from '../../../theme/designV1';

export default function Card({ children, style, onPress, testID, accessibilityLabel, ceramic = false }) {
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const palette = ceramic ? ceramicColors : colors;
  const base = {
    backgroundColor: palette.surface,
    borderColor: palette.border,
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={({ pressed }) => [
          s.card,
          base,
          pressed && { transform: [{ scale: 0.97 }], backgroundColor: ceramic ? ceramicColors.activeSoft : colors.driverSoft },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[s.card, base, style]} testID={testID} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: v1Radius.card,
    borderWidth: 1,
    padding: 16,
  },
});
