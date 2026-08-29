import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useV1Colors } from '../../../theme/designV1';
import { useTheme } from '../../../utils/ThemeContext';
import { useAuth } from '../../../utils/AuthContext';
import { useI18n } from '../../../utils/useI18n';
import { chatAPI } from '../../../utils/chatAPI';
import { marketAPI } from '../../../utils/marketAPI';
import { subscribeChatRead } from '../../../utils/unreadEvents';
import { useUnreadNotifications } from '../../../utils/useUnreadNotifications';
import { computeDealsUnread } from '../../../utils/dealsUnread';
import { colors as v2 } from '../../../theme/designSystemV2';

const UNREAD_POLL_MS = 12000;

const ICONS = {
  Feed: { driver: 'package', client: 'truck' },
  MyWork: { driver: 'clipboard', client: 'clipboard' },
  Deals: { driver: 'handshake', client: 'handshake' },
  Queue:   { driver: 'map-pin', client: 'map-pin' },
};

const ROLE_ACCENT = {
  driver: { main: '#168759', soft: '#E8F6EF' },
  client: { main: '#168759', soft: '#E8F6EF' },
};

function syncAppIconBadge(total) {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  let Notifications;
  try { Notifications = require('expo-notifications'); }
  catch { return; }
  Notifications.setBadgeCountAsync?.(Number(total) || 0).catch(() => {});
}

export default function BottomNav({ state, navigation }) {
  const colors = useV1Colors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { session, hasToken } = useAuth();
  const { t } = useI18n();
  const role = session?.user?.role || state.routes[0]?.params?.role || 'client';
  const isDriver = role === 'driver';
  const accent = ROLE_ACCENT[role] || ROLE_ACCENT.client;
  const inactiveColor = v2.textSecondary;

  const [chatUnread, setChatUnread] = useState(0);
  const [dealsUnread, setDealsUnread] = useState(0);
  const pollTimer = useRef(null);
  const notifUnread = useUnreadNotifications(hasToken);
  const chatUnreadRef = useRef(0);
  const notifUnreadRef = useRef(0);
  const syncIcon = () => syncAppIconBadge((chatUnreadRef.current || 0) + (notifUnreadRef.current || 0));

  useEffect(() => {
    let mounted = true;
    if (!hasToken) {
      chatUnreadRef.current = 0;
      setChatUnread(0);
      syncIcon();
      return undefined;
    }

    const fetchUnread = async () => {
      try {
        const result = await chatAPI.unread();
        const count = Number(result?.unread ?? result?.count ?? result?.total ?? 0) || 0;
        chatUnreadRef.current = count;
        if (mounted) setChatUnread(count);
        syncIcon();
      } catch {
        // Keep the previous value on temporary network errors.
      }
    };

    fetchUnread();
    pollTimer.current = setInterval(fetchUnread, UNREAD_POLL_MS);
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') fetchUnread();
    });
    const readSub = subscribeChatRead(fetchUnread);

    return () => {
      mounted = false;
      clearInterval(pollTimer.current);
      appStateSub?.remove?.();
      readSub?.();
    };
  }, [hasToken]);

  useEffect(() => {
    notifUnreadRef.current = Number(notifUnread) || 0;
    syncIcon();
  }, [notifUnread]);

  useEffect(() => {
    let mounted = true;
    if (!hasToken) {
      setDealsUnread(0);
      return undefined;
    }

    const fetchDealsUnread = async () => {
      try {
        const dashboard = await marketAPI.myDashboard();
        const next = computeDealsUnread(dashboard);
        if (mounted) setDealsUnread(next);
        // Deliberately no foreground toast/banner here. The Deals badge is the
        // in-app signal. System push remains responsible for background/closed
        // app delivery and deep-link routing.
      } catch {
        // Keep the previous badge value on temporary network errors.
      }
    };

    fetchDealsUnread();
    const timer = setInterval(fetchDealsUnread, UNREAD_POLL_MS);
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') fetchDealsUnread();
    });
    const readSub = subscribeChatRead(fetchDealsUnread);

    return () => {
      mounted = false;
      clearInterval(timer);
      appStateSub?.remove?.();
      readSub?.();
    };
  }, [hasToken]);

  const labelOf = (name) => {
    if (name === 'Feed') return isDriver ? t('tab_feed') : t('tab_feed_client');
    if (name === 'MyWork') return isDriver ? t('tab_my_work_driver') : t('tab_my_work_client');
    if (name === 'Deals') return t('tab_deals');
    if (name === 'Queue')   return t('tab_border');
    return name;
  };

  const onPressTab = (route, isFocused) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  };

  const bottomPad = Math.max(insets.bottom, 6);
  const barBg = isDark ? '#111827' : '#FFFFFF';
  const barBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5ECE8';

  return (
    <View style={[styles.wrap, { paddingBottom: bottomPad }]} pointerEvents="box-none" testID="bottom-nav">
      <View style={[styles.bar, { backgroundColor: barBg, borderColor: barBorder }]}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const iconKey = ICONS[route.name];
          const iconName = iconKey ? (isDriver ? iconKey.driver : iconKey.client) : 'circle';
          const label = labelOf(route.name);
          const iconColor = isFocused ? accent.main : inactiveColor;
          const tabBadgeCount = route.name === 'Chats' ? chatUnread : route.name === 'Deals' ? dealsUnread : 0;
          const showBadge = tabBadgeCount > 0;
          const badgeLabel = tabBadgeCount > 9 ? '9+' : String(tabBadgeCount);
          const badgeTestID = route.name === 'Chats' ? 'bottom-nav-chats-badge' : 'bottom-nav-deals-badge';

          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => onPressTab(route, isFocused)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
              testID={`bottom-nav-${route.name.toLowerCase()}`}
              style={styles.cell}
            >
              <View
                style={[
                  styles.pill,
                  isFocused && { backgroundColor: accent.soft, shadowColor: accent.main },
                ]}
              >
                {route.name === 'Deals' ? (
                  <MaterialCommunityIcons name="handshake-outline" size={24} color={iconColor} />
                ) : (
                  <Feather name={iconName} size={22} color={iconColor} />
                )}
                {showBadge ? (
                  <View style={[styles.iconBadge, { backgroundColor: colors.error, borderColor: barBg }]} testID={badgeTestID}>
                    <Text style={styles.iconBadgeText}>{badgeLabel}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, { color: isFocused ? accent.main : inactiveColor }]} numberOfLines={1}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const PILL_H = 34;
const LABEL_H = 13;

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 4, backgroundColor: 'transparent' },
  bar: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 7, paddingTop: 7, paddingBottom: 5, borderRadius: 24, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 9,
  },
  cell: {
    flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 2,
    minHeight: PILL_H + LABEL_H + 3,
  },
  pill: {
    height: PILL_H, minWidth: 46, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, shadowOpacity: 0.55, shadowRadius: 9, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  label: {
    height: LABEL_H, fontSize: 10.5, fontWeight: '700', marginTop: 2,
    textAlign: 'center', includeFontPadding: false,
  },
  iconBadge: {
    position: 'absolute', top: -4, right: 4, minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  iconBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
});
