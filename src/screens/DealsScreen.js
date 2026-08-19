import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useV1Colors } from '../theme/designV1';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import { marketAPI } from '../utils/marketAPI';
import { formatPrice } from '../utils/normalizers';
import { localizePlace, localizeCargoName } from '../utils/places';
import { countryFlag } from '../utils/countryFlags';
import { isBidActionable } from '../utils/dealsUnread';

const ACCENT = '#168759';
const ACTIVE_STATUSES = new Set(['accepted', 'in_progress', 'at_border', 'awaiting_confirmation']);
const FINISHED_DEAL_STATUSES = new Set(['completed', 'delivered']);
const CANCELLED_DEAL_STATUSES = new Set(['cancelled']);
const CLOSED_BID_STATUSES = new Set(['rejected', 'cancelled', 'expired']);
const OPEN_BID_STATUSES = new Set(['pending', 'countered']);

const COPY = {
  RU: {
    offers: 'Предложения',
    active: 'В работе',
    archive: 'Архив',
    search: 'Поиск: водитель, маршрут, груз',
    all: 'Все',
    completed: 'Завершённые',
    cancelled: 'Отменённые',
    rejected: 'Отклонённые',
    expired: 'Истекло',
    waiting: 'Ждёт ответа',
    newOffer: 'Новое предложение',
    bargain: 'Торг',
    inWork: 'В работе',
    atBorder: 'На границе',
    waitingConfirm: 'Ждёт подтверждения',
    emptyOffers: 'Новых предложений пока нет',
    emptyActive: 'Активных сделок пока нет',
    emptyArchive: 'Архив пока пуст',
    offersCount: 'предл.',
    from: 'от',
    driver: 'Водитель',
    shipper: 'Грузоотправитель',
  },
  EN: {
    offers: 'Offers',
    active: 'In progress',
    archive: 'Archive',
    search: 'Search: driver, route, cargo',
    all: 'All',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
    expired: 'Expired',
    waiting: 'Waiting for reply',
    newOffer: 'New offer',
    bargain: 'Negotiation',
    inWork: 'In progress',
    atBorder: 'At border',
    waitingConfirm: 'Awaiting confirmation',
    emptyOffers: 'No new offers yet',
    emptyActive: 'No active deals yet',
    emptyArchive: 'Archive is empty',
    offersCount: 'offers',
    from: 'from',
    driver: 'Driver',
    shipper: 'Shipper',
  },
  ZH: {
    offers: '报价',
    active: '进行中',
    archive: '归档',
    search: '搜索：司机、路线、货物',
    all: '全部',
    completed: '已完成',
    cancelled: '已取消',
    rejected: '已拒绝',
    expired: '已过期',
    waiting: '等待回复',
    newOffer: '新报价',
    bargain: '议价中',
    inWork: '运输中',
    atBorder: '在边境',
    waitingConfirm: '等待确认',
    emptyOffers: '暂无新报价',
    emptyActive: '暂无进行中的交易',
    emptyArchive: '归档为空',
    offersCount: '个报价',
    from: '起',
    driver: '司机',
    shipper: '货主',
  },
  KK: {
    offers: 'Ұсыныстар',
    active: 'Жұмыста',
    archive: 'Мұрағат',
    search: 'Іздеу: жүргізуші, бағыт, жүк',
    all: 'Барлығы',
    completed: 'Аяқталған',
    cancelled: 'Болдырылған',
    rejected: 'Қабылданбаған',
    expired: 'Мерзімі өткен',
    waiting: 'Жауап күтуде',
    newOffer: 'Жаңа ұсыныс',
    bargain: 'Саудаласу',
    inWork: 'Жұмыста',
    atBorder: 'Шекарада',
    waitingConfirm: 'Растауды күтуде',
    emptyOffers: 'Жаңа ұсыныстар жоқ',
    emptyActive: 'Белсенді мәмілелер жоқ',
    emptyArchive: 'Мұрағат бос',
    offersCount: 'ұсыныс',
    from: 'бастап',
    driver: 'Жүргізуші',
    shipper: 'Жүк жөнелтуші',
  },
};

const LOCALE = { RU: 'ru-RU', EN: 'en-GB', ZH: 'zh-CN', KK: 'kk-KZ' };

const safeDate = (raw) => {
  if (!raw) return null;
  const normalized = String(raw).includes('T') ? String(raw) : String(raw).replace(' ', 'T');
  const withZone = normalized.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date;
};

