// StickyCTABar — floating CTA strip pinned to the bottom of detail screens.
// Actions remain reachable on phones without turning into full-monitor-width
// strips on desktop/tablet. The inner action surface is capped and centered.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useV1Colors, v1Radius } from '../../../theme/designV1';

const MAX_CONTENT_WIDTH = 720;

export default function StickyCTABar({ accent, primary, secondary, children }) {
  const colors = useV1Colors();
  const insets = useSafeAreaInsets();
  const filled = accent || colors.driver;

  return (
    <View
      style={[
        s.bar,
        {
          backgroundColor: colors.bgDeep,
          borderTopColor: colors.border,
          paddingBottom: Math.max(12, insets.bottom + 8),
        },
      ]}
    >
      <View style={s.inner}>
        {children ? children : (
          <View style={s.actions}>
            {secondary ? (
              <TouchableOpacity
                onPress={secondary.onPress}
                activeOpacity={0.82}
                disabled={secondary.disabled}
                style={[
                  s.btn,
                  { borderColor: colors.borderStrong, backgroundColor: 'transparent' },
                  secondary.disabled && s.disabled,
                ]}
                testID={secondary.testID}
              >
                <Text
                  style={[s.btnText, { color: colors.text }]}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {secondary.label}
                </Text>
              </TouchableOpacity>
            ) : null}
            {primary ? (
              <TouchableOpacity
                onPress={primary.onPress}
                activeOpacity={0.82}
                disabled={primary.disabled}
                style={[
                  s.btn,
                  s.primaryBtn,
                  { backgroundColor: filled, borderColor: filled },
                  primary.disabled && s.disabled,
                ]}
                testID={primary.testID}
              >
                <Text
                  style={[s.btnText, { color: '#0A0A0A' }]}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {primary.label}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  btn: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: v1Radius.button,
    borderWidth: 1,
  },
  primaryBtn: { flex: 2 },
  btnText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  disabled: { opacity: 0.5 },
});
