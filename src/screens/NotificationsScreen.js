import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useToast } from '../components/Toast';
import { notificationsAPI } from '../utils/notificationsAPI';
import {v1Colors, useV1Colors, v1Radius, v1AccentFor} from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import { useAuth } from '../utils/AuthContext';
import { useI18n } from '../utils/useI18n';
import { getLanguage } from '../utils/i18n';
import { localizeSystemMessage } from '../utils/places';
import Feather from '@expo/vector-icons/Feather';

// issue #7: localized time вместо сырого UTC-слайса "2026-06-11T08:30".
// Backend хранит UTC; добавляем Z (если нет TZ), чтобы toLocaleString
// показал локальное время устройства в формате локали пользователя.
const NOTIF_LOCALE = { RU: 'ru-RU', KK: 'kk-KZ', ZH: 'zh-CN', EN: 'en-US' };
function formatNotifTime(raw) {
  if (!raw) return '';
  let str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(str) && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(str)) {
    str = str.replace(' ', 'T') + 'Z';
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return String(raw).slice(0, 16).replace('T', ' ');
  const locale = NOTIF_LOCALE[getLanguage && getLanguage()] || 'ru-RU';
  try {
    return d.toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(raw).slice(0, 16).replace('T', ' ');
  }
}

// Notifications — design v1 reskin. Logic preserved: notificationsAPI.list,
// markAllRead, per-item read. Only the visual layer follows v1 tokens.

// PR-C1: backend кладёт в item.url относительный путь маршрута
// (/cargos/{id}?bid=..., /trips/{id}?bid=..., /deals/{id}, /chat,
// /chats/{id}). Парсер тонкий — нам нужны только kind/id/query, без
// поддержки доменов/scheme/anchor. Если url битый или unknown — вернём
// null, навигация не сработает и mark-read останется единственным
// эффектом (см. requirement: "unknown url must not crash; fallback to
// mark-read only").
function parseNotifUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // Drop leading '/' и optional scheme. Backend никогда не шлёт http(s),
  // но на всякий случай отрезаем.
  const cleaned = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
  if (!cleaned) return null;
  const [pathPart, queryPart = ''] = cleaned.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const kind = segments[0].toLowerCase();
  const id = segments[1] || null;
  const params = {};
  if (queryPart) {
    for (const part of queryPart.split('&')) {
      if (!part) continue;
      const [rawK, rawV = ''] = part.split('=');
      if (!rawK) continue;
      try {
        params[decodeURIComponent(rawK)] = decodeURIComponent(rawV);
      } catch {
        params[rawK] = rawV;
      }
    }
  }
  return { kind, id, params };
}

