// StickyCTABar — floating CTA strip pinned to the bottom of detail
// screens. Use for action pairs that should stay reachable while the
// user is scrolling through long bid lists / reviews. Defaults to two
// buttons (filled + outline) but `children` can be anything.
// Stage 6: theme-aware bar fill / border / outline label.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius } from '../../../theme/designV1';

export default function StickyCTABar({ accent, primary, secondary, children }) {
  const colors = useV1Colors();
  const filled = accent || colors.driver;
  return (
    <View
      style={[
        s.bar,
        { backgroundColor: colors.bgDeep, borderTopColor: colors.border },
      ]}
    >
      {children ? children : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {secondary ? (
            <TouchableOpacity
              onPress={secondary.onPress}
              activeOpacity={0.85}
              style={[s.btn, { borderColor: colors.borderStrong, backgroundColor: 'transparent' }]}
              testID={secondary.testID}
            >
              <Text style={[s.btnText, { color: colors.text }]}>{secondary.label}</Text>
            </TouchableOpacity>
          ) : null}
          {primary ? (
            <TouchableOpacity
              onPress={primary.onPress}
              activeOpacity={0.85}
              disabled={primary.disabled}
              style={[
                s.btn,
                { backgroundColor: filled, borderColor: filled, flex: 2 },
                primary.disabled && { opacity: 0.5 },
              ]}
              testID={primary.testID}
            >
              <Text style={[s.btnText, { color: '#0A0A0A' }]}>{primary.label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18,
    borderTopWidth: 1,
  },
  btn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderRadius: v1Radius.button, borderWidth: 1,
  },
  btnText: { fontSize: 14, fontWeight: '800' },
});
