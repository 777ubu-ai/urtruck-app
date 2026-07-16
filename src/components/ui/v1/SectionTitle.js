// SectionTitle — uppercase tracked label inside detail-screen cards.
// Optional right-side slot (e.g. "★ 4.8" or "VERIFIED").
// Stage 6: theme-aware label colour.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useV1Colors } from '../../../theme/designV1';

export default function SectionTitle({ icon, label, right }) {
  const colors = useV1Colors();
  return (
    <View style={s.row}>
      <Text style={[s.label, { color: colors.textMuted }]}>
        {icon ? <Text>{icon}  </Text> : null}
        {label}
      </Text>
      {right ? <View style={{ marginLeft: 8 }}>{right}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
});
