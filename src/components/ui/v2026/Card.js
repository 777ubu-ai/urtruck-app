// Design System 2026 — Card (§13). Radius 16, padding 16, thin neutral
// border, minimal shadow. Hierarchy: main → route → price → meta → status → action.
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useTokens, radius2026, space2026 } from '../../../theme/tokens2026';

export default function Card2026({ children, elevated = false, style, ...rest }) {
  const t = useTokens();
  return (
    <View
      {...rest}
      style={[
        s.card,
        {
          backgroundColor: elevated ? t['surface.muted'] : t['surface.card'],
          borderColor: t['border.default'],
          borderRadius: radius2026.card,
          padding: space2026[4],
        },
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
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
      web: { boxShadow: '0 2px 6px rgba(0,0,0,0.04)' },
    }),
  },
});
