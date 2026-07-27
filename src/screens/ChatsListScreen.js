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
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl, ActivityIndicator, ScrollView, Platform, Alert } from 'react-native';
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

// Декластер 27.07 (спека владельца): фильтров минимум. «Непрочитанные»
// убраны — непрочитанные и так всплывают наверх с бейджем; «Активные»
// убраны — это «Все» минус архив, а архив вынесен отдельным чипом.
const FILTERS = [
  { key: 'all',     label: 'chat_filter_all' },
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
  // UX 26.07 (приказ владельца): dealsMode делится на два раздела
  // кнопками слева-справа — «Предложения» (стол переговоров) и «Чаты»
  // (переписка). При первом заходе, если есть живые предложения,
  // открываем сразу их.
  const [seg, setSeg] = useState('chats');
  const segInitRef = React.useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await chatAPI.rooms();
      setRooms(data.rooms || []);
      if (dealsMode) {
        // Живые предложения: у клиента — входящие ставки водителей по моим
        // грузам, у водителя — его собственные ставки.
        const d = await marketAPI.myDashboard().catch(() => null);
        const raw = d ? (role === 'driver' ? d.my_bids : d.incoming_bids) || [] : [];
        // Мёртвые ставки не показываем: груз удалён (LEFT JOIN дал пустой
        // маршрут) — торговаться не о чем, карточка «— → —» только путала.
        const live = raw.filter((b) =>
          (b.status === 'pending' || b.status === 'countered')
          && !(b.cargo_id && !b.cargo_from && !b.trip_id)
        );
        setOffers(live);
        if (!segInitRef.current) {
          segInitRef.current = true;
          if (live.length > 0) setSeg('offers');
        }
      }
    } catch (e) {
      console.warn('chats load failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dealsMode, role]);

  // В режиме «Сделки» открытие вкладки гасит бейдж непрочитанных событий
  // (ставки/статусы). Это ЕДИНСТВЕННОЕ место гашения для обеих ролей —
  // в MyTripsScreen ничего не гасится. История уведомлений не удаляется.
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

  // Непрочитанные комнаты — ВСЕГДА наверху списка (жалоба владельца: «бейдж 4,
  // а сообщения найти не могу»). Внутри групп — свежие выше (порядок сервера).
  const unreadRoomsCount = useMemo(
    () => rooms.filter((r) => (r.unread_count ?? r.unread ?? 0) > 0).length,
    [rooms]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const un = (r) => ((r.unread_count ?? r.unread ?? 0) > 0 ? 0 : 1);
    return rooms.slice().sort((a, b) => un(a) - un(b)).filter((r) => {
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

  // Убрать предложение из списка: водитель отменяет СВОЮ ставку, клиент
  // отклоняет входящую. С подтверждением — действие необратимо.
  const dismissOffer = async (bid) => {
    const q = role === 'driver' ? t('cancel_bid_confirm') : t('reject_bid_confirm_q');
    const doIt = async () => {
      const r = role === 'driver'
        ? await marketAPI.cancelBid(bid.id).catch(() => null)
        : await marketAPI.rejectBid(bid.id).catch(() => null);
      if (r && r.ok) { toast(role === 'driver' ? t('bid_cancelled_toast') : t('bid_rejected_toast'), 'success'); load(); }
      else toast((r && r.detail) || t('send_error'), 'error');
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(q)) doIt();
    } else {
      Alert.alert(q, '', [
        { text: t('cancel'), style: 'cancel' },
        { text: 'OK', onPress: doIt },
      ]);
    }
  };

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
    // Цвет = что требуется: оранжевый «горит» — нужно решение, фиолетовый —
    // идёт торг. Заливка, а не только рамка: в кабине на солнце тонкую
    // рамку не видно. Метка словами: клиенту «Новое предложение», водителю
    // (его собственная ставка) — «Ждёт ответа».
    const label = isCountered
      ? t('deals_offer_bargain')
      : (role === 'driver' ? t('deals_offer_waiting') : t('deals_offer_new'));
    return (
      <TouchableOpacity
        key={String(bid.id)}
        testID="deals-offer-card"
        style={[s.card, { backgroundColor: statusColor + '14', borderColor: statusColor, borderWidth: 1.5 }]}
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
            <Text style={[s.dealStatus, { color: statusColor }]}>{label}</Text>
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
        {/* Убрать предложение (водитель — отменить свою ставку, клиент —
            отклонить входящую) прямо из списка, без захода в комнату. */}
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation && e.stopPropagation(); dismissOffer(bid); }}
          style={s.offerDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID="deals-offer-dismiss"
        >
          <Feather name="x" size={16} color="#EF4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // UX 26.07: два раздела кнопками слева-справа (приказ владельца) —
  // «Предложения (N)» и «Чаты». Показ прилепленной секции над списком убран.
  const showOffersSeg = dealsMode && seg === 'offers';

  // Декластер 27.07 (спека владельца): карточка компактнее (~-20% высоты),
  // жирным только имя / цена / счётчик непрочитанных; роль — маленькой серой
  // меткой у имени; маршрут+груз+вес — одна серая строка; статус — цветная
  // точка + мелкий серый текст (не кричащий зелёный капс); бейдж
  // непрочитанного — оранжевый сигнальный, а не акцент роли.
  const STATUS_DOT = {
    accepted: '#22C55E', confirmed: '#22C55E',
    in_progress: '#FF8400', picked_up: '#FF8400', at_border: '#2563EB',
    completed: '#94A3B8', delivered: '#94A3B8',
    cancelled: '#EF4444', rejected: '#EF4444', expired: '#94A3B8',
  };
  const renderItem = ({ item }) => {
    const partnerName = prettifyPartnerName(item.partner_name, item.partner_id, t);
    const isSupport = item.is_support || item.partner_role === 'support' || item.partner_id === 'urtruck-support-bot';
    const roleKey = ROLE_LABEL[item.partner_role] || (isSupport ? 'role_support' : null);
    const routeStr = item.route_label || [item.route_from, item.route_to].filter(Boolean).join(' → ');
    const cargoStr = [item.cargo_title, item.cargo_weight ? `${item.cargo_weight}т` : null].filter(Boolean).join(' · ');
    const infoStr = [routeStr, cargoStr].filter(Boolean).join(' · ');
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
        <View style={[s.avatar, { backgroundColor: accent + '18' }]}>
          <Feather name={isSupport ? 'shield' : 'user'} size={16} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.row}>
            <Text style={{ flex: 1 }} numberOfLines={1}>
              <Text style={[s.name, { color: theme.text }]}>{partnerName}</Text>
              {roleKey ? <Text style={[s.roleInline, { color: theme.textDim }]}>  ·  {t(roleKey)}</Text> : null}
            </Text>
            {time ? <Text style={[s.time, { color: theme.textDim }]}>{time}</Text> : null}
          </View>
          {infoStr ? (
            <Text style={[s.info, { color: theme.textMuted }]} numberOfLines={1}>{infoStr}</Text>
          ) : null}
          <View style={s.row}>
            <Text style={[s.preview, { color: theme.textMuted }]} numberOfLines={1}>
              {item.last_message || t('chat_no_messages')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {bidStr ? <Text style={[s.bid, { color: theme.text }]}>{bidStr}</Text> : null}
              {dealStatus ? (
                <>
                  <View style={[s.statusDot, { backgroundColor: STATUS_DOT[dealStatus] || '#94A3B8' }]} />
                  <Text style={[s.statusTiny, { color: theme.textDim }]}>{formatStatus(dealStatus)}</Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
        <View style={s.right}>
          {urgent ? (
            <View style={[s.flag, { backgroundColor: '#EF444422' }]}>
              <Text style={s.flagTxt}>{t(item.is_dispute ? 'chat_flag_dispute' : 'chat_flag_urgent')}</Text>
            </View>
          ) : null}
          {unread > 0 ? (
            <View style={[s.badge, { backgroundColor: '#FF8400' }]} testID="deal-room-list-unread">
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

      {/* UX 26.07: два раздела кнопками слева-справа. Слева — стол
          переговоров (живые ставки), справа — вся переписка. */}
      {dealsMode ? (
        <View style={[s.segWrap, { backgroundColor: theme.card, borderColor: theme.border }]} testID="deals-seg">
          <TouchableOpacity
            style={[s.segBtn, seg === 'offers' && { backgroundColor: accent }]}
            onPress={() => setSeg('offers')}
            testID="deals-seg-offers"
          >
            <Text style={[s.segTxt, { color: seg === 'offers' ? '#0C0A09' : theme.textMuted }]}>{t('tab_offers')}</Text>
            {offers.length > 0 ? (
              <View style={[s.segBadge, { backgroundColor: seg === 'offers' ? '#0C0A09' : '#FF8400' }]}>
                <Text style={[s.segBadgeTxt, { color: seg === 'offers' ? accent : '#FFF' }]}>{offers.length}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.segBtn, seg === 'chats' && { backgroundColor: accent }]}
            onPress={() => setSeg('chats')}
            testID="deals-seg-chats"
          >
            <Text style={[s.segTxt, { color: seg === 'chats' ? '#0C0A09' : theme.textMuted }]}>{t('tab_chats')}</Text>
            {unreadRoomsCount > 0 ? (
              <View style={[s.segBadge, { backgroundColor: seg === 'chats' ? '#0C0A09' : '#EF4444' }]}>
                <Text style={[s.segBadgeTxt, { color: seg === 'chats' ? accent : '#FFF' }]}>{unreadRoomsCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      ) : null}

      {!showOffersSeg ? (
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
      ) : null}

      {!showOffersSeg ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filtersScroll} contentContainerStyle={s.filters}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            // Счётчик на «Непрочитанных» — сразу видно, сколько сообщений искать.
            const label = f.key === 'unread' && unreadRoomsCount > 0
              ? `${t(f.label)} (${unreadRoomsCount})`
              : t(f.label);
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[s.chip, { backgroundColor: on ? accent : theme.card, borderColor: on ? accent : theme.border }]}
                testID={`deal-room-filter-${f.key}`}
              >
                <Text style={[s.chipTxt, { color: on ? '#0C0A09' : theme.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {loading ? (
        <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
      ) : showOffersSeg ? (
        <FlatList
          data={offers}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => renderOfferCard(item)}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          ListEmptyComponent={<Text style={[s.empty, { color: theme.textMuted }]}>{t('deals_no_offers')}</Text>}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          ListEmptyComponent={<Text style={[s.empty, { color: theme.textMuted }]}>{query || filter !== 'all' ? t('chat_no_results') : (dealsMode ? (role === 'driver' ? t('deals_empty_driver') : t('deals_empty')) : t('chats_empty'))}</Text>}
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
  // Декластер 27.07: карточка ниже (~20%), жирным только имя/цена/счётчик.
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 13, borderWidth: 1, marginBottom: 6 },
  avatar: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 15, fontWeight: '800' },
  roleInline: { fontSize: 12, fontWeight: '400' },
  time: { fontSize: 11 },
  info: { fontSize: 12, fontWeight: '400', marginTop: 1 },
  preview: { fontSize: 13, fontWeight: '400', marginTop: 1, flex: 1 },
  bid: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusTiny: { fontSize: 10, fontWeight: '400' },
  // Метка на карточке ПРЕДЛОЖЕНИЯ («Новое предложение»/«Торг») — там она
  // главный сигнал, остаётся заметной (в чатах статусы — точкой).
  dealStatus: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  right: { alignItems: 'flex-end', gap: 5 },
  flag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  flagTxt: { fontSize: 11, fontWeight: '900', color: '#EF4444' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#0C0A09', fontSize: 12, fontWeight: '900' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  // Режим «Сделки»: заголовки секций и карточка входящего предложения.
  sectionTitle: { fontSize: 15, fontWeight: '900', marginTop: 6, marginBottom: 8 },
  offerAmount: { fontSize: 16, fontWeight: '900', marginTop: 2, fontVariant: ['tabular-nums'] },
  offerOpen: { fontSize: 12, fontWeight: '800' },
  // Сегмент-переключатель «Предложения | Чаты» (кнопки слева-справа).
  segWrap: { flexDirection: 'row', marginHorizontal: 12, marginBottom: 10, borderRadius: 14, borderWidth: 1, padding: 3, gap: 3 },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 11 },
  segTxt: { fontSize: 14, fontWeight: '900' },
  segBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  segBadgeTxt: { fontSize: 11, fontWeight: '900' },
  offerDismiss: { alignSelf: 'flex-start', width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
});
