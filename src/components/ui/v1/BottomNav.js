// BottomNav — custom tab-bar for MainTabs (UrTruck design v1, macros 07/08).
//
// Five slots:
//   0  Feed   (cargos for driver / trips for client)
//   1  MyWork (My trips for driver / My cargo for client)
//   2  Publish (large floating "+" button — opens CreateTrip / CreateCargo)
//   3  Chats
//   4  Profile
//
// `role` is read from the navigator state (each screen passes it via params)
// or falls back to the AuthContext. The middle button NEVER toggles the tab
// — it intercepts the press and navigates to the create flow instead.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, AppState } from 'react-native';
import { v1Colors, v1AccentFor } from '../../../theme/designV1';
import { useAuth } from '../../../utils/AuthContext';
import { useI18n } from '../../../utils/useI18n';
import { chatAPI } from '../../../utils/chatAPI';

// Poll cadence: gentle by design — most apps refresh chat unread on navigate-
// in anyway; the periodic poll is a safety net for users who stay parked on
// Feed for a while. 30s strikes a balance between responsiveness and battery.
const UNREAD_POLL_MS = 30000;

// Icon glyphs deliberately stay simple emoji; we tint the label by color
// so even on monochrome OS renderers the active state reads cleanly.
const ICONS = {
  Feed:    { driver: '📦', client: '🚚' },
  MyWork:  { driver: '🛣',  client: '📋' },
  Chats:   { driver: '💬', client: '💬' },
  Profile: { driver: '👤', client: '👤' },
};

export default function BottomNav({ state, navigation, descriptors }) {
  const { session, hasToken } = useAuth();
  const { t } = useI18n();
  const role = session?.user?.role
    || state.routes[0]?.params?.role
    || 'client';
  const isDriver = role === 'driver';
  const accent = v1AccentFor(isDriver ? 'driver' : 'client');

  // Unread chat badge — polled at UNREAD_POLL_MS, also re-fetched whenever
  // the app comes back to the foreground. Fail-silent: any network error
  // just leaves the badge at its last known value.
  const [chatUnread, setChatUnread] = useState(0);
  const pollTimer = useRef(null);

  useEffect(() => {
    let mounted = true;
    if (!hasToken) {
      setChatUnread(0);
      return;
    }
    const fetchUnread = async () => {
      try {
        const r = await chatAPI.unread();
        const n = (r && (r.unread ?? r.count ?? r.total)) || 0;
        if (mounted) setChatUnread(Number(n) || 0);
      } catch {
        // intentionally silent — UI stays on previous value
      }
    };
    fetchUnread();
    pollTimer.current = setInterval(fetchUnread, UNREAD_POLL_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') fetchUnread();
    });
    return () => {
      mounted = false;
      clearInterval(pollTimer.current);
      sub?.remove?.();
    };
  }, [hasToken]);

  const labelOf = (name) => {
    if (name === 'Feed')    return isDriver ? t('tab_feed') : t('tab_feed_client');
    if (name === 'MyWork')  return isDriver ? t('tab_my_work_driver') : t('tab_my_work_client');
    if (name === 'Chats')   return t('tab_chats');
    if (name === 'Profile') return t('tab_profile');
    return name;
  };

  const onPressTab = (route, isFocused) => {
    if (route.name === 'Publish') {
      // Floating "+" — never selects, always opens the create flow.
      navigation.navigate(isDriver ? 'CreateTrip' : 'CreateCargo', { role });
      return;
    }
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  return (
    <View style={s.bar} testID="bottom-nav">
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;

        if (route.name === 'Publish') {
          return (
            <View key={route.key} style={s.publishCell}>
              <TouchableOpacity
                onPress={() => onPressTab(route, false)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('bottom_nav_publish')}
                testID="bottom-nav-publish"
                style={[s.publishBtn, { backgroundColor: accent.main, shadowColor: accent.main }]}
              >
                <Text style={s.publishPlus}>+</Text>
              </TouchableOpacity>
              <Text style={[s.publishLabel, { color: accent.main }]} numberOfLines={1}>
                {t('bottom_nav_publish')}
              </Text>
            </View>
          );
        }

        const iconKey = ICONS[route.name];
        const icon = iconKey ? (isDriver ? iconKey.driver : iconKey.client) : '·';
        const label = labelOf(route.name);
        const showChatBadge = route.name === 'Chats' && chatUnread > 0;
        const badgeLabel = chatUnread > 9 ? '9+' : String(chatUnread);

        return (
          <TouchableOpacity
            key={route.key}
            onPress={() => onPressTab(route, isFocused)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={`bottom-nav-${route.name.toLowerCase()}`}
            style={s.cell}
          >
            <View style={{ position: 'relative' }}>
              <Text
                style={[
                  s.icon,
                  isFocused ? { transform: [{ scale: 1.1 }] } : null,
                ]}
              >
                {icon}
              </Text>
              {showChatBadge ? (
                <View style={s.iconBadge} testID="bottom-nav-chats-badge">
                  <Text style={s.iconBadgeText}>{badgeLabel}</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                s.label,
                { color: isFocused ? accent.main : v1Colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {isFocused ? <View style={[s.activeDot, { backgroundColor: accent.main }]} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderTopWidth: 1,
    borderTopColor: v1Colors.border,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 6,
    gap: 4,
  },
  icon: { fontSize: 22, lineHeight: 26 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  activeDot: {
    width: 4, height: 4, borderRadius: 2, marginTop: 2,
  },
  publishCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  publishBtn: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -22,           // float above the bar (matches macros 07/08)
    shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  publishPlus: { color: '#0A0A0A', fontSize: 30, fontWeight: '900', lineHeight: 32 },
  publishLabel: { fontSize: 10, fontWeight: '800' },
  iconBadge: {
    position: 'absolute',
    top: -4, right: -10,
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: v1Colors.error,
    borderWidth: 2, borderColor: '#000',
  },
  iconBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
});
