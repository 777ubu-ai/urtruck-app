import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from '../components/Toast';
import { notificationsAPI } from '../utils/notificationsAPI';
import { v1Colors, v1Radius, v1AccentFor } from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';

// Notifications — design v1 reskin. Logic preserved: notificationsAPI.list,
// markAllRead, per-item read. Only the visual layer follows v1 tokens.

export default function NotificationsScreen({ navigation }) {
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

  const renderItem = ({ item }) => {
    const isUnread = !item.is_read;
    return (
      <TouchableOpacity
        style={[s.card, isUnread && { borderColor: accent.main }]}
        onPress={async () => {
          if (isUnread) await notificationsAPI.read(item.id);
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_read: 1 } : i));
        }}
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
    <SafeAreaView style={[{ flex: 1, backgroundColor: v1Colors.bg }]} edges={['top']}>
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
              <Text style={{ color: v1Colors.textMuted }}>Нет уведомлений</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  titleHero: { color: v1Colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  markAll: { fontSize: 12, fontWeight: '800' },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: v1Colors.surface,
    borderColor: v1Colors.border, borderWidth: 1,
    padding: 14, borderRadius: v1Radius.field, marginBottom: 8,
  },
  icon: { fontSize: 22, marginTop: 2 },
  title: { color: v1Colors.text, fontSize: 14, marginBottom: 2 },
  body: { color: v1Colors.textMuted, fontSize: 12, lineHeight: 17 },
  time: { color: v1Colors.textDim, fontSize: 10, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
