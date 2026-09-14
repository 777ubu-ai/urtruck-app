import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import CountryFlag from './CountryFlag';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';

export default function RouteLine({ from, to, fromFlag, toFlag, numberOfLines = 1, testID, ceramic = false }) {
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const palette = ceramic ? ceramicColors : colors;
  return (
    <View style={s.row} testID={testID}>
      {fromFlag ? <CountryFlag code={fromFlag} width={26} style={s.flag} /> : null}
      <Text style={[s.city, { color: palette.text }]} numberOfLines={numberOfLines} ellipsizeMode="tail">{from || '—'}</Text>
      <Feather name="arrow-right" size={16} color={palette.textMuted} style={s.arrow} />
      {toFlag ? <CountryFlag code={toFlag} width={26} style={s.flag} /> : null}
      <Text style={[s.city, { color: palette.text }]} numberOfLines={numberOfLines} ellipsizeMode="tail">{to || '—'}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  row: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  flag: { marginRight: 3, flexShrink: 0 },
  // A single clamped row makes cities the primary signal while the fixed
  // price rail in MarketplaceCard keeps the card compact.
  city: { flexShrink: 1, minWidth: 0, fontSize: 15, lineHeight: 19, fontWeight: '700', letterSpacing: -0.1 },
  arrow: { marginHorizontal: 4, flexShrink: 0 },
});
