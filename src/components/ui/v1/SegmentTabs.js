// SegmentTabs — pill row used on My Trips / My Cargoes (11 / 12).
// Items: [{ key, label, count? }]. Active tab is filled with the role accent.

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius } from '../../../theme/designV1';

export default function SegmentTabs({ items = [], value, onChange, accent }) {
  const colors = useV1Colors();
  const activeAccent = accent || colors.driver;
  return (
    <View style={s.row}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <TouchableOpacity
            key={it.key}
            onPress={() => onChange(it.key)}
            activeOpacity={0.85}
            testID={it.testID}
            accessibilityLabel={typeof it.label === 'string' ? it.label : undefined}
            style={[
              s.tab,
              active
                ? { backgroundColor: activeAccent, borderColor: activeAccent }
                : { backgroundColor: 'transparent', borderColor: colors.border },
            ]}
          >
            <Text style={[s.label, { color: active ? '#0A0A0A' : colors.textMuted }]} numberOfLines={1}>
              {it.label}{it.count != null ? ` · ${it.count}` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flex: 1, paddingVertical: 10,
    borderRadius: v1Radius.pill, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '800' },
});