export default function DealsScreen({ navigation, route }) {
  const { lang, t } = useI18n();
  const { theme } = useTheme();
  const v1 = useV1Colors();
  const role = route?.params?.role || 'client';
  const copy = COPY[lang] || COPY.EN;

  const [dealTab, setDealTab] = useState('offers');
  const [archiveFilter, setArchiveFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [myCargos, setMyCargos] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const [incomingBids, setIncomingBids] = useState([]);
  const [myBids, setMyBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const relTime = useCallback((raw) => {
    const date = safeDate(raw);
    if (!date) return '';
    const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 1) return t('time_now');
    if (minutes < 60) return `${minutes} ${t('time_min')}`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} ${t('time_hour')}`;
    if (hours < 48) return t('time_yesterday');
    return date.toLocaleDateString(LOCALE[lang] || 'en-GB', { day: '2-digit', month: '2-digit' });
  }, [lang, t]);

  const load = useCallback(async () => {
    try {
      const dashboard = await marketAPI.myDashboard();
      setMyCargos(dashboard?.my_cargos || []);
      setAllDeals(dashboard?.my_deals || []);
      setIncomingBids(dashboard?.incoming_bids || []);
      setMyBids(dashboard?.my_bids || []);
    } catch (error) {
      console.warn('deals load failed', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const offersData = useMemo(() => {
    if (role === 'client') {
      return myCargos
        .filter((cargo) => (cargo.active_bids_count || 0) > 0 && cargo.status === 'active')
        .map((cargo) => ({ kind: 'cargoOffer', data: cargo, sortAt: cargo.latest_bid_at || cargo.created_at || '' }))
        .sort((a, b) => (safeDate(b.sortAt)?.getTime() || 0) - (safeDate(a.sortAt)?.getTime() || 0));
    }
    return [
      ...myBids.filter((bid) => OPEN_BID_STATUSES.has(bid.status)).map((bid) => ({ kind: 'bid', data: bid, sortAt: bid.updated_at || bid.created_at || '' })),
      ...incomingBids
        .filter((bid) => bid.trip_id && OPEN_BID_STATUSES.has(bid.status))
        .map((bid) => ({ kind: 'bid', data: { ...bid, _incoming: true }, sortAt: bid.updated_at || bid.created_at || '' })),
    ].sort((a, b) => (safeDate(b.sortAt)?.getTime() || 0) - (safeDate(a.sortAt)?.getTime() || 0));
  }, [role, myCargos, myBids, incomingBids]);

  const activeDeals = useMemo(() => allDeals
    .filter((deal) => ACTIVE_STATUSES.has(deal.status))
    .map((deal) => ({ kind: 'deal', data: deal, sortAt: deal.last_message_at || deal.updated_at || deal.created_at || '' }))
    .sort((a, b) => (safeDate(b.sortAt)?.getTime() || 0) - (safeDate(a.sortAt)?.getTime() || 0)), [allDeals]);

  const archiveItems = useMemo(() => {
    const deals = allDeals
      .filter((deal) => FINISHED_DEAL_STATUSES.has(deal.status) || CANCELLED_DEAL_STATUSES.has(deal.status))
      .map((deal) => ({ kind: 'deal', data: deal, sortAt: deal.updated_at || deal.created_at || '' }));

    const sourceBids = role === 'client'
      ? incomingBids.filter((bid) => bid.cargo_id && CLOSED_BID_STATUSES.has(bid.status))
      : [
          ...myBids.filter((bid) => CLOSED_BID_STATUSES.has(bid.status)),
          ...incomingBids
            .filter((bid) => bid.trip_id && CLOSED_BID_STATUSES.has(bid.status))
            .map((bid) => ({ ...bid, _incoming: true })),
        ];

    const bids = sourceBids.map((bid) => ({ kind: 'closedBid', data: bid, sortAt: bid.updated_at || bid.created_at || '' }));
    return [...deals, ...bids]
      .sort((a, b) => (safeDate(b.sortAt)?.getTime() || 0) - (safeDate(a.sortAt)?.getTime() || 0));
  }, [role, allDeals, incomingBids, myBids]);

  const attentionOffers = useMemo(() => offersData.reduce((sum, item) => {
    if (item.kind === 'cargoOffer') return sum + ((item.data.active_bids_count || 0) > 0 ? 1 : 0);
    return sum + (isBidActionable(item.data, { asOwner: !!item.data._incoming }) ? 1 : 0);
  }, 0), [offersData]);

  const attentionActive = useMemo(() => activeDeals.reduce(
    (sum, item) => sum + (item.data.unread_count || 0) + (item.data.tracking_action_required ? 1 : 0),
    0,
  ), [activeDeals]);

  const normalize = useCallback((value) => String(value || '').trim().toLowerCase(), []);

  const matchesSearch = useCallback((item) => {
    const q = normalize(query);
    if (!q) return true;
    const data = item.data;
    const haystack = [
      data.from_city,
      data.to_city,
      data.cargo_from,
      data.cargo_to,
      data.trip_from,
      data.trip_to,
      data.cargo_desc,
      data.driver_name,
      data.shipper_name,
      data.last_message,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  }, [normalize, query]);

  const archiveMatchesFilter = useCallback((item) => {
    if (archiveFilter === 'all') return true;
    if (archiveFilter === 'completed') {
      return item.kind === 'deal' && FINISHED_DEAL_STATUSES.has(item.data.status);
    }
    if (archiveFilter === 'rejected') {
      return item.kind === 'closedBid' && item.data.status === 'rejected';
    }
    return (item.kind === 'deal' && item.data.status === 'cancelled')
      || (item.kind === 'closedBid' && ['cancelled', 'expired'].includes(item.data.status));
  }, [archiveFilter]);

  const visibleItems = useMemo(() => {
    const source = dealTab === 'offers' ? offersData : dealTab === 'active' ? activeDeals : archiveItems;
    return source
      .filter((item) => dealTab !== 'archive' || archiveMatchesFilter(item))
      .filter(matchesSearch);
  }, [dealTab, offersData, activeDeals, archiveItems, archiveMatchesFilter, matchesSearch]);

  const routeLabel = useCallback((data) => {
    const from = data.from_city || data.cargo_from || data.trip_from || '—';
    const to = data.to_city || data.cargo_to || data.trip_to || '—';
    return `${countryFlag(data.from_country)} ${localizePlace(from, lang)} → ${countryFlag(data.to_country)} ${localizePlace(to, lang)}`;
  }, [lang]);

  const dealStatus = useCallback((status) => {
    if (status === 'accepted') return { label: t('status_accepted'), color: ACCENT };
    if (status === 'at_border') return { label: copy.atBorder, color: '#3478D4' };
    if (status === 'awaiting_confirmation') return { label: copy.waitingConfirm, color: '#3478D4' };
    if (status === 'in_progress') return { label: copy.inWork, color: '#3478D4' };
    if (status === 'completed' || status === 'delivered') return { label: copy.completed, color: '#7C8B82' };
    if (status === 'cancelled') return { label: copy.cancelled, color: '#8C7070' };
    return { label: status || '—', color: '#7C8B82' };
  }, [copy, t]);

  const bidStatus = useCallback((bid) => {
    if (bid.status === 'rejected') return { label: copy.rejected, color: '#8C7070' };
    if (bid.status === 'expired') return { label: copy.expired, color: '#7C8B82' };
    if (bid.status === 'cancelled') return { label: copy.cancelled, color: '#8C7070' };
    if (bid.status === 'countered') return { label: copy.bargain, color: '#3478D4' };
    return { label: bid._incoming ? copy.newOffer : copy.waiting, color: '#617067' };
  }, [copy]);

  const openDeal = useCallback((deal) => {
    const partnerName = role === 'client'
      ? (deal.driver_name || copy.driver)
      : (deal.shipper_name || copy.shipper);
    navigation.navigate('Chat', {
      dealId: deal.id,
      roomId: deal.chat_room_id || null,
      partner: {
        id: role === 'client' ? deal.driver_id : deal.shipper_id,
        name: partnerName,
      },
      role,
    });
  }, [navigation, role, copy]);

  const renderStatusPill = (label, color) => (
    <View style={[s.statusPill, { backgroundColor: `${color}12` }]}>
      <View style={[s.statusDot, { backgroundColor: color }]} />
      <Text style={[s.statusText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );

  const renderCargoOffer = (cargo) => {
    const time = relTime(cargo.latest_bid_at || cargo.created_at);
    const count = cargo.active_bids_count || 0;
    return (
      <TouchableOpacity
        testID="deals-cargo-offer"
        style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => navigation.navigate('CargoDetail', { cargoId: cargo.id, role })}
        activeOpacity={0.72}
      >
        <View style={s.cardMain}>
          <View style={s.primaryRow}>
            <Text style={[s.route, { color: theme.text }]} numberOfLines={1}>{routeLabel(cargo)}</Text>
            <Text style={[s.price, { color: theme.text }]} numberOfLines={1}>
              {cargo.min_bid_price ? `${copy.from} ${formatPrice(cargo.min_bid_price, cargo.currency || 'USD', t)}` : ''}
            </Text>
          </View>
          <View style={s.secondaryRow}>
            {renderStatusPill(`${count} ${copy.offersCount}`, '#617067')}
            {time ? <Text style={[s.time, { color: theme.textDim }]}>{time}</Text> : null}
          </View>
          {cargo.cargo_desc ? (
            <Text style={[s.meta, { color: theme.textMuted }]} numberOfLines={1}>
              {localizeCargoName(cargo.cargo_desc, lang)}
            </Text>
          ) : null}
        </View>
        <Feather name="chevron-right" size={18} color={theme.textDim} />
      </TouchableOpacity>
    );
  };

  const renderBid = (bid) => {
    const status = bidStatus(bid);
    const time = relTime(bid.updated_at || bid.created_at);
    return (
      <TouchableOpacity
        testID="deals-driver-bid"
        style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, opacity: CLOSED_BID_STATUSES.has(bid.status) ? 0.72 : 1 }]}
        onPress={() => {
          if (bid.cargo_id) navigation.navigate('CargoDetail', { cargoId: bid.cargo_id, bidId: bid.id, role });
          else if (bid.trip_id) navigation.navigate('TripDetail', { tripId: bid.trip_id, bidId: bid.id, role });
        }}
        activeOpacity={0.72}
      >
        <View style={s.cardMain}>
          <View style={s.primaryRow}>
            <Text style={[s.route, { color: theme.text }]} numberOfLines={1}>{routeLabel(bid)}</Text>
            <Text style={[s.price, { color: theme.text }]} numberOfLines={1}>
              {formatPrice(bid.amount, bid.currency || 'USD', t)}
            </Text>
          </View>
          <View style={s.secondaryRow}>
            {renderStatusPill(status.label, status.color)}
            {time ? <Text style={[s.time, { color: theme.textDim }]}>{time}</Text> : null}
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={theme.textDim} />
      </TouchableOpacity>
    );
  };

  const renderDeal = (deal) => {
    const status = dealStatus(deal.status);
    const time = relTime(deal.last_message_at || deal.updated_at || deal.created_at);
    const partner = role === 'client'
      ? (deal.driver_name || copy.driver)
      : (deal.shipper_name || copy.shipper);
    const unread = (deal.unread_count || 0) + (deal.tracking_action_required ? 1 : 0);
    return (
      <TouchableOpacity
        testID="deals-deal-card"
        style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, opacity: deal.status === 'cancelled' ? 0.72 : 1 }]}
        onPress={() => openDeal(deal)}
        activeOpacity={0.72}
      >
        <View style={s.cardMain}>
          <View style={s.primaryRow}>
            <Text style={[s.route, { color: theme.text }]} numberOfLines={1}>{routeLabel(deal)}</Text>
            <Text style={[s.price, { color: theme.text }]} numberOfLines={1}>
              {formatPrice(deal.amount, deal.currency || 'USD', t)}
            </Text>
          </View>
          <View style={s.secondaryRow}>
            <View style={s.statusWithBadge}>
              {renderStatusPill(status.label, status.color)}
              {unread > 0 ? (
                <View style={s.unreadBadge} testID="deal-room-list-unread">
                  <Text style={s.unreadText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              ) : null}
            </View>
            {time ? <Text style={[s.time, { color: theme.textDim }]}>{time}</Text> : null}
          </View>
          <Text style={[s.meta, { color: theme.textMuted }]} numberOfLines={1}>
            {partner}{deal.last_message ? ` · ${deal.last_message}` : ''}
          </Text>
          {deal.tracking_action_required ? (
            <View style={s.actionRow} testID="deal-tracking-action-required">
              <Feather name="navigation" size={12} color="#3478D4" />
              <Text style={s.actionText} numberOfLines={1}>{t('tracking_action_required')}</Text>
            </View>
          ) : null}
        </View>
        <Feather name="chevron-right" size={18} color={theme.textDim} />
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }) => {
    if (item.kind === 'cargoOffer') return renderCargoOffer(item.data);
    if (item.kind === 'bid' || item.kind === 'closedBid') return renderBid(item.data);
    return renderDeal(item.data);
  };

  const chip = ({ key, label, count, attention, compact = false }) => {
    const selected = dealTab === key;
    return (
      <TouchableOpacity
        key={key}
        testID={`deals-tab-${key}`}
        style={[
          s.mainChip,
          compact && s.archiveChip,
          {
            backgroundColor: selected ? '#ECF7F1' : theme.card,
            borderColor: selected ? ACCENT : theme.border,
          },
        ]}
        onPress={() => setDealTab(key)}
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        {compact ? <Feather name="archive" size={14} color={selected ? ACCENT : theme.textMuted} /> : null}
        <Text style={[s.mainChipText, compact && s.archiveChipText, { color: selected ? ACCENT : theme.text }]}>
          {label}
        </Text>
        {count > 0 ? (
          <View style={[s.countBubble, { backgroundColor: attention > 0 ? '#D64545' : (selected ? ACCENT : '#E5E9E7') }]}>
            <Text style={[s.countText, { color: attention > 0 || selected ? '#FFFFFF' : '#617067' }]}>
              {count}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const archiveFilters = [
    ['all', copy.all],
    ['completed', copy.completed],
    ['cancelled', copy.cancelled],
    ['rejected', copy.rejected],
  ];

  const listHeader = (
    <View style={s.listHeader} testID="deals-scroll-header">
      <View style={[s.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Feather name="search" size={17} color={theme.textMuted} />
        <TextInput
          style={[s.searchInput, { color: theme.text }]}
          placeholder={copy.search}
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={setQuery}
          testID="deal-room-search"
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Feather name="x" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {dealTab === 'archive' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.archiveFilters}
          testID="deals-archive-filters"
        >
          {archiveFilters.map(([key, label]) => {
            const selected = archiveFilter === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  s.archiveFilter,
                  {
                    backgroundColor: selected ? '#ECF7F1' : theme.card,
                    borderColor: selected ? ACCENT : theme.border,
                  },
                ]}
                onPress={() => setArchiveFilter(key)}
              >
                <Text style={[s.archiveFilterText, { color: selected ? ACCENT : theme.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  const emptyText = dealTab === 'offers'
    ? copy.emptyOffers
    : dealTab === 'active'
      ? copy.emptyActive
      : copy.emptyArchive;

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: v1.bg }]} edges={['top']} testID="deal-room-list">
      <View style={s.menuRow} testID="deals-minimal-header">
        <View style={{ flex: 1 }} />
        <HeaderMenuButton navigation={navigation} role={role} testID="chats-menu-btn" />
      </View>

      <View style={s.floatingTabs} testID="deals-floating-tabs">
        <View style={s.primaryTabs}>
          {chip({ key: 'offers', label: copy.offers, count: offersData.length, attention: attentionOffers })}
          {chip({ key: 'active', label: copy.active, count: activeDeals.length, attention: attentionActive })}
        </View>
        {chip({ key: 'archive', label: copy.archive, count: archiveItems.length, attention: 0, compact: true })}
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => `${item.kind}-${item.data.id}`}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
          ListEmptyComponent={<Text style={[s.empty, { color: theme.textMuted }]}>{emptyText}</Text>}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          testID="deals-list"
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  menuRow: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  floatingTabs: {
    minHeight: 54,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryTabs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mainChip: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  mainChipText: { fontSize: 14, fontWeight: '700' },
  archiveChip: { minHeight: 36, paddingHorizontal: 11, borderRadius: 18 },
  archiveChipText: { fontSize: 12, fontWeight: '600' },
  countBubble: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 10, fontWeight: '800' },
  listContent: { paddingHorizontal: 12, paddingBottom: 28 },
  listHeader: { paddingBottom: 2 },
  search: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  archiveFilters: { gap: 7, paddingBottom: 8 },
  archiveFilter: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveFilterText: { fontSize: 12, fontWeight: '600' },
  card: {
    minHeight: 88,
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: 8,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.035,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardMain: { flex: 1, gap: 6 },
  primaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusWithBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  route: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  price: { fontSize: 15, lineHeight: 19, fontWeight: '800', flexShrink: 0 },
  time: { fontSize: 11, flexShrink: 0 },
  meta: { fontSize: 12, lineHeight: 16 },
  statusPill: {
    minHeight: 25,
    maxWidth: '78%',
    paddingHorizontal: 8,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: '#D64545',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  actionRow: {
    height: 25,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#3478D412',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  actionText: { color: '#3478D4', fontSize: 11, fontWeight: '600', flexShrink: 1 },
  empty: { paddingTop: 56, textAlign: 'center', fontSize: 14 },
});
