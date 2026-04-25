import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { notificationsAPI } from '../utils/notificationsAPI';

export default function NotificationsScreen({ navigation }) {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

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
        style={[s.card, { backgroundColor: isUnread ? `${theme.card}` : theme.bg, borderColor: theme.border }]}
        onPress={async () => {
          if (isUnread) await notificationsAPI.read(item.id);
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_read: 1 } : i));
        }}
      >
        <Text style={s.icon}>{item.icon || '🔔'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: theme.text, fontWeight: isUnread ? '800' : '500' }]}>{item.title}</Text>
          {item.body ? <Text style={[s.body, { color: theme.textMuted }]}>{item.body}</Text> : null}
          <Text style={[s.time, { color: theme.textDim }]}>{(item.created_at || '').slice(0, 16)}</Text>
        </View>
        {isUnread && <View style={s.dot} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>🔔 Уведомления</Text>
        <TouchableOpacity onPress={markAllRead}>
          <Text style={{ color: '#4F46E5', fontSize: 12, fontWeight: '700' }}>Прочитать все</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={i => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>Нет уведомлений</Text>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, fontWeight: '300' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8,
  },
  icon: { fontSize: 22, marginTop: 2 },
  title: { fontSize: 14, marginBottom: 2 },
  body: { fontSize: 12, lineHeight: 17 },
  time: { fontSize: 10, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4F46E5', marginTop: 6 },
});
