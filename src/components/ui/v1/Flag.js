// Flag — country flag rendered with Views, NO emoji (Design Bible
// "Direction B", owner-approved 2026-09-09, Commit 1). 20×14, radius 2.
// Simplified geometry: stripe fields and single-shape emblems only.
//
// Code list mirrors src/utils/countryFlags.js (KZ/CN/RU/UZ/KG/TJ/BY/TR/IR/
// AF/PK/MN/GE/AZ/AM/TM/UA) so Flag and the emoji helper never disagree
// about which countries exist. Unknown codes fall back to a grey field
// with a `?` via `flagColors(code) === null`.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// ── Color data (geometry description, not render) ─────────────────────
// horizontal: top→bottom stripe fields; vertical: hoist→fly.
const FLAGS = {
  KZ: { layout: 'horizontal', stripes: ['#00ABC2', '#00ABC2', '#FEC50C'], bandIndex: 2, sun: true },
  RU: { layout: 'horizontal', stripes: ['#FFFFFF', '#0039A6', '#D52B1E'] },
  CN: { layout: 'horizontal', stripes: ['#DE2910'], starCluster: true },
  UZ: { layout: 'horizontal', stripes: ['#0099B5', '#FFFFFF', '#1EB53A'] },
  KG: { layout: 'horizontal', stripes: ['#E8112D'], sun: true },
  TJ: { layout: 'horizontal', stripes: ['#CC0000', '#FFFFFF', '#006B3F'] },
  BY: { layout: 'horizontal', stripes: ['#CE1720', '#FFFFFF', '#007C30'], thin: true },
  TR: { layout: 'horizontal', stripes: ['#E30A17'], crescent: true },
  IR: { layout: 'horizontal', stripes: ['#239F40', '#FFFFFF', '#DA0000'] },
  AF: { layout: 'horizontal', stripes: ['#000000', '#D32011', '#007A36'] },
  PK: { layout: 'vertical', stripes: ['#FFFFFF', '#01411C'], hoistShare: 0.25 },
  MN: { layout: 'vertical', stripes: ['#C4272F', '#015197', '#C4272F'] },
  GE: { layout: 'horizontal', stripes: ['#FF0000', '#FFFFFF', '#FF0000'], thin: true },
  AZ: { layout: 'horizontal', stripes: ['#00B5E2', '#EF3340', '#509E2F'], crescent: true },
  AM: { layout: 'horizontal', stripes: ['#D90012', '#0033A0', '#F2A800'] },
  TM: { layout: 'horizontal', stripes: ['#00843D'], carpet: true },
  UA: { layout: 'horizontal', stripes: ['#005BBB', '#FFD500'] },
};

// Palette signature per code — what tests/compare tools use to assert two
// flags differ without snapshotting geometry. Null for unknown codes.
export function flagColors(code) {
  const f = FLAGS[normalize(code)];
  if (!f) return null;
  return { layout: f.layout, colors: [...f.stripes] };
}

export function isKnownFlagCode(code) {
  return Boolean(FLAGS[normalize(code)]);
}

const normalize = (code) => (typeof code === 'string' ? code.trim().toUpperCase() : '');

export default function Flag({ code, style, testID, accessibilityLabel }) {
  const f = FLAGS[normalize(code)];
  if (!f) {
    return (
      <View
        style={[s.flag, s.unknown, style]}
        testID={testID}
        accessibilityLabel={accessibilityLabel || `flag unknown ${code || ''}`.trim()}
      >
        <Text style={s.unknownMark}>?</Text>
      </View>
    );
  }
  const stripes = f.layout === 'vertical'
    ? f.stripes.map((color, i) => {
        const share = i === 0 && f.hoistShare ? f.hoistShare : (1 - (f.hoistShare || 0)) / (f.stripes.length - (f.hoistShare ? 1 : 0));
        return <View key={i} style={{ backgroundColor: color, flex: share }} />;
      })
    : f.stripes.map((color, i) => (
        <View
          key={i}
          style={[
            { backgroundColor: color },
            f.thin && i === 1 ? s.thinStripe : s.stripe,
          ]}
        />
      ));
  return (
    <View
      style={[s.flag, style]}
      testID={testID}
      accessibilityLabel={accessibilityLabel || `flag ${normalize(code)}`}
    >
      <View style={[s.field, f.layout === 'vertical' && s.fieldRow]}>{stripes}</View>
      {f.sun ? <View style={s.sun} /> : null}
      {f.starCluster ? <View style={s.starCluster} /> : null}
      {f.crescent ? <View style={s.crescent} /> : null}
      {f.carpet ? <View style={s.carpetBand} /> : null}
    </View>
  );
}

const W = 20;
const H = 14;

const s = StyleSheet.create({
  flag: {
    width: W,
    height: H,
    borderRadius: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { ...StyleSheet.absoluteFillObject, alignItems: 'stretch' },
  fieldRow: { flexDirection: 'row' },
  stripe: { flex: 1 },
  thinStripe: { flex: 0.3 },
  // KZ: yellow sun disc on the blue field; KG: same simplified device.
  sun: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFDE00',
  },
  // CN: the whole star cluster reduced to ONE yellow shape (per spec —
  // simplified single-shape emblem), positioned canton-left.
  starCluster: {
    position: 'absolute',
    left: 3,
    top: 3,
    width: 6,
    height: 6,
    backgroundColor: '#FFDE00',
    transform: [{ rotate: '45deg' }],
  },
  // TR/AZ: white crescent approximated by a light disc over the field.
  crescent: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  // TM: simplified red carpet gul stripe near the hoist.
  carpetBand: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#A51E22',
  },
  unknown: { backgroundColor: '#C8D8CF' },
  unknownMark: { fontSize: 8, fontWeight: '700', color: '#617067', lineHeight: 10 },
});
