// Design System 2026 — Header (§13 TZ: Bell LEFT, Menu RIGHT) and Tabs (§31).
import React from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens, metrics2026, space2026 } from '../../../theme/tokens2026';
import Text2026 from './Text';
import IconButton2026 from './IconButton';

export function Header2026({
  title,
  subtitle,                 // e.g. route "Хоргос → Алматы" — ellipsis, never breaks header
  onBellPress,
  onMenuPress,
  bellBadge = 0,
  left,                     // override (e.g. back button on non-root screens)
  right,
  labels = {},
  style,
}) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, {
      paddingTop: insets.top,
      backgroundColor: t['surface.card'],
      borderBottomColor: t['border.default'],
    }, style]}>
      <View style={s.row}>
        <View style={s.side}>
          {left || (onBellPress ? (
            <IconButton2026 icon="bell" onPress={onBellPress} badge={bellBadge}
              accessibilityLabel={labels.bell || 'Уведомления'} />
          ) : null)}
        </View>
        <View style={s.center}>
          {title ? (
            <Text2026 variant="h3" numberOfLines={1} ellipsizeMode="tail">{title}</Text2026>
          ) : null}
          {subtitle ? (
            <Text2026 variant="caption" color="text.secondary" numberOfLines={1} ellipsizeMode="tail">
              {subtitle}
            </Text2026>
          ) : null}
        </View>
        <View style={[s.side, s.right]}>
          {right || (onMenuPress ? (
            <IconButton2026 icon="menu" onPress={onMenuPress}
              accessibilityLabel={labels.menu || 'Меню'} />
          ) : null)}
        </View>
      </View>
    </View>
  );
}

/** Segmented tabs (§31): full labels — never "Предл./Раб./Арх." when the full
 *  text fits; horizontal scroll is the last-resort fallback. Selected state =
 *  emphasis + indicator + subtle surface (+ optional count), not color only. */
export function Tabs2026({ tabs, activeKey, onChange, style }) {
  const t = useTokens();
  return (
    <View style={[s.tabsWrap, { borderBottomColor: t['border.default'] }, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabsContent}>
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <TouchableOpacity
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => onChange?.(tab.key)}
              style={[s.tab, { minHeight: 42 }]}
              activeOpacity={0.75}
            >
              <View style={s.tabInner}>
                <Text2026
                  variant="bodySmall"
                  color={active ? 'text.primary' : 'text.secondary'}
                  style={{ fontWeight: active ? '600' : '500' }}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text2026>
                {typeof tab.count === 'number' && tab.count > 0 ? (
                  <View style={[s.tabCount, { backgroundColor: active ? t['brand.primarySoft'] : t['surface.muted'] }]}>
                    <Text2026 variant="badge" color={active ? 'brand.primary' : 'text.secondary'}>
                      {tab.count > 99 ? '99+' : tab.count}
                    </Text2026>
                  </View>
                ) : null}
              </View>
              <View style={[s.indicator, { backgroundColor: active ? t['brand.primary'] : 'transparent' }]} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: {
    height: metrics2026.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space2026[2],
    gap: space2026[2],
  },
  side: { minWidth: metrics2026.touchTargetAndroid, alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  tabsWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabsContent: { paddingHorizontal: space2026[4], gap: space2026[5] },
  tab: { justifyContent: 'center' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabCount: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  indicator: { height: 3, borderRadius: 2, marginTop: 6 },
});
