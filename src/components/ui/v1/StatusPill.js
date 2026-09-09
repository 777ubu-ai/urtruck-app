// StatusPill — dot + label status indicator (Design Bible "Direction B",
// owner-approved 2026-09-09, Commit 1). 7dp dot, 12/700 label, translucent
// role-colored background (`${roleColor}12`), full radius.
//
// Statuses: accepted | in_progress | at_border | delivered | received |
// completed | cancelled. Colors come from the designV1 status-role tokens;
// `color` overrides the role color (label/dot/bg all follow the override).
// `label` is the localized string — this component never translates.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useV1Colors, getStatusColor, v1Radius } from '../../../theme/designV1';

const DOT = 7;

export default function StatusPill({ status, label, color, style, testID, accessibilityLabel }) {
  const colors = useV1Colors();
  const role = color || getStatusColor(colors, status);
  return (
    <View
      accessibilityLabel={accessibilityLabel || (typeof label === 'string' ? label : undefined)}
      testID={testID}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={[s.pill, { backgroundColor: `${role}12` }, style]}
    >
      <View style={[s.dot, { backgroundColor: role }]} />
      <Text style={[s.label, { color: role }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: v1Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    marginRight: 6,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.1,
    // label sits next to the dot, not on v1Typography.body — intentional
  },
});
