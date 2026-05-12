// BottomNav — custom tab-bar for MainTabs (UrTruck design v1, macros 07/08).
//
// Five slots:
//   0  Feed   (cargos for driver / trips for client)
//   1  MyWork (My trips for driver / My cargo for client)
//   2  Publish (large floating "+" button — opens CreateTrip / CreateCargo)
//   3  Chats
//   4  Profile
//
// Stage 6 polish (May 2026):
//   - All cells share a fixed visual grid (icon row → label row → active dot).
//     Plus button sits in an `absolute` overlay so it can float above the
//     bar without nudging neighbouring labels up. Label of the publish cell
//     is on the SAME baseline as the others.
//   - Theme-aware: colours come from useV1Colors() so the bar tracks
//     light/dark toggle. The plus button keeps the role accent in both.
//   - Safe area padding uses useSafeAreaInsets() so iOS home indicator and
//     Android gesture bar never overlap labels.
//
// `role` is read from the navigator state (each screen passes it via
// params) or falls back to the AuthContext. The middle button NEVER
// toggles the tab — it intercepts the press and navigates to the create
// flow instead.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1AccentFor } from '../../../theme/designV1';
import { useTheme } from '../../../utils/ThemeContext';
import { useAuth } from '../../../utils/AuthContext';
import { useI18n } from '../../../utils/useI18n';
import { chatAPI } from '../../../utils/chatAPI';

const UNREAD_POLL_MS = 30000;

// Stage DS-1: эмодзи навигации заменены на Feather outline icons
// (2px stroke, monochrome). Это убирает «детский» вид для серьёзного
// логистического B2B-продукта.
//
// Driver / client используют одинаковые иконки для одинаковых функций —
// семантика табов одна и та же, только текст label меняется по роли.
//
// truck — Feed (driver видит грузы, client видит транспорт)
// clipboard — MyWork (мои рейсы / мои грузы)
// message-circle — чат
// user — профиль
const ICONS = {
  Feed:    { driver: 'package',  client: 'truck' },
  MyWork:  { driver: 'clipboard', client: 'clipboard' },
  Chats:   { driver: 'message-circle', client: 'message-circle' },
  Profile: { driver: 'user', client: 'user' },
};

export default function BottomNav({ state, navigation }) {
  const colors = useV1Colors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { session, hasToken } = useAuth();
  const { t } = useI18n();
  const role = session?.user?.role
    || state.routes[0]?.params?.role
    || 'client';
  const isDriver = role === 'driver';
  const accent = v1AccentFor(isDriver ? 'driver' : 'client');

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
      navigation.navigate(isDriver ? 'CreateTrip' : 'CreateCargo', { role });
      return;
    }
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  // Use the bigger of native safe-area inset and a small base pad (web
  // and emulators sometimes report 0 even when the home indicator visually
  // overlaps the bar).
  const bottomPad = Math.max(insets.bottom, 8);

  // Tinted background: pure black is too harsh on light theme; soft surface
  // with a small alpha gives a subtle layer above content without breaking
  // contrast on either side.
  const barBg = isDark ? 'rgba(0,0,0,0.92)' : 'rgba(255,255,255,0.96)';

  return (
    <View
      style={[
        s.bar,
        {
          backgroundColor: barBg,
          borderTopColor: colors.border,
          paddingBottom: bottomPad,
        },
      ]}
      testID="bottom-nav"
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;

        if (route.name === 'Publish') {
          return (
            <View key={route.key} style={s.cell}>
              {/* Plus button overlay — positioned absolute so it doesn't
                  push the publish-label off the shared label baseline. */}
              <View style={s.publishOverlay} pointerEvents="box-none">
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
              </View>
              {/* Spacer — keeps the cell the same height as siblings so the
                  label below stays on the shared baseline. */}
              <View style={s.iconRow} />
              <Text style={[s.label, { color: accent.main }]} numberOfLines={1}>
                {t('bottom_nav_publish')}
              </Text>
              <View style={s.dotSlot} />
            </View>
          );
        }

        const iconKey = ICONS[route.name];
        const iconName = iconKey ? (isDriver ? iconKey.driver : iconKey.client) : 'circle';
        const label = labelOf(route.name);
        const showChatBadge = route.name === 'Chats' && chatUnread > 0;
        const badgeLabel = chatUnread > 9 ? '9+' : String(chatUnread);
        // Stage DS-1: цвет иконки = active accent / muted, нет «масштабирования»
        // эмодзи (раньше использовали transform scale 1.1). С Feather достаточно
        // менять colour и иконка остаётся ровной.
        const iconColor = isFocused ? accent.main : colors.textMuted;

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
            <View style={s.iconRow}>
              <Feather name={iconName} size={22} color={iconColor} />
              {showChatBadge ? (
                <View
                  style={[
                    s.iconBadge,
                    { backgroundColor: colors.error, borderColor: barBg.startsWith('rgba(0') ? '#000' : '#FFF' },
                  ]}
                  testID="bottom-nav-chats-badge"
                >
                  <Text style={s.iconBadgeText}>{badgeLabel}</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                s.label,
                { color: isFocused ? accent.main : colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            <View style={s.dotSlot}>
              {isFocused ? <View style={[s.activeDot, { backgroundColor: accent.main }]} /> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const ICON_ROW_H = 28;
const LABEL_H = 14;
const DOT_H = 6;

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',     // grid is computed top-down inside each cell
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    // Background, border colour, paddingBottom set inline (theme + insets).
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 2,
    minHeight: ICON_ROW_H + LABEL_H + DOT_H + 4, // shared baseline
  },
  iconRow: {
    height: ICON_ROW_H,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  icon: { fontSize: 22, lineHeight: 26 },
  label: {
    height: LABEL_H,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginTop: 2,
    textAlign: 'center',
    includeFontPadding: false,
  },
  dotSlot: {
    height: DOT_H,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  activeDot: { width: 4, height: 4, borderRadius: 2 },
  publishOverlay: {
    position: 'absolute',
    top: -22,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  publishBtn: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  publishPlus: { color: '#0A0A0A', fontSize: 28, fontWeight: '900', lineHeight: 30 },
  iconBadge: {
    position: 'absolute',
    top: -2, right: -12,
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  iconBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
});
