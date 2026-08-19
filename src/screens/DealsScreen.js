import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { formatStatus } from '../utils/i18n';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import { marketAPI } from '../utils/marketAPI';
import { formatPrice } from '../utils/normalizers';
import { localizeCargoName, localizePlace } from '../utils/places';
import { countryFlag } from '../utils/countryFlags';
import { accentFor } from '../components/deal/DealRoom';
import { isBidActionable } from '../utils/dealsUnread';

const PAGE_BG = '#F7F9F7';
const SURFACE = '#FFFFFF';
const TEXT = '#17221E';
const TEXT_SECONDARY = '#606B66';
const TEXT_MUTED = '#808A85';
const BORDER = '#E5EAE7';
const ACCENT = '#34936B';
const ACCENT_SOFT = '#EAF5EF';
const WAITING = '#617067';
const INFO = '#3478D4';
const ARCHIVE = '#7C8B82';
const CANCELLED = '#A45A5A';

const ACTIVE_STATUSES = new Set(['accepted', 'in_progress', 'at_border', 'awaiting_confirmation']);
const ARCHIVE_DEAL_STATUSES = new Set(['completed', 'delivered', 'cancelled', 'rejected', 'expired']);
const OPEN_BID_STATUSES = new Set(['pending', 'countered']);
const CLOSED_BID_STATUSES = new Set(['rejected', 'cancelled', 'expired']);

const COPY = {
  RU: {
    archive: 'Архив',
    search: 'Поиск: водитель, маршрут, груз',
    loadError: 'Не удалось загрузить сделки',
    retry: 'Повторить',
    offersEmpty: 'Новых предложений пока нет',
    activeEmpty: 'Активных сделок пока нет',
    archiveEmpty: 'Архив пока пуст',
  },
  EN: {
    archive: 'Archive',
    search: 'Search: driver, route, cargo',
    loadError: 'Could not load deals',
    retry: 'Retry',
    offersEmpty: 'No new offers yet',
    activeEmpty: 'No active deals yet',
    archiveEmpty: 'Archive is empty',
  },
  ZH: {
    archive: '归档',
    search: '搜索：司机、路线、货物',
    loadError: '无法加载交易',
    retry: '重试',
    offersEmpty: '暂无新报价',
    activeEmpty: '暂无进行中的交易',
    archiveEmpty: '归档为空',
  },
  KK: {
    archive: 'Мұрағат',
    search: 'Іздеу: жүргізуші, бағыт, жүк',
    loadError: 'Мәмілелерді жүктеу мүмкін болмады',
    retry: 'Қайталау',
    offersEmpty: 'Жаңа ұсыныстар әзірге жоқ',
    activeEmpty: 'Белсенді мәмілелер әзірге жоқ',
    archiveEmpty: 'Мұрағат бос',
  },
};

const parseServerDate = (raw) => {
  if (!raw) return null;
  const normalized = String(raw).replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dealStatus = (status, t) => {
  if (status === 'accepted') return { label: t('status_accepted'), color: ACCENT };
  if (status === 'in_progress' || status === 'at_border') {
    return { label: t('status_in_progress'), color: ACCENT };
  }
  if (status === 'awaiting_confirmation') return { label: t('status_delivered'), color: INFO };
  if (status === 'completed' || status === 'delivered') {
    return { label: t('status_delivered'), color: ARCHIVE };
  }
  if (status === 'cancelled' || status === 'rejected') {
    return { label: t('status_cancelled'), color: CANCELLED };
  }
  if (status === 'expired') return { label: formatStatus(status), color: ARCHIVE };
  return { label: formatStatus(status), color: ARCHIVE };
};

function TabChip({ label, count, active, onPress, testID, compact = false, icon = null }) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      activeOpacity={0.72}
      onPress={onPress}
      style={[
        s.tabChip,
        compact && s.archiveChip,
        active && s.tabChipActive,
      ]}
    >
      {icon ? <Feather name={icon} size={15} color={active ? ACCENT : TEXT_MUTED} /> : null}
      <Text style={[s.tabChipText, active && s.tabChipTextActive]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.tabCount, active && s.tabCountActive]}>{count}</Text>
    </TouchableOpacity>
  );
}

