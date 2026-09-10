import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import CountryFlag from './CountryFlag';
import { useV1Colors } from '../../../theme/designV1';

export default function RouteLine({ from, to, fromFlag, toFlag, numberOfLines = 1, testID }) {
  const colors = useV1Colors();
  return (
    <View style={s.row} testID={testID}>
      {fromFlag ? <CountryFlag code={fromFlag} width={18} style={s.flag} /> : null}
      <Text style={[s.city, { color: colors.text }]} numberOfLines={numberOfLines}>{from || '—'}</Text>
      <Feather name="arrow-right" size={16} color={colors.driver} style={s.arrow} />
      {toFlag ? <CountryFlag code={toFlag} width={18} style={s.flag} /> : null}
      <Text style={[s.city, { color: colors.text }]} numberOfLines={numberOfLines}>{to || '—'}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  row: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  flag: { marginRight: 3, flexShrink: 0 },
  // 12sp is the CJK readability floor and keeps long international routes on
  // one line beside a complete price on the 390dp compact card.
  city: { flexShrink: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: -0.05 },
  arrow: { marginHorizontal: 4, flexShrink: 0 },
});
