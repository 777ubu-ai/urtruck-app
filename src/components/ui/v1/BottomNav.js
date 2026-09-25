import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useV1Colors, useDriverCeramicColors } from '../../../theme/designV1';
import { useTheme } from '../../../utils/ThemeContext';
import { useAuth } from '../../../utils/AuthContext';
import { useI18n } from '../../../utils/useI18n';
import { chatAPI } from '../../../utils/chatAPI';
import { marketAPI } from '../../../utils/marketAPI';
import { subscribeChatRead } from '../../../utils/unreadEvents';
import { useUnreadNotifications } from '../../../utils/useUnreadNotifications';
import { computeDealsUnread } from '../../../utils/dealsUnread';
import { clearAppIconBadge, refreshAppIconBadge } from '../../../utils/appBadge';

const UNREAD_POLL_MS = 12000;

// One contemporary outline/filled family keeps the bar visually coherent.
// Role-specific meanings remain explicit: cargo, trucks, routes, deals, border.
const ICONS = {
  Feed: {
    driver: { active: 'package-variant-closed', inactive: 'package-variant' },
    client: { active: 'truck-fast', inactive: 'truck-fast-outline' },
  },
  MyWork: {
    driver: { active: 'routes', inactive: 'map-marker-path' },
    client: { active: 'package-variant-closed', inactive: 'package-variant' },
  },
  Deals: {
    driver: { active: 'briefcase-check', inactive: 'briefcase-check-outline' },
    client: { active: 'briefcase-check', inactive: 'briefcase-check-outline' },
  },
  Queue: {
    driver: { active: 'map-marker-radius', inactive: 'map-marker-radius-outline' },
    client: { active: 'map-marker-radius', inactive: 'map-marker-radius-outline' },
  },
};

export default function BottomNav({ state, navigation }) {
  const colors = useV1Colors();
  const ceramic = useDriverCeramicColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { session, hasToken } = useAuth();
  const { t, sp } = useI18n();
  const role = session?.user?.role || state.routes[0]?.params?.role || 'client';
  const isDriver = role === 'driver';
  // Values are palette tokens; fallbacks are defensive only.
  const accent = isDriver
    ? { main: ceramic.active, soft: ceramic.activeSoft }
    : { main: colors.clientNavIcon ?? '#5F6E7E', soft: colors.clientNavPill ?? '#E5EBF0' };
  const focusedIconColor = isDriver ? accent.main : (colors.clientNavIcon ?? '#5F6E7E');
  const focusedLabelColor = isDriver ? accent.main : (colors.clientNavLabel ?? '#52606D');
  // Theme-aware inactive label: light resolves to the same #617067 the old
  // frozen designSystemV2 token carried; dark now resolves to the dark
  // textMuted instead of staying frozen light.
  const inactiveColor = isDriver ? ceramic.textMuted : colors.textMuted;

  const [dealsUnread, setDealsUnread] = useState(0);
  const pollTimer = useRef(null);
  const notifUnread = useUnreadNotifications(hasToken);
  const syncIcon = () => hasToken ? refreshAppIconBadge() : clearAppIconBadge();

  useEffect(() => {
    if (!hasToken) {
      syncIcon();
      return undefined;
    }

    const fetchUnread = async () => {
      try {
        await chatAPI.unread();
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
      clearInterval(pollTimer.current);
      appStateSub?.remove?.();
      readSub?.();
    };
  }, [hasToken]);

  useEffect(() => {
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
  // Design v1 Commit 6: тёмная плашка — из токена палитры (DARK.bg #0F1512),
  // не графитовый хардкод #111827 из прежней темы. Светлая плашка —
  // colors.surface (тот же #FFFFFF; токен, а не хардкод, чтобы QA smoke
  // проверял именно рендер-поверхность).
  const barBg = isDriver ? ceramic.surface : (isDark ? colors.bg : colors.surface);
  const barBorder = isDriver ? ceramic.border : (isDark ? 'rgba(255,255,255,0.08)' : '#E5ECE8');

  return (
    <View style={[styles.wrap, { paddingBottom: bottomPad }]} pointerEvents="box-none" testID="bottom-nav">
      <View style={[styles.bar, { backgroundColor: barBg, borderColor: barBorder }]}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const iconKey = ICONS[route.name]?.[isDriver ? 'driver' : 'client'];
          const iconName = iconKey?.[isFocused ? 'active' : 'inactive'] || 'circle-outline';
          const label = labelOf(route.name);
          const iconColor = isFocused ? focusedIconColor : inactiveColor;
          const labelColor = isFocused ? focusedLabelColor : inactiveColor;
          // Deals badge is intentionally dashboard-only. Global chat unread is
          // used by the Bell/app-icon contract and must not leak into Deals.
          const tabBadgeCount = route.name === 'Deals' ? dealsUnread : 0;
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
                  isFocused && { backgroundColor: accent.soft },
                ]}
              >
                <MaterialCommunityIcons name={iconName} size={23} color={iconColor} />
                {showBadge ? (
                  <View style={[styles.iconBadge, { backgroundColor: isDriver ? ceramic.error : colors.error, borderColor: barBg }]} testID={badgeTestID}>
                    <Text style={styles.iconBadgeText}>{badgeLabel}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, { color: labelColor, fontSize: sp(11) }]} numberOfLines={1}>
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
    paddingHorizontal: 6, paddingTop: 5, paddingBottom: 4, borderRadius: 24, borderWidth: 1,
    shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0,
  },
  cell: {
    flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 2,
    minHeight: PILL_H + LABEL_H + 3,
  },
  pill: {
    height: PILL_H, minWidth: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0,
  },
  label: {
    height: LABEL_H, fontSize: 11, fontWeight: '700', marginTop: 2,
    textAlign: 'center', includeFontPadding: false,
  },
  iconBadge: {
    position: 'absolute', top: -4, right: 4, minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  iconBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
});
