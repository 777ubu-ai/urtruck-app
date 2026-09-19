import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import CountryFlag from './CountryFlag';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';

// Two-row route layout prevents narrow destination columns from splitting a
// city in the middle (for example Алмат/ы) when a fixed price rail is present.
export default function RouteLine({ from, to, fromFlag, toFlag, testID, ceramic = false }) {
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const palette = ceramic ? ceramicColors : colors;
  return (
    <View style={s.route} testID={testID}>
      <View style={s.pointRow}>
        {fromFlag ? <CountryFlag code={fromFlag} width={26} style={s.flag} /> : null}
        <Text style={[s.city, { color: palette.text }]} numberOfLines={1} ellipsizeMode="tail">{from || '—'}</Text>
      </View>
      <View style={s.pointRow}>
        <Feather name="arrow-right" size={15} color={palette.textMuted} style={s.startArrow} />
        {toFlag ? <CountryFlag code={toFlag} width={26} style={s.flag} /> : null}
        <Text style={[s.city, { color: palette.text }]} numberOfLines={1} ellipsizeMode="tail">{to || '—'}</Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  route: { flex: 1, minWidth: 0, gap: 2 },
  pointRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  flag: { marginRight: 5, flexShrink: 0 },
  startArrow: { width: 26, marginRight: 5, textAlign: 'center', flexShrink: 0 },
  city: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 19, fontWeight: '700', letterSpacing: -0.1 },
});
