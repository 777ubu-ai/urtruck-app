import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import CountryFlag from './CountryFlag';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';

const BORDER_PAIRS = [
  {
    origins: new Set(['дулаты', 'dulaty', '都拉塔']),
    checkpoints: new Set(['калжат', 'kalzhat', '喀勒扎特']),
  },
  {
    origins: new Set(['чугучак', 'tacheng', '塔城']),
    checkpoints: new Set(['бахты', 'bakhty', '巴克图']),
  },
];
const norm = (value) => String(value || '').trim().toLowerCase();

function splitBorderPair(value) {
  const parts = String(value || '').split(/\s*[-–—→↔]\s*/).map((item) => item.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const pair = BORDER_PAIRS.find(({ origins, checkpoints }) => (
    origins.has(norm(parts[0])) && checkpoints.has(norm(parts[1]))
  ));
  return pair ? parts : null;
}

// Ordinary routes retain the approved one-row compact layout. Known border
// pairs render origin/checkpoint as a compact stack without shrinking the
// destination column or increasing the MarketplaceCard height.
export default function RouteLine({ from, to, fromFlag, toFlag, numberOfLines = 1, testID, ceramic = false }) {
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const palette = ceramic ? ceramicColors : colors;
  const crossing = splitBorderPair(from);

  if (crossing) {
    const [origin, checkpoint] = crossing;
    return (
      <View style={s.route} testID={testID}>
        <View style={s.crossingRow}>
          <View style={s.crossingOrigin}>
            <View style={s.pointRow}>
              {fromFlag ? <CountryFlag code={fromFlag} width={26} style={s.flag} /> : null}
              <Text style={[s.city, { color: palette.text }]} numberOfLines={1} ellipsizeMode="tail">{origin}</Text>
            </View>
            <Text style={[s.crossingCheckpoint, fromFlag && s.crossingCheckpointWithFlag, { color: palette.textMuted }]} numberOfLines={1}>{checkpoint}</Text>
          </View>
          <View style={s.crossingDestination}>
            <Feather name="arrow-right" size={15} color={palette.textMuted} style={s.crossingArrow} />
            {toFlag ? <CountryFlag code={toFlag} width={26} style={s.flag} /> : null}
            <Text style={[s.city, { color: palette.text }]} numberOfLines={1} ellipsizeMode="tail">{to || '—'}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={s.row} testID={testID}>
      {fromFlag ? <CountryFlag code={fromFlag} width={26} style={s.flag} /> : null}
      <Text style={[s.city, s.fromCity, { color: palette.text }]} numberOfLines={numberOfLines} adjustsFontSizeToFit minimumFontScale={0.8} ellipsizeMode="tail">{from || '—'}</Text>
      <Feather name="arrow-right" size={16} color={palette.textMuted} style={s.arrow} />
      {toFlag ? <CountryFlag code={toFlag} width={26} style={s.flag} /> : null}
      <Text style={[s.city, s.toCity, { color: palette.text }]} numberOfLines={numberOfLines} adjustsFontSizeToFit minimumFontScale={0.8} ellipsizeMode="tail">{to || '—'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  route: { flex: 1, minWidth: 0 },
  pointRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  flag: { marginRight: 3, flexShrink: 0 },
  city: { minWidth: 0, fontSize: 15, lineHeight: 19, fontWeight: '700', letterSpacing: -0.1 },
  fromCity: { flexShrink: 1, maxWidth: '42%' },
  toCity: { flex: 1 },
  arrow: { marginHorizontal: 4, flexShrink: 0 },
  crossingRow: { minWidth: 0, flexDirection: 'row', alignItems: 'flex-start' },
  crossingOrigin: { flexBasis: 88, maxWidth: 92, minWidth: 0, flexShrink: 1 },
  crossingCheckpoint: { marginTop: 1, fontSize: 12, lineHeight: 15, fontWeight: '700' },
  crossingCheckpointWithFlag: { marginLeft: 29 },
  crossingDestination: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingTop: 1 },
  crossingArrow: { width: 20, marginHorizontal: 3, textAlign: 'center', flexShrink: 0 },
});
