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
import { View, Text, TouchableOpacity, StyleSheet, AppState, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
// MaterialCommunityIcons — только ради иконки «рукопожатие» для вкладки
// «Сделки» (в наборе Feather рукопожатия нет). Иконка контурная,
// монохромная → красится в акцент так же, как Feather-иконки.
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useV1Colors, v1AccentFor } from '../../../theme/designV1';
import { useTheme } from '../../../utils/ThemeContext';
import { useAuth } from '../../../utils/AuthContext';
import { useI18n } from '../../../utils/useI18n';
import { useToast } from '../../Toast';
import { chatAPI } from '../../../utils/chatAPI';
import { marketAPI } from '../../../utils/marketAPI';
import { subscribeChatRead } from '../../../utils/unreadEvents';
import { useUnreadNotifications } from '../../../utils/useUnreadNotifications';
import { computeDealsUnread } from '../../../utils/dealsUnread';
// Phase 2A: единая палитра — оранжевый акцент и серый inactive,
// независимо от роли. Раньше driver получал blue, client — yellow;
// для B2B-логистики единый orange выглядит как взрослая платформа.
import { colors as v2 } from '../../../theme/designSystemV2';

const UNREAD_POLL_MS = 12000;

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
// handshake — «Сделки» (весь путь договорённости: ставки → торг →
//         сделка → статусы).
// map-pin — «Граница»: электронная очередь и данные КПП.
// Профиль остаётся наверху под ☰ и не дублируется в bottom bar.
const ICONS = {
  Feed:    { driver: 'package', client: 'truck' },
  MyWork:  { driver: 'clipboard', client: 'clipboard' },
  Deals:   { driver: 'handshake', client: 'handshake' },
  Queue:   { driver: 'map-pin', client: 'map-pin' },
};

// Industrial Luxury: неоновый акцент зависит от роли (источник истины —
// CLAUDE.md: driver #168759 изумруд, client #FF8400 янтарь). Текст поверх
// «+»-кнопки — чёрный (#0C0A09): на изумруде/янтаре даёт AAA-контраст.
const ROLE_ACCENT = {
  driver: { main: '#168759', soft: '#E8F6EF' },
  client: { main: '#168759', soft: '#E8F6EF' },
};

