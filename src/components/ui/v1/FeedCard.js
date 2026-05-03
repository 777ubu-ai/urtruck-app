// FeedCard — unified card for cargo (07/12) and trip (08/11).
//
// Props:
//   variant:   'cargo' | 'trip'   — drives icon + bottom CTA defaults
//   accent:    'driver' | 'cargo' — color (emerald / orange)
//   route:     { from, to }
//   subtitle:  string             — desc / driver-name
//   meta:      [{ icon, label, value }]   — inline pills (Выезд / Вес / Объём…)
//   priceText: string             — pre-formatted ($12 000 / 450 000 ₸ / По договорённости)
//   priceCaption: string          — "за рейс" etc.
//   status:    string             — chip in the top-right (Активен / В работе / Завершён)
//   bottomLeft / bottomRight: { label, onPress, filled }
//   responses: number             — small count line ("👥 12 откликов")

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { v1Colors, v1Radius, v1AccentFor } from '../../../theme/designV1';

export default function FeedCard({
  variant = 'cargo',
  accent = 'driver',
  route,
  subtitle,
  meta = [],
  priceText,
  priceCaption,
  status,
  responses,
  bottomLeft,
  bottomRight,
  onPress,
  testID,
}) {
  const a = v1AccentFor(accent === 'cargo' ? 'client' : 'driver');
  const icon = variant === 'trip' ? '🚛' : '📦';

  const Card = onPress ? TouchableOpacity : View;
  return (
    <Card onPress={onPress} activeOpacity={0.85} style={s.card} testID={testID}>
      <View style={s.topRow}>
        <View style={[s.iconBox, { backgroundColor: a.soft, borderColor: a.main }]}>
          <Text style={s.icon}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.route} numberOfLines={1}>
            {(route && route.from) || '—'} → {(route && route.to) || '—'}
          </Text>
          {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {status ? (
            <View style={[s.statusPill, { backgroundColor: a.soft, borderColor: a.main }]}>
              <Text style={[s.statusText, { color: a.main }]}>{status}</Text>
            </View>
          ) : null}
          {priceText ? (
            <Text style={[s.price, { color: a.main, marginTop: status ? 6 : 0 }]} numberOfLines={1}>
              {priceText}
            </Text>
          ) : null}
          {priceCaption ? <Text style={s.priceCaption}>{priceCaption}</Text> : null}
        </View>
      </View>

      {meta.length ? (
        <View style={s.metaRow}>
          {meta.map((m, i) => (
            <View key={i} style={s.metaPill}>
              {m.icon ? <Text style={[s.metaIcon, { color: a.main }]}>{m.icon}</Text> : null}
              <View>
                {m.label ? <Text style={s.metaLabel}>{m.label}</Text> : null}
                <Text style={s.metaValue} numberOfLines={1}>{m.value}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {responses != null ? (
        <Text style={s.responses}>👥 {responses} {responses === 1 ? 'отклик' : 'откликов'}</Text>
      ) : null}

      {(bottomLeft || bottomRight) ? (
        <View style={s.bottomRow}>
          {bottomLeft ? (
            <TouchableOpacity
              onPress={bottomLeft.onPress}
              activeOpacity={0.85}
              style={[
                s.btn,
                bottomLeft.filled
                  ? { backgroundColor: a.main, borderColor: a.main }
                  : { backgroundColor: 'transparent', borderColor: v1Colors.borderStrong },
              ]}
              testID={bottomLeft.testID}
            >
              <Text style={[s.btnText, { color: bottomLeft.filled ? '#0A0A0A' : v1Colors.text }]}>{bottomLeft.label}</Text>
            </TouchableOpacity>
          ) : null}
          {bottomRight ? (
            <TouchableOpacity
              onPress={bottomRight.onPress}
              activeOpacity={0.85}
              style={[
                s.btn,
                bottomRight.filled !== false
                  ? { backgroundColor: a.main, borderColor: a.main }
                  : { backgroundColor: 'transparent', borderColor: v1Colors.borderStrong },
              ]}
              testID={bottomRight.testID}
            >
              <Text style={[s.btnText, { color: (bottomRight.filled !== false) ? '#0A0A0A' : v1Colors.text }]}>{bottomRight.label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: v1Colors.surface,
    borderColor: v1Colors.border,
    borderWidth: 1,
    borderRadius: v1Radius.card,
    padding: 14,
    marginBottom: 10,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  iconBox: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22 },
  route: { color: v1Colors.text, fontSize: 16, fontWeight: '800' },
  subtitle: { color: v1Colors.textMuted, fontSize: 12, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  price: { fontSize: 15, fontWeight: '900' },
  priceCaption: { color: v1Colors.textMuted, fontSize: 10, marginTop: 1 },
  metaRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: v1Colors.border,
    marginTop: 4,
  },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4,
  },
  metaIcon: { fontSize: 14 },
  metaLabel: { color: v1Colors.textDim, fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  metaValue: { color: v1Colors.text, fontSize: 12, fontWeight: '700' },
  responses: { color: v1Colors.textMuted, fontSize: 11, marginBottom: 8 },
  bottomRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  btnText: { fontSize: 13, fontWeight: '700' },
});
