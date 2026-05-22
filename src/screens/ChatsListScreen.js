import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { chatAPI } from '../utils/chatAPI';
import { API_BASE } from '../config/env';
import { prettifyPartnerName } from '../utils/displayName';
import {v1Colors, useV1Colors, v1Radius, v1AccentFor} from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';

// ChatsListScreen — design v1.
//
// Business logic preserved verbatim from the previous implementation:
//   - chatAPI.rooms() loads dialogs
//   - GET /chat/contacts returns the always-online support contacts
//   - card press → navigation.navigate('Chat', { partner, role })
// We just rebuild the visual layer with brand-aligned tokens.

export default function ChatsListScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  container: { flex: 1 },
  titleBlock: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  titleHero: { color: v1.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  sectionTitle: {
    color: v1.textMuted,
    fontSize: 10, fontWeight: '800', letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12, marginBottom: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: v1.surface,
    borderColor: v1.border, borderWidth: 1,
    borderRadius: v1Radius.card,
    paddingHorizontal: 12, paddingVertical: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  avatarIcon: { fontSize: 20 },
  name: { color: v1.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  desc: { color: v1.textMuted, fontSize: 12 },
  time: { color: v1.textDim, fontSize: 10, fontWeight: '600' },
  badge: {
    backgroundColor: v1Colors.error,
    minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },
  empty: { color: v1.textMuted, fontSize: 14, textAlign: 'center' },

  }), [v1]);
  const { role } = route.params || {};
  const { t } = useI18n();
  const { session } = useAuth();
  const userRole = session?.user?.role || role || 'client';
  const accent = v1AccentFor(userRole === 'driver' ? 'driver' : 'client');

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
    } catch {
      // network failure leaves empty lists; user sees the empty-state below.
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const renderContact = ({ item }) => (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('Chat', { partner: { id: item.id, name: item.name }, role })}
    >
      <View style={[s.avatar, { backgroundColor: accent.soft, borderColor: accent.main }]}>
        <Text style={s.avatarIcon}>{item.icon || '🛡'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{item.name}</Text>
        <Text style={s.desc} numberOfLines={1}>{item.desc}</Text>
      </View>
      <View style={[s.onlineDot, { backgroundColor: v1Colors.driver }]} />
    </TouchableOpacity>
  );

  const renderRoom = ({ item }) => {
    // Stage DS-1: prettify технических partner_name / id.
    // Раньше при пустом partner_name UI показывал первые 8 символов
    // partner_id — это и давало «guest_5a», «agent-bo», «d3». Теперь
    // через displayName.prettifyPartnerName всё технические имена
    // подменяются на переводимый fallback "Собеседник".
    const displayName = prettifyPartnerName(item.partner_name, item.partner_id, t);
    // PR-C2 (chat list UX): когда в комнате есть непрочитанные сообщения,
    // имя и preview должны быть жирным шрифтом — как в WhatsApp/Telegram.
    // Раньше визуально все room rows смотрелись одинаково и пользователь
    // не понимал где новое.
    const hasUnread = (item.unread || 0) > 0;
    // PR-C2: время. Backend пишет last_at как 'YYYY-MM-DD HH:MM:SS'.
    // Если сегодня — показываем "HH:MM", иначе "DD.MM" или "Вчера".
    const formatLastAt = (s) => {
      if (!s || typeof s !== 'string' || s.length < 10) return '';
      const [datePart, timePart = ''] = s.split(/[ T]/);
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const ydate = new Date(today); ydate.setDate(ydate.getDate() - 1);
      const yesterdayIso = `${ydate.getFullYear()}-${String(ydate.getMonth() + 1).padStart(2, '0')}-${String(ydate.getDate()).padStart(2, '0')}`;
      if (datePart === todayIso) return timePart.slice(0, 5);
      if (datePart === yesterdayIso) return t('yesterday') || 'Вчера';
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(datePart);
      return m ? `${m[3]}.${m[2]}` : datePart;
    };
    return (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('Chat', {
        partner: { id: item.partner_id, name: displayName },
        role,
      })}
    >
      <View style={[s.avatar, { backgroundColor: v1.surfaceLift, borderColor: v1.border }]}>
        <Text style={s.avatarIcon}>💬</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.name, hasUnread && { fontWeight: '900' }]} numberOfLines={1}>{displayName}</Text>
        <Text style={[s.desc, hasUnread && { color: v1.text, fontWeight: '700' }]} numberOfLines={1}>{item.last_message || '…'}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={s.time}>{formatLastAt(item.last_at)}</Text>
        {hasUnread ? (
          <View style={s.badge}><Text style={s.badgeText}>{item.unread > 9 ? '9+' : item.unread}</Text></View>
        ) : null}
      </View>
    </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandBarWithShare onBack={() => navigation.goBack()} accent={accent.main} />
      <View style={s.titleBlock}>
        <Text style={s.titleHero}>💬 {t('chats_title')}</Text>
      </View>

      <FlatList
        data={[
          ...(contacts.length ? [{ type: 'header', key: 'h1', title: t('always_online') }] : []),
          ...contacts.map(c => ({ ...c, type: 'contact', key: c.id })),
          { type: 'header', key: 'h2', title: t('dialogs') },
          ...rooms.map(r => ({ ...r, type: 'room', key: r.id })),
        ]}
        keyExtractor={i => i.key || i.id}
        renderItem={({ item }) => {
          if (item.type === 'header') return <Text style={s.sectionTitle}>{item.title}</Text>;
          if (item.type === 'contact') return renderContact({ item });
          return renderRoom({ item });
        }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={accent.main} />}
        ListEmptyComponent={
          !loading ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Text style={{ fontSize: 48, marginBottom: 10 }}>💬</Text>
              <Text style={s.empty}>{t('chats_empty')}</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

