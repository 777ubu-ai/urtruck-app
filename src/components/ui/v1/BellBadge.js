// BellBadge — bell icon button with an optional red unread counter.
// Standalone so screens that show a bell share the same visual.
// Stage 6: theme-aware fill / border / outer ring.

import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useV1Colors } from '../../../theme/designV1';

export default function BellBadge({ count = 0, onPress, testID }) {
  const colors = useV1Colors();
  const visible = Number(count) > 0;
  const label = Number(count) > 9 ? '9+' : String(count);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      testID={testID || 'bell-btn'}
      style={[s.btn, { borderColor: colors.border, backgroundColor: colors.surface }]}
    >
      <Text style={s.icon}>🔔</Text>
      {visible ? (
        <View
          style={[
            s.badge,
            { backgroundColor: colors.error, borderColor: colors.bg },
          ]}
          accessibilityLabel={`${count} unread`}
        >
          <Text style={s.badgeText}>{label}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  icon: { fontSize: 18 },
  badge: {
    position: 'absolute',
    top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
});
