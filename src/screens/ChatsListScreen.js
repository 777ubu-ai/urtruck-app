import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { chatAPI } from '../utils/chatAPI';
import { API_BASE } from '../config/env';

export default function ChatsListScreen({ navigation, route }) {
  const { role } = route.params || {};
  const { theme } = useTheme();
  const { t } = useI18n();
  const [rooms, setRooms] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [roomsRes, contactsRes] = await Promise.all([
        chatAPI.rooms(),
        fetch(`${API_BASE}/chat/contacts`).then(r => r.json()),
      ]);
      setRooms(roomsRes.rooms || []);
      setContacts(contactsRes.contacts || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const renderContact = ({ item }) => (
    <TouchableOpacity
      style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => navigation.navigate('Chat', { partner: { id: item.id, name: item.name }, role })}
    >
      <View style={[s.avatar, { backgroundColor: '#1A5C3C' }]}>
        <Text style={{ fontSize: 20 }}>{item.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.name, { color: theme.text }]}>{item.name}</Text>
        <Text style={[s.desc, { color: theme.textMuted }]}>{item.desc}</Text>
      </View>
      <View style={[s.onlineDot, { backgroundColor: '#22C55E' }]} />
    </TouchableOpacity>
  );

  const renderRoom = ({ item }) => (
    <TouchableOpacity
      style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => navigation.navigate('Chat', {
        partner: { id: item.partner_id, name: item.partner_name || t('chat_partner_fallback') },
        role,
      })}
    >
      <View style={[s.avatar, { backgroundColor: theme.border }]}>
        <Text style={{ fontSize: 18 }}>💬</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.name, { color: theme.text }]}>{item.partner_name || item.partner_id?.slice(0, 8)}</Text>
        <Text style={[s.desc, { color: theme.textMuted }]} numberOfLines={1}>{item.last_message || '...'}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.time, { color: theme.textDim }]}>{(item.last_at || '').slice(11, 16)}</Text>
        {item.unread > 0 && (
          <View style={s.badge}><Text style={s.badgeText}>{item.unread}</Text></View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>💬 {t('chats_title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={[
          { type: 'header', key: 'h1', title: '🤖 ' + t('always_online') },
          ...contacts.map(c => ({ ...c, type: 'contact', key: c.id })),
          { type: 'header', key: 'h2', title: '💬 ' + t('dialogs') },
          ...rooms.map(r => ({ ...r, type: 'room', key: r.id })),
        ]}
        keyExtractor={i => i.key || i.id}
        renderItem={({ item }) => {
          if (item.type === 'header') return (
            <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{item.title}</Text>
          );
          if (item.type === 'contact') return renderContact({ item });
          return renderRoom({ item });
        }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>
            {t('chats_empty')}
          </Text>
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
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 6,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  desc: { fontSize: 12 },
  time: { fontSize: 10 },
  badge: { backgroundColor: '#EF4444', minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },
});