// H1-фикс: безусловная сверка бейджа на иконке приложения с серверным
// unread. Раньше иконку писал useEffect([chatUnread]) — он срабатывал
// ТОЛЬКО при изменении значения, поэтому при cold-start (старт с 0) или
// прочтении через тап по push переход 0→0 не наступал, setBadgeCountAsync(0)
// не вызывался, и кружок на иконке «зависал» (главный симптом владельца).
// Теперь зовётся на КАЖДОМ fetchUnread (mount / поллинг / AppState=active /
// прочтение) → иконка всегда равна серверной правде. На web — noop (Platform).
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
  const { toast } = useToast();
  const role = session?.user?.role
    || state.routes[0]?.params?.role
    || 'client';
  const isDriver = role === 'driver';
  // Industrial Luxury: неоновый акцент по роли (см. ROLE_ACCENT).
  const accent = ROLE_ACCENT[role] || ROLE_ACCENT.client;
  const inactiveColor = v2.textSecondary;

  const [chatUnread, setChatUnread] = useState(0);
  const pollTimer = useRef(null);
  // Бейдж на иконке (вариант 2): единый сигнал «всё новое» = непрочитанный чат
  // + непрочитанные уведомления (колокол). Внутри приложения чат-точка и колокол
  // остаются раздельными, но на home-иконке — суммарный счётчик, чтобы ничего не
  // пропустить. Refs, чтобы любой апдейт (чат ИЛИ уведомления) сразу пересчитал.
  const notifUnread = useUnreadNotifications(hasToken);
  const chatUnreadRef = useRef(0);
  const notifUnreadRef = useRef(0);
  const syncIcon = () => syncAppIconBadge((chatUnreadRef.current || 0) + (notifUnreadRef.current || 0));

  useEffect(() => {
    let mounted = true;
    if (!hasToken) {
      setChatUnread(0);
      chatUnreadRef.current = 0;
      syncIcon();
      return;
    }
    const fetchUnread = async () => {
      try {
        const r = await chatAPI.unread();
        const n = (r && (r.unread ?? r.count ?? r.total)) || 0;
        chatUnreadRef.current = Number(n) || 0;
        if (mounted) setChatUnread(chatUnreadRef.current);
        // H1 + вариант 2: на каждом fetch сверяем иконку = чат + уведомления.
        syncIcon();
      } catch {
        // intentionally silent — UI stays on previous value
      }
    };
    fetchUnread();
    pollTimer.current = setInterval(fetchUnread, UNREAD_POLL_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') fetchUnread();
    });
    // PR-C2 (Task 2 unified badge): mgновенный re-fetch когда юзер
    // прочитал чат — без него badge висит до следующего 30-сек poll.
    // ChatScreen вызывает notifyChatRead() на mount и unmount.
    const unsub = subscribeChatRead(fetchUnread);
    return () => {
      mounted = false;
      clearInterval(pollTimer.current);
      sub?.remove?.();
      unsub?.();
    };
  }, [hasToken]);

  // Вариант 2: при изменении счётчика колокола пересинхронизируем иконку
  // (сумма чат + уведомления). Колокол внутри приложения остаётся отдельным.
  useEffect(() => {
    notifUnreadRef.current = Number(notifUnread) || 0;
    syncIcon();
  }, [notifUnread]);

  // Бейдж таба «Сделки» (05.08.2026, п.4/22 ТЗ, обновлено 2026-08-29):
  // раньше = notifUnread + chatUnread — два счётчика, физически не связанных
  // с тем, что реально видно в самом списке «Сделки». Один источник данных
  // (marketAPI.myDashboard()) завели ещё в августе, но DealsScreen.js до
  // 2026-08-29 всё равно держал СВОИ копии предикатов (доп. фильтр
  // isBidFresh + доп. условие delivered/awaiting_confirmation для client) —
  // числа расходились. Теперь оба потребителя вызывают ОДНИ И ТЕ ЖЕ функции
  // (computeDealsUnread/dealAttentionCount/bidAttentionCount из
  // src/utils/dealsUnread.js) — бейдж таба и сумма по карточкам списка
  // не могут разойтись, т.к. это буквально один и тот же код.
  const [dealsUnread, setDealsUnread] = useState(0);
  const dealsUnreadRef = useRef(0);
  const dealsUnreadReadyRef = useRef(false);
  useEffect(() => {
    let mounted = true;
    if (!hasToken) {
      dealsUnreadRef.current = 0;
      dealsUnreadReadyRef.current = false;
      setDealsUnread(0);
      return;
    }
    const fetchDealsUnread = async () => {
      try {
        const d = await marketAPI.myDashboard();
        const next = computeDealsUnread(d, { role });
        const prev = dealsUnreadRef.current || 0;
        dealsUnreadRef.current = next;
        if (mounted) setDealsUnread(next);
        if (dealsUnreadReadyRef.current && next > prev) {
          toast(`${t('tab_deals')}: новое событие`, 'info', 5500, {
            actionLabel: t('open_action'),
            onAction: () => navigation.navigate('Deals', state.routes.find((r) => r.name === 'Deals')?.params),
          });
        }
        dealsUnreadReadyRef.current = true;
      } catch {
        // тихо — бейдж остаётся на предыдущем значении
      }
    };
    fetchDealsUnread();
    const iv = setInterval(fetchDealsUnread, UNREAD_POLL_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') fetchDealsUnread();
    });
    // Открытие чата сделки тоже гасит часть этого счётчика — пересчитать.
    const unsub = subscribeChatRead(fetchDealsUnread);
    return () => { mounted = false; clearInterval(iv); sub?.remove?.(); unsub?.(); };
  }, [hasToken, role, navigation, state.routes, t, toast]);

  // Иконка приложения (C1) теперь синхронизируется внутри fetchUnread через
  // syncAppIconBadge() — безусловно на каждом fetch (mount/poll/AppState/
  // прочтение). Прежний useEffect([chatUnread]) удалён: он писал иконку лишь
  // при ИЗМЕНЕНИИ chatUnread, из-за чего переход 0→0 (cold-start / тап-push)
  // не сбрасывал кружок (H1).

  const labelOf = (name) => {
    if (name === 'Feed')    return isDriver ? t('tab_feed') : t('tab_feed_client');
    if (name === 'MyWork')  return isDriver ? t('tab_my_work_driver') : t('tab_my_work_client');
    if (name === 'Deals')   return t('tab_deals');
    if (name === 'Queue')   return t('tab_border');
    return name;
  };

  const onPressTab = (route, isFocused) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  // Use the bigger of native safe-area inset and a small base pad (web
  // and emulators sometimes report 0 even when the home indicator visually
  // overlaps the bar).
  const bottomPad = Math.max(insets.bottom, 6);

  // Industrial Luxury: глубокая графитовая подложка (почти чёрная на тёмной
  // теме), скруглённый плавающий бар с тонкой границей и неоновой тенью под
  // активным табом.
  const barBg = isDark ? '#111827' : '#FFFFFF';
  const barBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5ECE8';

  return (
    <View style={[s.wrap, { paddingBottom: bottomPad }]} pointerEvents="box-none" testID="bottom-nav">
      <View style={[s.bar, { backgroundColor: barBg, borderColor: barBorder }]}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;

          const iconKey = ICONS[route.name];
          const iconName = iconKey ? (isDriver ? iconKey.driver : iconKey.client) : 'circle';
          const label = labelOf(route.name);
          const iconColor = isFocused ? accent.main : inactiveColor;
          // Бейджи непрочитанного (05.08.2026, п.4/22 ТЗ):
          //  • «Чаты» (если таб вообще есть) = непрочитанные сообщения (chatUnread).
          //  • «Сделки» = dealsUnread — единая формула (dealsUnread.js),
          //    та же, что даёт сумму по карточкам самого списка «Сделки».
          //    notifUnread здесь больше не участвует: уведомления — отдельная
          //    таблица без привязки к статусу сделки/ставки, реальный сигнал
          //    «есть что сделать» даёт только dealsUnread.
          //  • «Мои грузы / Мои рейсы» (MyWork) — без бейджа: активная сделка
          //    после Фазы A живёт только в «Сделках» (см. MyTripsScreen.js),
          //    дублировать сигнал сюда — значит тянуть пользователя обратно
          //    в старую модель «то же самое в двух местах».
          const tabBadgeCount =
            route.name === 'Chats' ? chatUnread
            : route.name === 'Deals' ? dealsUnread
            : 0;
          const showBadge = tabBadgeCount > 0;
          const badgeLabel = tabBadgeCount > 9 ? '9+' : String(tabBadgeCount);
          const badgeTestID =
            route.name === 'Chats' ? 'bottom-nav-chats-badge'
            : route.name === 'MyWork' ? 'bottom-nav-mywork-badge'
            : 'bottom-nav-deals-badge';

          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => onPressTab(route, isFocused)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
              testID={`bottom-nav-${route.name.toLowerCase()}`}
              style={s.cell}
            >
              {/* Активный таб подсвечивается неоновой «таблеткой»: мягкая
                  заливка accent.soft + цветная тень accent.main = свечение. */}
              <View
                style={[
                  s.pill,
                  isFocused && {
                    backgroundColor: accent.soft,
                    shadowColor: accent.main,
                  },
                ]}
              >
                {route.name === 'Deals' ? (
                  // Рукопожатие только в MaterialCommunityIcons; контурный
                  // вариант (-outline) в едином стиле с Feather-иконками и
                  // читается чётче сплошного. Чуть крупнее (24) для баланса.
                  <MaterialCommunityIcons name="handshake-outline" size={24} color={iconColor} />
                ) : (
                  <Feather name={iconName} size={22} color={iconColor} />
                )}
                {showBadge ? (
                  <View
                    style={[s.iconBadge, { backgroundColor: colors.error, borderColor: barBg }]}
                    testID={badgeTestID}
                  >
                    <Text style={s.iconBadgeText}>{badgeLabel}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[s.label, { color: isFocused ? accent.main : inactiveColor }]}
                numberOfLines={1}
              >
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

const s = StyleSheet.create({
  // Прозрачная обёртка несёт safe-area отступ снизу и боковые поля,
  // чтобы бар «парил» над контентом.
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 7,
    paddingTop: 7,
    paddingBottom: 5,
    borderRadius: 24,
    borderWidth: 1,
    // Тень-подъём всего бара (graphite premium).
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 2,
    minHeight: PILL_H + LABEL_H + 3,
  },
  // «Таблетка» под иконкой — фон+неоновая тень появляются только у активного.
  pill: {
    height: PILL_H,
    minWidth: 46,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowOpacity: 0.55,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  label: {
    height: LABEL_H,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 2,
    textAlign: 'center',
    includeFontPadding: false,
  },
  // «+» клиента — приподнят над баром, круглый, с неоновым свечением акцента.
  publishBtn: {
    width: 50, height: 50, borderRadius: 25,
    marginTop: -16,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  publishLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginTop: 4,
    textAlign: 'center',
    includeFontPadding: false,
  },
  iconBadge: {
    position: 'absolute',
    top: -4, right: 4,
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  iconBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
});
