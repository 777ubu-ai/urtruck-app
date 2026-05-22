import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from '../components/Toast';
import { notificationsAPI } from '../utils/notificationsAPI';
import {v1Colors, useV1Colors, v1Radius, v1AccentFor} from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import { useAuth } from '../utils/AuthContext';

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
  const role = session?.user?.role || 'driver';
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  titleHero: { color: v1.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  markAll: { fontSize: 12, fontWeight: '800' },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: v1.surface,
    borderColor: v1.border, borderWidth: 1,
    padding: 14, borderRadius: v1Radius.field, marginBottom: 8,
  },
  icon: { fontSize: 22, marginTop: 2 },
  title: { color: v1.text, fontSize: 14, marginBottom: 2 },
  body: { color: v1.textMuted, fontSize: 12, lineHeight: 17 },
  time: { color: v1.textDim, fontSize: 10, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },

  }), [v1]);
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const accent = v1AccentFor('driver');

  const load = async () => {
    setLoading(true);
    try {
      const d = await notificationsAPI.list(50);
      setItems(d.notifications || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markAllRead = async () => {
    await notificationsAPI.readAll();
    toast('✓ Все прочитаны', 'success');
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
        // У сделок нет собственного экрана (см. AppNavigator) — открываем
        // список чатов, оттуда пользователь дойдёт до диалога по сделке.
        navigation.navigate('ChatsList');
      } else if (kind === 'chats' && id) {
        navigation.navigate('Chat', { chatId: id });
      } else if (kind === 'chat' || kind === 'chats') {
        navigation.navigate('ChatsList');
      }
    } catch {
      // navigate() кидает если screen не зарегистрирован — глушим, не
      // ломаем экран уведомлений.
    }
  };

  const renderItem = ({ item }) => {
    const isUnread = !item.is_read;
    return (
      <TouchableOpacity
        style={[s.card, isUnread && { borderColor: accent.main }]}
        onPress={() => handlePress(item)}
      >
        <Text style={s.icon}>{item.icon || '🔔'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { fontWeight: isUnread ? '800' : '500' }]}>{item.title}</Text>
          {item.body ? <Text style={s.body}>{item.body}</Text> : null}
          <Text style={s.time}>{(item.created_at || '').slice(0, 16)}</Text>
        </View>
        {isUnread && <View style={[s.dot, { backgroundColor: accent.main }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
      <BrandBarWithShare onBack={() => navigation.goBack()} accent={accent.main} />
      <View style={s.titleRow}>
        <Text style={s.titleHero}>🔔 Уведомления</Text>
        {items.some(i => !i.is_read) ? (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={[s.markAll, { color: accent.main }]}>Прочитать все</Text>
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
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Text style={{ fontSize: 48, marginBottom: 10 }}>🔔</Text>
              <Text style={{ color: v1.textMuted }}>Нет уведомлений</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

