// ChatsListScreen — Deal Room список (PR2).
//
// Серьёзный B2B-список сделок поверх backend foundation. Источник данных —
// chatAPI.rooms() (старый эндпоинт, не сломан); навигация в 'Chat' сохранена.
//
// PR2 добавляет: заголовок, поиск (имя/компания/маршрут/груз/госномер),
// фильтры (Все/Непрочитанные/Активные/Архив/Поддержка), обогащённые карточки
// (роль, маршрут, груз, статус, последнее сообщение, время, unread, индикатор
// поддержка/спор/срочно). Industrial Luxury, dark premium.
//
// Не трогает driver tab-bar и client nav — это таб-route 'Chats'.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useV1Colors } from '../theme/designV1';
import { chatAPI } from '../utils/chatAPI';
import { prettifyPartnerName } from '../utils/displayName';
import { accentFor } from '../components/deal/DealRoom';

const FILTERS = [
  { key: 'all',     label: 'chat_filter_all' },
  { key: 'unread',  label: 'chat_filter_unread' },
  { key: 'active',  label: 'chat_filter_active_deals' },
  { key: 'archive', label: 'chat_filter_archive' },
  { key: 'support', label: 'chat_filter_support' },
];

const ROLE_LABEL = { driver: 'role_driver', client: 'role_client', support: 'role_support' };

export default function ChatsListScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { t } = useI18n();
  const { theme } = useTheme();
  const role = route?.params?.role || 'client';
  const accent = accentFor(role);

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const data = await chatAPI.rooms();
      setRooms(data.rooms || []);
    } catch (e) {
      console.warn('chats load failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter((r) => {
      // фильтры (enriched /chat/rooms, PR #62)
      const unread = r.unread_count ?? r.unread ?? 0;
      if (filter === 'unread' && !(unread > 0)) return false;
      if (filter === 'active' && !['active', 'confirmed', 'in_progress', 'pending'].includes(r.deal_status)) return false;
      if (filter === 'archive' && !['completed', 'delivered', 'cancelled', 'rejected'].includes(r.deal_status)) return false;
      if (filter === 'support' && !r.is_support && r.partner_role !== 'support' && r.partner_id !== 'urtruck-support-bot') return false;
      // поиск
      if (!q) return true;
      const hay = [
        prettifyPartnerName(r.partner_name, r.partner_id, t), r.partner_company,
        r.route_label, r.route_from, r.route_to,
        r.cargo_title, r.cargo_type, r.vehicle_plate, r.last_message,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rooms, query, filter]);

  const renderItem = ({ item }) => {
    // Enriched /chat/rooms (PR #62): реальные данные сделки. Партнёр — через
    // корректную сигнатуру prettifyPartnerName(name, id, t).
    const partnerName = prettifyPartnerName(item.partner_name, item.partner_id, t);
    const isSupport = item.is_support || item.partner_role === 'support' || item.partner_id === 'urtruck-support-bot';
    const roleKey = ROLE_LABEL[item.partner_role] || (isSupport ? 'role_support' : null);
    const routeStr = item.route_label || [item.route_from, item.route_to].filter(Boolean).join(' → ');
    const cargoStr = [item.cargo_title, item.cargo_weight ? `${item.cargo_weight}т` : null].filter(Boolean).join(' · ');
    const bidStr = item.bid_amount != null ? `${item.bid_amount}${item.bid_currency ? ' ' + item.bid_currency : ''}` : null;
    const dealStatus = item.deal_status || null;
    const urgent = item.is_dispute || item.priority === 'urgent' || item.priority === 'support';
    const unread = item.unread_count ?? item.unread ?? 0;
    const time = (item.last_message_at || item.last_at || '').slice(11, 16);
    return (
      <TouchableOpacity
        testID="deal-room-list-card"
        style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => navigation.navigate('Chat', { partner: { id: item.partner_id || item.id, name: partnerName }, roomId: item.id, dealId: item.deal_id, role })}
      >
        <View style={[s.avatar, { backgroundColor: accent + '22' }]}>
          <Feather name={isSupport ? 'shield' : 'user'} size={18} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.row}>
            <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{partnerName}</Text>
            {time ? <Text style={[s.time, { color: theme.textDim }]}>{time}</Text> : null}
          </View>
          {(roleKey || routeStr) ? (
            <View style={s.row}>
              {roleKey ? <Text style={[s.metaTag, { color: accent }]}>{t(roleKey)}</Text> : null}
              {routeStr ? <Text style={[s.meta, { color: theme.textMuted }]} numberOfLines={1}>{routeStr}</Text> : null}
            </View>
          ) : null}
          {(cargoStr || bidStr || dealStatus) ? (
            <View style={s.row}>
              {cargoStr ? <Text style={[s.cargo, { color: theme.textMuted }]} numberOfLines={1}>📦 {cargoStr}</Text> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {bidStr ? <Text style={[s.bid, { color: theme.text }]}>{bidStr}</Text> : null}
                {dealStatus ? <Text style={[s.dealStatus, { color: accent }]}>{dealStatus}</Text> : null}
              </View>
            </View>
          ) : null}
          <Text style={[s.preview, { color: theme.textMuted }]} numberOfLines={1}>
            {item.last_message || t('chat_no_messages')}
          </Text>
        </View>
        <View style={s.right}>
          {urgent ? (
            <View style={[s.flag, { backgroundColor: '#EF444422' }]}>
              <Text style={s.flagTxt}>{t(item.is_dispute ? 'chat_flag_dispute' : 'chat_flag_urgent')}</Text>
            </View>
          ) : null}
          {unread > 0 ? (
            <View style={[s.badge, { backgroundColor: accent }]} testID="deal-room-list-unread">
              <Text style={s.badgeTxt}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']} testID="deal-room-list">
      <Text style={[s.title, { color: theme.text }]}>💬 {t('chat_title')}</Text>

      <View style={[s.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Feather name="search" size={17} color={theme.textMuted} />
        <TextInput
          style={[s.searchInput, { color: theme.text }]}
          placeholder={t('chat_search_placeholder')}
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={setQuery}
          testID="deal-room-search"
        />
        {query ? <TouchableOpacity onPress={() => setQuery('')}><Feather name="x" size={16} color={theme.textMuted} /></TouchableOpacity> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[s.chip, { backgroundColor: on ? accent : theme.card, borderColor: on ? accent : theme.border }]}
              testID={`deal-room-filter-${f.key}`}
            >
              <Text style={[s.chipTxt, { color: on ? '#0C0A09' : theme.textMuted }]}>{t(f.label)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          ListEmptyComponent={<Text style={[s.empty, { color: theme.textMuted }]}>{query || filter !== 'all' ? t('chat_no_results') : t('chats_empty')}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '900', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, paddingHorizontal: 12, height: 44, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  chipTxt: { fontSize: 12, fontWeight: '800' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 15, fontWeight: '800', flex: 1 },
  time: { fontSize: 11 },
  metaTag: { fontSize: 11, fontWeight: '800' },
  meta: { fontSize: 12, flex: 1, textAlign: 'right' },
  preview: { fontSize: 13, marginTop: 2 },
  cargo: { fontSize: 12, flex: 1 },
  bid: { fontSize: 12, fontWeight: '800' },
  dealStatus: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  right: { alignItems: 'flex-end', gap: 6 },
  flag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  flagTxt: { fontSize: 9, fontWeight: '900', color: '#EF4444' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#0C0A09', fontSize: 12, fontWeight: '900' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
