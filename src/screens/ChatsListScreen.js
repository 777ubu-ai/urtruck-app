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
//
// Режим «Сделки» (решение владельца 26.07.2026): этот же экран монтируется
// клиенту как вкладка Deals (route.name === 'Deals'). Тогда сверху списка
// переписок появляется секция «Предложения (N)» — входящие ставки водителей
// (pending/countered из myDashboard). Тап по предложению открывает комнату
// сделки (openBidChat → Chat), где торг ведётся в BargainCard, а переписка —
// ниже. Отдельная вкладка «Чаты» у клиента при этом скрыта: чат живёт внутри
// сделки, вторых дверей нет.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useI18n } from '../utils/useI18n';
import { formatStatus } from '../utils/i18n';
import { useTheme } from '../utils/ThemeContext';
import { useV1Colors } from '../theme/designV1';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import { chatAPI } from '../utils/chatAPI';
import { marketAPI } from '../utils/marketAPI';
import { notificationsAPI } from '../utils/notificationsAPI';
import { notifyNotifRead } from '../utils/unreadEvents';
import { useToast } from '../components/Toast';
import { formatPrice } from '../utils/normalizers';
import { localizePlace, localizeCargoName } from '../utils/places';
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
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const role = route?.params?.role || 'client';
  const accent = accentFor(role);
  // Вкладка «Сделки» (client): тот же список комнат + секция входящих ставок.
  const dealsMode = route?.name === 'Deals';

  const [rooms, setRooms] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const data = await chatAPI.rooms();
      setRooms(data.rooms || []);
      if (dealsMode) {
        // Живые предложения: у клиента — входящие ставки водителей по моим
        // грузам, у водителя (на будущее) — его собственные ставки.
        const d = await marketAPI.myDashboard().catch(() => null);
        const raw = d ? (role === 'driver' ? d.my_bids : d.incoming_bids) || [] : [];
        setOffers(raw.filter((b) => b.status === 'pending' || b.status === 'countered'));
      }
    } catch (e) {
      console.warn('chats load failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dealsMode, role]);

  // В режиме «Сделки» открытие вкладки гасит бейдж непрочитанных событий
  // (ставки/статусы) — аналог «варианта Б», который у водителя живёт в
  // MyTripsScreen. История в ленте уведомлений не удаляется.
  useFocusEffect(useCallback(() => {
    if (!dealsMode) return;
    notificationsAPI.readAll().catch(() => {});
    notifyNotifRead();
  }, [dealsMode]));

  // P2-аудит (чаты): раньше список обновлялся ТОЛЬКО при возврате на экран
  // (useFocusEffect без polling) → новые сообщения и бейдж непрочитанного не
  // появлялись, пока список открыт («видно после перезагрузки»). Добавлен
  // лёгкий poll каждые 10с, пока экран в фокусе; снимается на blur/unmount
  // (return cleanup от useFocusEffect). Транспорт прежний — HTTP-опрос.
  useFocusEffect(useCallback(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter((r) => {
      // фильтры (enriched /chat/rooms, PR #62)
      const unread = r.unread_count ?? r.unread ?? 0;
      if (filter === 'unread' && !(unread > 0)) return false;
      if (filter === 'active' && !['active', 'confirmed', 'accepted', 'in_progress', 'at_border', 'picked_up', 'pending'].includes(r.deal_status)) return false;
      if (filter === 'archive' && !['completed', 'delivered', 'cancelled', 'rejected', 'expired'].includes(r.deal_status)) return false;
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

  // Тап по предложению → комната сделки (торг в BargainCard + переписка).
  const openOffer = async (bid) => {
    try {
      const r = await marketAPI.openBidChat(bid.id);
      const roomId = r && (r.chat_room_id || r.chatRoomId);
      if (r && r.ok && roomId) {
        navigation.navigate('Chat', { roomId, role, cargoId: bid.cargo_id, bidId: bid.id });
      } else {
        toast((r && r.detail) || t('chat_open_failed'), 'error');
      }
    } catch {
      toast(t('chat_open_failed'), 'error');
    }
  };

  const renderOfferCard = (bid) => {
    const isCountered = bid.status === 'countered';
    const cur = bid.currency || 'USD';
    const statusColor = isCountered ? '#A855F7' : '#FF8400';
    return (
      <TouchableOpacity
        key={String(bid.id)}
        testID="deals-offer-card"
        style={[s.card, { backgroundColor: theme.card, borderColor: statusColor, borderWidth: 1.5 }]}
        onPress={() => openOffer(bid)}
        activeOpacity={0.85}
      >
        <View style={[s.avatar, { backgroundColor: statusColor + '22' }]}>
          <Feather name="dollar-sign" size={18} color={statusColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.row}>
            <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>
              {localizePlace(bid.cargo_from || '—', lang)} → {localizePlace(bid.cargo_to || '—', lang)}
            </Text>
            <Text style={[s.dealStatus, { color: statusColor }]}>
              {isCountered ? t('bid_countered') : t('bid_pending')}
            </Text>
          </View>
          {bid.cargo_desc ? (
            <Text style={[s.preview, { color: theme.textMuted }]} numberOfLines={1}>
              {localizeCargoName(bid.cargo_desc, lang)}
            </Text>
          ) : null}
          <View style={s.row}>
            <Text style={[s.offerAmount, { color: theme.text }]}>
              {formatPrice(bid.amount, cur, t)}
              {isCountered && bid.counter_amount ? `  →  ${formatPrice(bid.counter_amount, cur, t)}` : ''}
            </Text>
            <Text style={[s.offerOpen, { color: accent }]}>{t('open_bid_chat')} ›</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Секция над списком переписок: предложения, требующие решения.
  const offersHeader = dealsMode && offers.length > 0 ? (
    <View testID="deals-offers-section">
      <Text style={[s.sectionTitle, { color: theme.text }]}>
        {t('tab_offers')} ({offers.length})
      </Text>
      {offers.map(renderOfferCard)}
      <Text style={[s.sectionTitle, { color: theme.text }]}>{t('chat_title')}</Text>
    </View>
  ) : null;

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
              {cargoStr ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Feather name="package" size={13} color={theme.textMuted} />
                  <Text style={[s.cargo, { color: theme.textMuted }]} numberOfLines={1}>{cargoStr}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {bidStr ? <Text style={[s.bid, { color: theme.text }]}>{bidStr}</Text> : null}
                {dealStatus ? <Text style={[s.dealStatus, { color: accent }]}>{formatStatus(dealStatus)}</Text> : null}
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
      <View style={s.titleRow} testID="chats-header">
        {dealsMode ? (
          <MaterialCommunityIcons name="handshake-outline" size={22} color={theme.text} />
        ) : (
          <Feather name="message-square" size={20} color={theme.text} />
        )}
        <Text style={[s.title, { color: theme.text }]}>{dealsMode ? t('tab_deals') : t('chat_title')}</Text>
        <View style={{ flex: 1 }} />
        <HeaderMenuButton navigation={navigation} role={role} testID="chats-menu-btn" />
      </View>

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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filtersScroll} contentContainerStyle={s.filters}>
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
          ListHeaderComponent={offersHeader}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          ListEmptyComponent={<Text style={[s.empty, { color: theme.textMuted }]}>{query || filter !== 'all' ? t('chat_no_results') : (dealsMode ? t('deals_empty') : t('chats_empty'))}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '900' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, paddingHorizontal: 12, height: 44, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  // filtersScroll фиксирует высоту горизонтального ScrollView — иначе на
  // react-native-web он растягивается по вертикали и chips (alignItems:stretch)
  // превращаются в вертикальные «колонны». flexGrow:0 + height = compact-панель.
  filtersScroll: { flexGrow: 0, height: 48 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  chip: { height: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
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
  dealStatus: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  right: { alignItems: 'flex-end', gap: 6 },
  flag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  flagTxt: { fontSize: 11, fontWeight: '900', color: '#EF4444' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#0C0A09', fontSize: 12, fontWeight: '900' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  // Режим «Сделки»: заголовки секций и карточка входящего предложения.
  sectionTitle: { fontSize: 15, fontWeight: '900', marginTop: 6, marginBottom: 8 },
  offerAmount: { fontSize: 16, fontWeight: '900', marginTop: 2, fontVariant: ['tabular-nums'] },
  offerOpen: { fontSize: 12, fontWeight: '800' },
});