export default function NotificationsScreen({ navigation }) {
  const { session } = useAuth();
  // Гость по умолчанию = client (оранжевый), как в остальном приложении.
  const role = session?.user?.role || 'client';
  const { t, lang } = useI18n();
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  titleHero: { color: v1.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  markAll: { fontSize: 12, fontWeight: '800' },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: v1.surface,
    borderColor: v1.border, borderWidth: 1,
    padding: 14, borderRadius: 10, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  icon: { fontSize: 18, marginTop: 2 },
  title: { color: v1.text, fontSize: 14, marginBottom: 2 },
  body: { color: v1.textMuted, fontSize: 12, lineHeight: 17 },
  time: { color: v1.textDim, fontSize: 11, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },

  }), [v1]);
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const accent = v1AccentFor(role);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const d = await notificationsAPI.list(50);
      setItems(d.notifications || []);
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  // #294: useFocusEffect — обновлять список при каждом возврате на экран
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markAllRead = async () => {
    await notificationsAPI.readAll();
    toast(`✓ ${t('notif_all_read')}`, 'success');
    load();
  };

  // PR-C1: после mark-read открываем целевой экран по item.url.
  // Маршрут только на screen-name'ы, которые точно зарегистрированы в
  // AppNavigator при hasToken+session+role: CargoDetail, TripDetail,
  // Chat, ChatsList. Для unknown kind просто остаёмся на ленте
  // (mark-read уже прошёл).
  const handlePress = async (item) => {
    const isUnread = !item.is_read;
    if (isUnread) {
      try { await notificationsAPI.read(item.id); } catch {}
    }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_read: 1 } : i));
    const parsed = parseNotifUrl(item.url);
    if (!parsed) return;
    const { kind, id, params } = parsed;
    try {
      if (kind === 'cargos' && id) {
        navigation.navigate('CargoDetail', {
          cargoId: id,
          bidId: params.bid || null,
          role,
        });
      } else if (kind === 'trips' && id) {
        navigation.navigate('TripDetail', {
          tripId: id,
          bidId: params.bid || null,
          role,
        });
      } else if (kind === 'deals' && id) {
        // Deal Room = ChatScreen с dealId (карточка сделки + timeline +
        // сообщения). ChatScreen сам резолвит roomId по dealId. Раньше
        // сваливали в общий список чатов — лишний тап и потеря контекста.
        navigation.navigate('Chat', { dealId: id, role });
      } else if ((kind === 'chats' || kind === 'chat') && id) {
        // Часть 4 (правило одного места): bid/deal-уведомления ведут ПРЯМО в
        // комнату чата сделки. ChatScreen ждёт roomId. Обрабатываем и chat, и
        // chats с id (раньше singular chat/{id} терял id и падал в ChatsList).
        navigation.navigate('Chat', { roomId: id, role });
      } else if (kind === 'chat' || kind === 'chats') {
        navigation.navigate('ChatsList');
      }
    } catch {
      // navigate() кидает если screen не зарегистрирован — глушим, не
      // ломаем экран уведомлений.
    }
  };

  // PR-C2 (P0 None bug): backend строит notification text как
  //   f"{user.get('full_name', 'Водитель')} предлагает ${amount} за ..."
  // `dict.get(key, default)` в Python возвращает default ТОЛЬКО когда
  // ключ отсутствует, не когда значение явно None. Для пользователей
  // которые ещё не дозаполнили full_name (большинство pre-pilot) поле
  // приходит как None → итоговый text = "None предлагает $X за ...".
  // Backend fix требует `user.get('full_name') or 'Водитель'`, но мы
  // не трогаем backend; здесь делаем display-time замену.
  const cleanNotifText = (s) => {
    if (!s || typeof s !== 'string') return s;
    return s
      .replace(/^None предлагает/, t('notif_driver_offers'))
      .replace(/^None /, '')
      .replace(/^null предлагает/, t('notif_driver_offers'))
      .replace(/^null /, '');
  };

  const renderItem = ({ item }) => {
    const isUnread = !item.is_read;
    const cleanTitle = localizeSystemMessage(cleanNotifText(item.title), lang);
    const cleanBody = localizeSystemMessage(cleanNotifText(item.body), lang);
    return (
      <TouchableOpacity
        style={[s.card, isUnread && { borderColor: accent.main }]}
        onPress={() => handlePress(item)}
      >
        <Text style={s.icon}>{item.icon || '🔔'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { fontWeight: isUnread ? '700' : '500' }]}>{cleanTitle}</Text>
          {cleanBody ? <Text style={s.body}>{cleanBody}</Text> : null}
          <Text style={s.time}>{formatNotifTime(item.created_at)}</Text>
        </View>
        {isUnread && <View style={[s.dot, { backgroundColor: accent.main }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
      {/* Как вкладка «Сделки» экран — корень таба (назад некуда), справа ☰.
          Как pushed экран (deeplink 'Notifications') — показываем «назад». */}
      <BrandBarWithShare
        onBack={navigation.canGoBack?.() ? () => navigation.goBack() : undefined}
        accent={accent.main}
        rightSlot={<HeaderMenuButton navigation={navigation} role={role} testID="deals-menu-btn" />}
      />
      <View style={s.titleRow}>
        {/* Заголовок совпадает с названием вкладки «Сделки», чтобы вход и
            экран читались как одно целое. */}
        <Text style={s.titleHero}>{t('tab_deals')}</Text>
        {items.some(i => !i.is_read) ? (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={[s.markAll, { color: accent.main }]}>{t('notifications_mark_all_read')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={i => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={accent.main} />}
        ListEmptyComponent={
          !loading ? (
            loadError ? (
              <View style={{ alignItems: 'center', paddingVertical: 60 }} testID="notif-error">
                <Feather name="alert-circle" size={48} color="#EF4444" style={{ marginBottom: 10 }} />
                <Text style={{ color: v1.textMuted }}>{t('load_error')}</Text>
                <TouchableOpacity onPress={load} style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 20, backgroundColor: accent.main, borderRadius: 10 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{t('reload')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Feather name="bell" size={48} color={v1.textMuted} style={{ marginBottom: 10 }} />
                <Text style={{ color: v1.textMuted }}>{t('notifications_empty')}</Text>
              </View>
            )
          ) : null
        }
      />
    </SafeAreaView>
  );
}

