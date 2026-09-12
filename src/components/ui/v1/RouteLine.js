import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import CountryFlag from './CountryFlag';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';

export default function RouteLine({ from, to, fromFlag, toFlag, numberOfLines = 1, testID, ceramic = false, compact = false }) {
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const palette = ceramic ? ceramicColors : colors;
  return (
    <View style={s.row} testID={testID}>
      {fromFlag ? <CountryFlag code={fromFlag} width={compact ? 18 : (ceramic ? 24 : 18)} round={ceramic && !compact} style={[s.flag, compact && s.compactFlag]} /> : null}
      <Text style={[s.city, compact && s.compactCity, { color: palette.text }]} numberOfLines={numberOfLines}>{from || '—'}</Text>
      <Feather name="arrow-right" size={compact ? 14 : 16} color={palette.textMuted} style={[s.arrow, compact && s.compactArrow]} />
      {toFlag ? <CountryFlag code={toFlag} width={compact ? 18 : (ceramic ? 24 : 18)} round={ceramic && !compact} style={[s.flag, compact && s.compactFlag]} /> : null}
      <Text style={[s.city, compact && s.compactCity, { color: palette.text }]} numberOfLines={numberOfLines}>{to || '—'}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  row: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  flag: { marginRight: 3, flexShrink: 0 },
  // 12sp is the CJK readability floor and keeps long international routes on
  // one line beside a complete price on the 390dp compact card.
  city: { flexShrink: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: -0.05 },
  compactCity: { fontSize: 10, lineHeight: 12 },
  arrow: { marginHorizontal: 4, flexShrink: 0 },
  compactArrow: { marginHorizontal: 2 },
  compactFlag: { marginRight: 2 },
});
