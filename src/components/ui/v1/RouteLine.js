import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import CountryFlag from './CountryFlag';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';

const DULATY = new Set(['дулаты', 'dulaty', '都拉塔']);
const KALZHAT = new Set(['калжат', 'kalzhat', '喀勒扎特']);
const norm = (value) => String(value || '').trim().toLowerCase();

function splitDulatyKalzhat(value) {
  const parts = String(value || '').split(/\s*[-–—→↔]\s*/).map((item) => item.trim()).filter(Boolean);
  if (parts.length !== 2 || !DULATY.has(norm(parts[0])) || !KALZHAT.has(norm(parts[1]))) return null;
  return parts;
}

// Two-row route layout prevents narrow destination columns from splitting a
// city in the middle. The Dulaty–Kalzhat border pair is a special hierarchy:
// Kalzhat belongs under Dulaty, while the destination remains a single line.
export default function RouteLine({ from, to, fromFlag, toFlag, testID, ceramic = false }) {
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const palette = ceramic ? ceramicColors : colors;
  const crossing = splitDulatyKalzhat(from);

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
  crossingRow: { minWidth: 0, flexDirection: 'row', alignItems: 'flex-start' },
  crossingOrigin: { flex: 1, minWidth: 0 },
  crossingCheckpoint: { marginTop: 1, fontSize: 12, lineHeight: 15, fontWeight: '700' },
  crossingCheckpointWithFlag: { marginLeft: 31 },
  crossingDestination: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingTop: 1 },
  crossingArrow: { width: 24, marginRight: 4, textAlign: 'center', flexShrink: 0 },
});
