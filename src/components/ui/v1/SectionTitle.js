// SectionTitle — uppercase tracked label inside detail-screen cards.
// Optional right-side slot (e.g. "★ 4.8" or "VERIFIED").
// Stage 6: theme-aware label colour.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors } from '../../../theme/designV1';

export default function SectionTitle({ icon, featherIcon, label, right }) {
  const colors = useV1Colors();
  return (
    <View style={s.row}>
      <View style={s.left}>
        {featherIcon
          ? <Feather name={featherIcon} size={13} color={colors.textMuted} />
          : icon ? <Text style={{ fontSize: 13 }}>{icon}</Text> : null}
        <Text style={[s.label, { color: colors.textMuted }]}>{label}</Text>
      </View>
      {right ? <View style={{ marginLeft: 8 }}>{right}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
});