function CompactDealCard({
  routeLabel,
  price,
  statusLabel,
  statusColor,
  time,
  meta,
  unread = 0,
  dimmed = false,
  onPress,
  testID,
}) {
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.72}
      onPress={onPress}
      style={[s.card, dimmed && s.cardDimmed]}
    >
      <View style={s.cardTop}>
        <Text style={s.route} numberOfLines={1}>{routeLabel}</Text>
        {price ? <Text style={s.price} numberOfLines={1}>{price}</Text> : null}
        <Feather name="chevron-right" size={17} color="#A0A9A4" />
      </View>

      <View style={s.cardMiddle}>
        <View style={[s.statusPill, { backgroundColor: `${statusColor}12` }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusText, { color: statusColor }]} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>
        <View style={s.cardRightMeta}>
          {time ? <Text style={s.time}>{time}</Text> : null}
          {unread > 0 ? (
            <View style={s.unreadBadge} testID="deals-card-unread">
              <Text style={s.unreadText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {meta ? <Text style={s.meta} numberOfLines={1}>{meta}</Text> : null}
    </TouchableOpacity>
  );
}

export default function DealsScreen({ navigation, route }) {
  const { t, lang } = useI18n();
  const role = route?.params?.role || 'client';
  const roleAccent = accentFor(role) || ACCENT;
  const copy = COPY[lang] || COPY.EN;

  const [dealTab, setDealTab] = useState('offers');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [myCargos, setMyCargos] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const [incomingBids, setIncomingBids] = useState([]);
  const [myBids, setMyBids] = useState([]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const dashboard = await marketAPI.myDashboard();
      if (!dashboard) throw new Error('empty_dashboard');
      setMyCargos(dashboard.my_cargos || []);
      setAllDeals(dashboard.my_deals || []);
      setIncomingBids(dashboard.incoming_bids || []);
      setMyBids(dashboard.my_bids || []);
    } catch (error) {
      setLoadError(true);
      console.warn('deals load failed', error?.message || error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]));

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const relTime = useCallback((raw) => {
    const date = parseServerDate(raw);
    if (!date) return '';
    const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 1) return t('time_now');
    if (minutes < 60) return `${minutes} ${t('time_min')}`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} ${t('time_hour')}`;
    if (Math.round(hours / 24) === 1) return t('time_yesterday');
    const locale = lang === 'ZH' ? 'zh-CN' : lang === 'EN' ? 'en-GB' : lang === 'KK' ? 'kk-KZ' : 'ru-RU';
    return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  }, [t, lang]);

  const endpoint = useCallback((country, city) => {
    const flag = countryFlag(country);
    const place = localizePlace(city || '—', lang);
    return [flag, place].filter(Boolean).join(' ');
  }, [lang]);

  const routeFor = useCallback((item, kind) => {
    if (kind === 'offer' && role === 'client') {
      return `${endpoint(item.from_country, item.from_city)} → ${endpoint(item.to_country, item.to_city)}`;
    }
    if (kind === 'bid') {
      return `${endpoint(item.from_country, item.cargo_from || item.trip_from)} → ${endpoint(item.to_country, item.cargo_to || item.trip_to)}`;
    }
    return `${endpoint(item.from_country, item.from_city)} → ${endpoint(item.to_country, item.to_city)}`;
  }, [endpoint, role]);

  const priceText = useCallback((amount, currency = 'USD') => {
    if (amount === null || amount === undefined || amount === '') return '';
    return formatPrice(amount, currency || 'USD', t);
  }, [t]);

  const offersData = useMemo(() => {
    if (role === 'client') {
      return myCargos
        .filter((cargo) => (cargo.active_bids_count || 0) > 0 && cargo.status === 'active')
        .sort((a, b) => {
          const ta = parseServerDate(a.latest_bid_at || a.created_at)?.getTime() || 0;
          const tb = parseServerDate(b.latest_bid_at || b.created_at)?.getTime() || 0;
          return tb - ta;
        });
    }

    return [
      ...myBids.filter((bid) => OPEN_BID_STATUSES.has(bid.status)),
      ...incomingBids
        .filter((bid) => bid.trip_id && OPEN_BID_STATUSES.has(bid.status))
        .map((bid) => ({ ...bid, _incoming: true })),
    ].sort((a, b) => {
      const ta = parseServerDate(a.updated_at || a.created_at)?.getTime() || 0;
      const tb = parseServerDate(b.updated_at || b.created_at)?.getTime() || 0;
      return tb - ta;
    });
  }, [role, myCargos, myBids, incomingBids]);

  const closedBidsData = useMemo(() => {
    const rows = role === 'client'
      ? incomingBids.filter((bid) => bid.cargo_id && CLOSED_BID_STATUSES.has(bid.status))
      : [
          ...myBids.filter((bid) => CLOSED_BID_STATUSES.has(bid.status)),
          ...incomingBids
            .filter((bid) => bid.trip_id && CLOSED_BID_STATUSES.has(bid.status))
            .map((bid) => ({ ...bid, _incoming: true })),
        ];
    return rows.sort((a, b) => {
      const ta = parseServerDate(a.updated_at || a.created_at)?.getTime() || 0;
      const tb = parseServerDate(b.updated_at || b.created_at)?.getTime() || 0;
      return tb - ta;
    });
  }, [role, myBids, incomingBids]);

  const activeDeals = useMemo(() => (
    allDeals
      .filter((deal) => ACTIVE_STATUSES.has(deal.status))
      .sort((a, b) => {
        const ta = parseServerDate(a.last_message_at || a.updated_at || a.created_at)?.getTime() || 0;
        const tb = parseServerDate(b.last_message_at || b.updated_at || b.created_at)?.getTime() || 0;
        return tb - ta;
      })
  ), [allDeals]);

  const archivedDeals = useMemo(() => (
    allDeals
      .filter((deal) => ARCHIVE_DEAL_STATUSES.has(deal.status))
      .sort((a, b) => {
        const ta = parseServerDate(a.updated_at || a.created_at)?.getTime() || 0;
        const tb = parseServerDate(b.updated_at || b.created_at)?.getTime() || 0;
        return tb - ta;
      })
  ), [allDeals]);

  const offerCount = useMemo(() => (
    role === 'client'
      ? offersData.reduce((sum, cargo) => sum + (cargo.active_bids_count || 0), 0)
      : offersData.length
  ), [role, offersData]);

  const offerAttentionCount = useMemo(() => (
    offersData.reduce((sum, item) => sum + (
      role === 'client'
        ? ((item.active_bids_count || 0) > 0 ? 1 : 0)
        : (isBidActionable(item, { asOwner: !!item._incoming }) ? 1 : 0)
    ), 0)
  ), [role, offersData]);

  const activeAttentionCount = useMemo(() => (
    activeDeals.reduce(
      (sum, item) => sum + (item.unread_count || 0) + (item.tracking_action_required ? 1 : 0),
      0,
    )
  ), [activeDeals]);

  const baseItems = useMemo(() => {
    if (dealTab === 'offers') {
      return offersData.map((item) => ({
        kind: role === 'client' ? 'offer' : 'bid',
        data: item,
        sortAt: item.latest_bid_at || item.updated_at || item.created_at || '',
      }));
    }
    if (dealTab === 'active') {
      return activeDeals.map((item) => ({
        kind: 'deal',
        data: item,
        sortAt: item.last_message_at || item.updated_at || item.created_at || '',
      }));
    }
    return [
      ...archivedDeals.map((item) => ({
        kind: 'deal',
        data: item,
        sortAt: item.updated_at || item.created_at || '',
      })),
      ...closedBidsData.map((item) => ({
        kind: 'bid',
        data: item,
        sortAt: item.updated_at || item.created_at || '',
      })),
    ].sort((a, b) => {
      const ta = parseServerDate(a.sortAt)?.getTime() || 0;
      const tb = parseServerDate(b.sortAt)?.getTime() || 0;
      return tb - ta;
    });
  }, [dealTab, role, offersData, activeDeals, archivedDeals, closedBidsData]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return baseItems;
    return baseItems.filter(({ data: item }) => {
      const haystack = [
        item.from_city,
        item.to_city,
        item.cargo_desc,
        item.driver_name,
        item.shipper_name,
        item.cargo_from,
        item.cargo_to,
        item.trip_from,
        item.trip_to,
        item.last_message,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [baseItems, query]);

  const openBid = useCallback((bid) => {
    if (bid.cargo_id) {
      navigation.navigate('CargoDetail', { cargoId: bid.cargo_id, bidId: bid.id, role });
      return;
    }
    if (bid.trip_id) {
      navigation.navigate('TripDetail', { tripId: bid.trip_id, bidId: bid.id, role });
    }
  }, [navigation, role]);

  const openDeal = useCallback((deal) => {
    const partnerName = role === 'client'
      ? (deal.driver_name || t('role_driver'))
      : (deal.shipper_name || t('role_client'));
    navigation.navigate('Chat', {
      dealId: deal.id,
      roomId: deal.chat_room_id || null,
      partner: {
        id: role === 'client' ? deal.driver_id : deal.shipper_id,
        name: partnerName,
      },
      role,
    });
  }, [navigation, role, t]);

  const renderItem = useCallback(({ item }) => {
    const { kind, data } = item;

    if (kind === 'offer') {
      const count = data.active_bids_count || 0;
      const fromPrice = data.min_bid_price
        ? `${t('deals_offers_from')} ${priceText(data.min_bid_price, data.currency || 'USD')}`
        : '';
      const meta = data.cargo_desc ? localizeCargoName(data.cargo_desc, lang) : '';
      return (
        <CompactDealCard
          testID="deals-cargo-offer"
          routeLabel={routeFor(data, 'offer')}
          price={fromPrice}
          statusLabel={`${count} ${t('deals_offers_count')}`}
          statusColor={WAITING}
          time={relTime(data.latest_bid_at || data.created_at)}
          meta={meta}
          unread={count > 0 ? 1 : 0}
          onPress={() => navigation.navigate('CargoDetail', { cargoId: data.id, role })}
        />
      );
    }

    if (kind === 'bid') {
      const isCountered = data.status === 'countered';
      const isClosed = CLOSED_BID_STATUSES.has(data.status);
      const statusLabel = isClosed
        ? t('status_cancelled')
        : isCountered
          ? t('deals_offer_bargain')
          : (data._incoming ? t('deals_offer_new') : t('deals_offer_waiting'));
      const statusColor = isClosed ? ARCHIVE : isCountered ? INFO : WAITING;
      const amount = priceText(data.amount, data.currency || 'USD');
      const price = isCountered && data.counter_amount
        ? `${amount} → ${priceText(data.counter_amount, data.currency || 'USD')}`
        : amount;
      return (
        <CompactDealCard
          testID="deals-driver-bid"
          routeLabel={routeFor(data, 'bid')}
          price={price}
          statusLabel={statusLabel}
          statusColor={statusColor}
          time={relTime(data.updated_at || data.created_at)}
          dimmed={isClosed}
          unread={!isClosed && isBidActionable(data, { asOwner: !!data._incoming }) ? 1 : 0}
          onPress={() => openBid(data)}
        />
      );
    }

    const status = dealStatus(data.status, t);
    const partnerName = role === 'client'
      ? (data.driver_name || t('role_driver'))
      : (data.shipper_name || t('role_client'));
    const actionRequired = !!data.tracking_action_required;
    const statusLabel = actionRequired ? t('tracking_action_required') : status.label;
    const statusColor = actionRequired ? INFO : status.color;
    const meta = [partnerName, data.last_message].filter(Boolean).join(' · ');
    const unread = (data.unread_count || 0) + (actionRequired ? 1 : 0);

    return (
      <CompactDealCard
        testID="deals-deal-card"
        routeLabel={routeFor(data, 'deal')}
        price={priceText(data.amount, data.currency || 'USD')}
        statusLabel={statusLabel}
        statusColor={statusColor}
        time={relTime(data.last_message_at || data.updated_at || data.created_at)}
        meta={meta}
        unread={unread}
        dimmed={ARCHIVE_DEAL_STATUSES.has(data.status)}
        onPress={() => openDeal(data)}
      />
    );
  }, [
    lang,
    navigation,
    openBid,
    openDeal,
    priceText,
    relTime,
    role,
    routeFor,
    t,
  ]);

  const emptyText = dealTab === 'active'
    ? copy.activeEmpty
    : dealTab === 'archive'
      ? copy.archiveEmpty
      : copy.offersEmpty;

  const searchHeader = (
    <View style={s.scrollHeader} testID="deals-scroll-header">
      <View style={s.search}>
        <Feather name="search" size={17} color={TEXT_MUTED} />
        <TextInput
          testID="deal-room-search"
          style={s.searchInput}
          placeholder={copy.search}
          placeholderTextColor={TEXT_MUTED}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="clear-search"
            style={s.clearSearch}
          >
            <Feather name="x" size={16} color={TEXT_MUTED} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[s.container, { backgroundColor: PAGE_BG }]}
      edges={['top']}
      testID="deal-room-list"
    >
      <View style={s.fixedHeader} testID="deals-minimal-header">
        <View style={s.menuRow}>
          <HeaderMenuButton
            navigation={navigation}
            role={role}
            testID="deals-menu-btn"
          />
        </View>

        <View style={s.tabsRow} testID="deals-primary-tabs">
          <TabChip
            testID="deals-tab-offers"
            label={t('deals_tab_offers')}
            count={offerCount}
            active={dealTab === 'offers'}
            onPress={() => setDealTab('offers')}
          />
          <TabChip
            testID="deals-tab-active"
            label={t('deals_tab_active')}
            count={activeDeals.length}
            active={dealTab === 'active'}
            onPress={() => setDealTab('active')}
          />
          <TabChip
            testID="deals-tab-archive"
            label={copy.archive}
            count={archivedDeals.length + closedBidsData.length}
            active={dealTab === 'archive'}
            onPress={() => setDealTab('archive')}
            compact
            icon="archive"
          />
        </View>

        {(offerAttentionCount > 0 || activeAttentionCount > 0) ? (
          <View style={s.attentionA11y} testID="deals-attention-summary">
            <Text style={s.attentionA11yText}>
              {offerAttentionCount + activeAttentionCount}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={roleAccent} style={{ marginTop: 42 }} />
      ) : loadError && baseItems.length === 0 ? (
        <View style={s.errorState}>
          <Feather name="wifi-off" size={23} color={TEXT_MUTED} />
          <Text style={s.errorText}>{copy.loadError}</Text>
          <TouchableOpacity testID="deals-retry" style={s.retryBtn} onPress={load}>
            <Text style={s.retryText}>{copy.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          testID="deals-list"
          data={visibleItems}
          keyExtractor={(item) => `${item.kind}-${item.data.id}`}
          renderItem={renderItem}
          ListHeaderComponent={searchHeader}
          contentContainerStyle={s.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={roleAccent}
            />
          )}
          ListEmptyComponent={(
            <Text style={s.emptyText}>
              {query ? t('chat_no_results') : emptyText}
            </Text>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  fixedHeader: {
    backgroundColor: PAGE_BG,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0EE',
    shadowColor: '#14211C',
    shadowOpacity: 0.025,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    zIndex: 5,
  },
  menuRow: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  tabsRow: {
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabChip: {
    minWidth: 0,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: '#14211C',
    shadowOpacity: 0.025,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    flexShrink: 1,
  },
  archiveChip: {
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 11,
    flexShrink: 1.3,
  },
  tabChipActive: {
    borderColor: '#A6D2BE',
    backgroundColor: ACCENT_SOFT,
  },
  tabChipText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  tabChipTextActive: { color: ACCENT },
  tabCount: {
    color: '#7B8580',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tabCountActive: { color: '#6B8C7C' },
  attentionA11y: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  attentionA11yText: { fontSize: 1 },
  scrollHeader: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: PAGE_BG,
  },
  search: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#14211C',
    shadowOpacity: 0.02,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
    paddingVertical: 0,
  },
  clearSearch: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingTop: 0,
    paddingBottom: 28,
  },
  card: {
    minHeight: 92,
    marginHorizontal: 18,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    shadowColor: '#15211C',
    shadowOpacity: 0.03,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardDimmed: { opacity: 0.72 },
  cardTop: {
    minHeight: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  route: {
    flex: 1,
    minWidth: 0,
    color: TEXT,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.18,
  },
  price: {
    maxWidth: '37%',
    flexShrink: 0,
    color: TEXT,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  cardMiddle: {
    marginTop: 7,
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusPill: {
    maxWidth: '72%',
    minHeight: 24,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  cardRightMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  time: {
    color: TEXT_MUTED,
    fontSize: 11,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  unreadBadge: {
    minWidth: 21,
    height: 21,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: '#D64545',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  meta: {
    marginTop: 6,
    color: TEXT_MUTED,
    fontSize: 12,
    lineHeight: 16,
  },
  emptyText: {
    marginTop: 58,
    paddingHorizontal: 24,
    color: TEXT_MUTED,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  errorText: {
    color: TEXT_MUTED,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    minHeight: 44,
    marginTop: 4,
    paddingHorizontal: 22,
    borderRadius: 22,
    backgroundColor: ACCENT_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '800',
  },
});
