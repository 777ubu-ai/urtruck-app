// Design System 2026 — BottomNav primitive (§14/§31/§64).
import React from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useTokens,
  type2026,
  metrics2026,
  space2026,
  radius2026,
  componentState2026,
} from '../../../theme/tokens2026';
import Text2026 from './Text';
import { Badge2026 } from './BadgeChip';

const ICONS = {
  Feed: { family: 'Feather', name: 'package' },
  MyWork: { family: 'Feather', name: 'briefcase' },
  Queue: { family: 'Feather', name: 'map-pin' },
  Deals: { family: 'MaterialCommunityIcons', name: 'handshake-outline' },
  Track: { family: 'Feather', name: 'navigation' },
  Wallet: { family: 'Feather', name: 'credit-card' },
};

function NavIcon({ item, color }) {
  const meta = item.icon || ICONS[item.key] || ICONS.Feed;
  if (meta.family === 'MaterialCommunityIcons') {
    return <MaterialCommunityIcons name={meta.name} size={metrics2026.iconMd} color={color} />;
  }
  return <Feather name={meta.name} size={metrics2026.iconMd} color={color} />;
}

export default function BottomNav2026({ items = [], activeKey, onChange, role, labels = {}, style }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const accent = role === 'shipper' ? t['role.shipper.main'] : t['role.driver.main'];
  const bottomPad = Math.max(insets.bottom, space2026[2]);

  return (
    <View
      testID="bottom-nav-2026"
      style={[
        s.wrap,
        {
          paddingBottom: bottomPad,
          backgroundColor: t['surface.card'],
          borderTopColor: t['border.default'],
        },
        style,
      ]}
    >
      {items.map((item) => {
        const focused = item.key === activeKey;
        const fg = focused ? accent : t['text.secondary'];
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.accessibilityLabel || labels[item.key] || item.label}
            accessibilityState={{ selected: focused, disabled: item.disabled }}
            disabled={item.disabled}
            onPress={() => onChange?.(item.key)}
            style={({ pressed, focused: webFocused }) => [
              s.item,
              {
                opacity: item.disabled ? componentState2026.disabledOpacity : pressed ? componentState2026.pressedOpacity : 1,
                minHeight: metrics2026.touchTargetAndroid,
                minWidth: metrics2026.bottomNavItemMinWidth,
                borderRadius: radius2026.md,
                outlineWidth: Platform.OS === 'web' && webFocused ? componentState2026.focusRingWidth : 0,
                outlineColor: t['border.focus'],
              },
            ]}
          >
            <View style={[s.iconBox, { width: metrics2026.bottomNavIconBox, height: metrics2026.bottomNavIconBox }]}>
              <NavIcon item={item} color={fg} />
              {Number(item.badge) > 0 ? <Badge2026 value={item.badge} style={s.badge} /> : null}
              {item.dot && !Number(item.badge) ? <Badge2026 dot style={s.dot} /> : null}
            </View>
            <Text2026
              variant="badge"
              color={focused ? 'text.primary' : 'text.secondary'}
              maxFontSizeMultiplier={1.15}
              numberOfLines={1}
              style={[type2026.badge, s.label, { color: fg }]}
            >
              {item.label}
            </Text2026>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space2026[2],
    paddingTop: space2026[2],
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space2026[1],
    gap: 2,
  },
  iconBox: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -8 },
  dot: { position: 'absolute', top: 1, right: -3 },
  label: { textAlign: 'center' },
});
