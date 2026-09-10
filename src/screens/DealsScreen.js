import React, { useCallback, useMemo, useState } from "react";
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
import { useTheme } from '../utils/ThemeContext';
import { formatStatus } from '../utils/i18n';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import RootHeader from '../components/ui/v1/RootHeader';
import { marketAPI } from '../utils/marketAPI';
import { notificationsAPI } from '../utils/notificationsAPI';
import { formatPrice } from '../utils/normalizers';
import { localizeCargoName, localizePlace } from '../utils/places';
import { countryCode } from '../utils/countryFlags';
import { accentFor } from '../components/deal/DealRoom';
import { useSafeRefresh } from '../hooks/useSafeRefresh';
import { isBidActionable } from '../utils/dealsUnread';
import { formatBidRemaining, isBidFresh } from '../utils/bidExpiry';
import BellBadge from '../components/ui/v1/BellBadge';
import MarketplaceCard from '../components/ui/v1/MarketplaceCard';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS } from '../utils/AuthContext';

const ACCENT = "#34936B";
const ACCENT_SOFT = '#EAF5EF';
const PAGE_BG = '#F7F9F7';
const SURFACE = '#FFFFFF';
const BORDER = '#E0E6E2';
const BORDER_STRONG = '#BFDCCF';
const TEXT = '#18231E';
const TEXT_SECONDARY = '#526057';
const TEXT_MUTED = '#758078';
const TEXT_DIM = '#98A19B';
const WAITING = "#617067";
// Design v1 Commit 4: at_border rides the approved at-border role colour
// (LIGHT statusAtBorder — same hue family the timeline uses).
const AT_BORDER = "#B45800";
const INFO = "#3478D4";
const ARCHIVE = "#7C8B82";
const CANCELLED = "#A45A5A";

const dealsPalette = (theme, isDark) => ({
  pageBg: theme.bg,
  surface: theme.card || theme.surface,
  surfaceAlt: theme.surfaceAlt || theme.cardActive || theme.surface,
  text: theme.text,
  textSecondary: theme.textSecondary,
  textMuted: theme.textMuted,
  border: theme.border,
  headerBorder: isDark ? theme.border : '#EDF0EE',
  shadow: isDark ? '#000000' : '#14211C',
  accent: ACCENT,
  accentSoft: isDark ? 'rgba(22,135,89,0.18)' : ACCENT_SOFT,
  inactiveIcon: theme.textMuted,
  chevron: isDark ? '#65746B' : '#A0A9A4',
  dimOpacity: isDark ? 0.62 : 0.72,
});

// `delivered` is intentionally ACTIVE, not terminal. The driver has finished
// delivery, but the shipper still must confirm receipt (`delivered -> completed`).
// Only true terminal deal states belong in Archive.
const ACTIVE_STATUSES = new Set(['accepted', 'in_progress', 'at_border', 'awaiting_confirmation', 'delivered', 'received']);
const ARCHIVE_DEAL_STATUSES = new Set(['completed', 'cancelled', 'rejected', 'expired']);
const OPEN_BID_STATUSES = new Set(["pending", "countered"]);
const CLOSED_BID_STATUSES = new Set(["rejected", "cancelled", "expired"]);

const COPY = {
  RU: {
    archive: 'Архив',
    tabOffersLabel: 'Предложения',
    tabActiveLabel: 'В работе',
    tabArchiveLabel: 'Архив',
    search: 'Поиск: водитель, маршрут, груз',
    loadError: 'Не удалось загрузить сделки',
    retry: 'Повторить',
    offersEmpty: 'Новых предложений пока нет',
    activeEmpty: 'Активных сделок пока нет',
    archiveEmpty: 'Архив пока пуст',
  },
  EN: {
    archive: 'Archive',
    tabOffersLabel: 'Offers',
    tabActiveLabel: 'In work',
    tabArchiveLabel: 'Archive',
    search: 'Search: driver, route, cargo',
    loadError: 'Could not load deals',
    retry: 'Retry',
    offersEmpty: 'No new offers yet',
    activeEmpty: 'No active deals yet',
    archiveEmpty: 'Archive is empty',
  },
  ZH: {
    archive: '归档',
    tabOffersLabel: '报价',
    tabActiveLabel: '进行中',
    tabArchiveLabel: '归档',
    search: '搜索：司机、路线、货物',
    loadError: '无法加载交易',
    retry: '重试',
    offersEmpty: '暂无新报价',
    activeEmpty: '暂无进行中的交易',
    archiveEmpty: '归档为空',
  },
  KK: {
    archive: 'Мұрағат',
    tabOffersLabel: 'Ұсыныстар',
    tabActiveLabel: 'Жұмыста',
    tabArchiveLabel: 'Мұрағат',
    search: 'Іздеу: жүргізуші, бағыт, жүк',
    loadError: 'Мәмілелерді жүктеу мүмкін болмады',
    retry: 'Қайталау',
    offersEmpty: 'Жаңа ұсыныстар әзірге жоқ',
    activeEmpty: 'Белсенді мәмілелер әзірге жоқ',
    archiveEmpty: 'Мұрағат бос',
  },
};

const normalizeNotifPath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let path = raw;
  try {
    const parsed = new URL(raw);
    path = `${parsed.pathname || ""}${parsed.search || ""}`;
  } catch {
    // relative notification path
  }
  const clean = path.split("#", 1)[0].split("?", 1)[0];
  if (!clean) return "";
  return clean.startsWith("/") ? (clean.replace(/\/+$/, "") || "/") : `/${clean.replace(/\/+$/, "")}`;
};

export const unreadNotificationPaths = (data) =>
  (Array.isArray(data?.notifications) ? data.notifications : [])
    .filter((item) => !item?.is_read)
    .map((item) => normalizeNotifPath(item?.url))
    .filter(Boolean);

const parseServerDate = (raw) => {
  if (!raw) return null;
  const normalized = String(raw).replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dealStatus = (status, t) => {
  if (status === "accepted")
    return { label: t("status_accepted"), color: ACCENT };
  if (status === "in_progress") {
    return { label: t("status_in_progress"), color: ACCENT };
  }
  // Design v1 Commit 4: the list used to collapse at_border into the
  // in_progress label («В работе»). at_border has its own dedicated key
  // (deal_status_at_border, present in RU/KK/ZH/EN) and the at-border
  // role colour.
  if (status === "at_border") {
    return { label: t("deal_status_at_border"), color: AT_BORDER };
  }
  if (status === "awaiting_confirmation" || status === "delivered") {
    return { label: t("status_awaiting_receipt"), color: INFO };
  }
  if (status === 'received') {
    return { label: t('status_received'), color: ACCENT };
  }
  if (status === 'completed') {
    return { label: t('status_completed'), color: ARCHIVE };
  }
  if (status === "cancelled" || status === "rejected") {
    return { label: t("status_cancelled"), color: CANCELLED };
  }
  if (status === "expired")
    return { label: formatStatus(status), color: ARCHIVE };
  return { label: formatStatus(status), color: ARCHIVE };
};

function TabChip({ label, count, attentionCount = 0, active, onPress, testID, icon = null, colors, sp = (n) => n }) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      activeOpacity={0.72}
      onPress={onPress}
      style={[
        styles.tabChip,
        {
          borderColor: active ? '#A6D2BE' : colors.border,
          backgroundColor: active ? colors.accentSoft : colors.surface,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <View style={styles.tabChipLabelRow}>
        {icon ? <Feather name={icon} size={13} color={active ? colors.accent : colors.inactiveIcon} /> : null}
        <Text
          style={[styles.tabChipText, { color: active ? colors.accent : colors.textSecondary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.62}
        >
          {label}
        </Text>
      </View>
      <View style={[styles.tabCountBadge, { backgroundColor: active ? colors.surface : colors.surfaceAlt, borderColor: active ? '#B9DACB' : colors.border }]}>
        <Text
          style={[styles.tabCount, { color: active ? colors.accent : colors.textMuted, fontSize: sp(10.5) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {count > 99 ? '99+' : count}
        </Text>
      </View>
      {attentionCount > 0 ? (
        <View style={styles.tabAttentionBadge} testID={`${testID}-attention`}>
          <Text style={[styles.tabAttentionText, { fontSize: sp(9) }]}>
            {attentionCount > 99 ? '99+' : attentionCount}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// CompactDealCard — deals-inbox card, now a thin adapter over the canonical
// MarketplaceCard (Design v1 Commit 3): radius 17→16, StatusPill instead of
// the local status-pill fork, no shadow. Unread badge, chevron, time and
// counterparty meta are preserved; the inbox keeps its own status colors
// (dealStatus + attention overrides) via the StatusPill `color` prop.
function CompactDealCard({
  routeLabel,
  price,
  priceMeta,
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
    <MarketplaceCard
      testID={testID}
      onPress={onPress}
      style={styles.card}
      route={routeLabel}
      price={price}
      priceMeta={priceMeta}
      status={{ key: 'deal', label: statusLabel, color: statusColor }}
      counterparty={meta}
      rightMeta={time}
      unread={unread}
      chevron
      dimmed={dimmed}
    />
  );
}

export default function DealsScreen({ navigation, route }) {
  const { t, lang, sp } = useI18n();
  const { theme, isDark } = useTheme();
  const palette = useMemo(() => dealsPalette(theme, isDark), [theme, isDark]);
  const role = route?.params?.role || 'client';
  const roleAccent = accentFor(role) || ACCENT;
  const copy = COPY[lang] || COPY.EN;
  const { requireLevel, Gate } = useVerificationGate();

  const [dealTab, setDealTab] = useState("offers");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [allDeals, setAllDeals] = useState([]);
  const [incomingBids, setIncomingBids] = useState([]);
  const [myBids, setMyBids] = useState([]);
  const [unreadNotifPaths, setUnreadNotifPaths] = useState([]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const dashboard = await marketAPI.myDashboard();
      if (!dashboard) throw new Error('empty_dashboard');
      setAllDeals(dashboard.my_deals || []);
      setIncomingBids(dashboard.incoming_bids || []);
      setMyBids(dashboard.my_bids || []);
      try {
        const notificationData = await notificationsAPI.list(50);
        setUnreadNotifPaths(unreadNotificationPaths(notificationData));
      } catch {
        // Notification badges are auxiliary; a notification API outage must
        // not turn an otherwise valid Deals dashboard into an error screen.
        setUnreadNotifPaths([]);
      }
    } catch (error) {
      setLoadError(true);
      console.warn("deals load failed", error?.message || error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 10000);
      return () => clearInterval(interval);
    }, [load]),
  );

  const { refreshing, onRefresh } = useSafeRefresh(load);

  const relTime = useCallback(
    (raw) => {
      const date = parseServerDate(raw);
      if (!date) return "";
      const minutes = Math.max(
        0,
        Math.round((Date.now() - date.getTime()) / 60000),
      );
      if (minutes < 1) return t("time_now");
      if (minutes < 60) return `${minutes} ${t("time_min")}`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `${hours} ${t("time_hour")}`;
      if (Math.round(hours / 24) === 1) return t("time_yesterday");
      const locale =
        lang === "ZH"
          ? "zh-CN"
          : lang === "EN"
            ? "en-GB"
            : lang === "KK"
              ? "kk-KZ"
              : "ru-RU";
      return date.toLocaleDateString(locale, {
        day: "2-digit",
        month: "2-digit",
      });
    },
    [t, lang],
  );

  const routeFor = useCallback((item, kind) => {
    if (kind === 'bid') {
      return {
        from: localizePlace(item.cargo_from || item.trip_from || '—', lang),
        to: localizePlace(item.trip_to || item.cargo_to || '—', lang),
        fromFlag: countryCode(item.from_country) || null,
        toFlag: countryCode(item.to_country) || null,
      };
    }
    return {
      from: localizePlace(item.from_city || '—', lang),
      to: localizePlace(item.to_city || '—', lang),
      fromFlag: countryCode(item.from_country) || null,
      toFlag: countryCode(item.to_country) || null,
    };
  }, [lang]);

  const priceText = useCallback(
    (amount, currency = "USD") => {
      if (amount === null || amount === undefined || amount === "") return "";
      return formatPrice(amount, currency || "USD", t);
    },
    [t],
  );

  const offersData = useMemo(() => {
    if (role === 'client') {
      return incomingBids
        .filter((bid) => bid.cargo_id && OPEN_BID_STATUSES.has(bid.status) && isBidFresh(bid))
        .map((bid) => ({ ...bid, _incoming: true }))
        .sort((a, b) => {
          const ta = parseServerDate(a.updated_at || a.created_at)?.getTime() || 0;
          const tb = parseServerDate(b.updated_at || b.created_at)?.getTime() || 0;
          return tb - ta;
        });
    }

    return [
      ...myBids.filter(
        (bid) => OPEN_BID_STATUSES.has(bid.status) && isBidFresh(bid),
      ),
      ...incomingBids
        .filter(
          (bid) =>
            bid.trip_id && OPEN_BID_STATUSES.has(bid.status) && isBidFresh(bid),
        )
        .map((bid) => ({ ...bid, _incoming: true })),
    ].sort((a, b) => {
      const ta = parseServerDate(a.updated_at || a.created_at)?.getTime() || 0;
      const tb = parseServerDate(b.updated_at || b.created_at)?.getTime() || 0;
      return tb - ta;
    });
  }, [role, myBids, incomingBids]);

  const closedBidsData = useMemo(() => {
    const rows =
      role === "client"
        ? incomingBids.filter(
            (bid) => bid.cargo_id && CLOSED_BID_STATUSES.has(bid.status),
          )
        : [
            ...myBids.filter((bid) => CLOSED_BID_STATUSES.has(bid.status)),
            ...incomingBids
              .filter(
                (bid) => bid.trip_id && CLOSED_BID_STATUSES.has(bid.status),
              )
              .map((bid) => ({ ...bid, _incoming: true })),
          ];
    return rows.sort((a, b) => {
      const ta = parseServerDate(a.updated_at || a.created_at)?.getTime() || 0;
      const tb = parseServerDate(b.updated_at || b.created_at)?.getTime() || 0;
      return tb - ta;
    });
  }, [role, myBids, incomingBids]);

  const activeDeals = useMemo(
    () =>
      allDeals
        .filter((deal) => ACTIVE_STATUSES.has(deal.status))
        .sort((a, b) => {
          const ta =
            parseServerDate(
              a.last_message_at || a.updated_at || a.created_at,
            )?.getTime() || 0;
          const tb =
            parseServerDate(
              b.last_message_at || b.updated_at || b.created_at,
            )?.getTime() || 0;
          return tb - ta;
        }),
    [allDeals],
  );

  const archivedDeals = useMemo(
    () =>
      allDeals
        .filter((deal) => ARCHIVE_DEAL_STATUSES.has(deal.status))
        .sort((a, b) => {
          const ta =
            parseServerDate(a.updated_at || a.created_at)?.getTime() || 0;
          const tb =
            parseServerDate(b.updated_at || b.created_at)?.getTime() || 0;
          return tb - ta;
        }),
    [allDeals],
  );

  const offerCount = offersData.length;

  const offerAttentionCount = useMemo(() => (
    offersData.reduce((sum, item) => sum + (
      isBidActionable(item, { asOwner: !!item._incoming }) ? 1 : 0
    ), 0)
  ), [offersData]);

  const activeAttentionCount = useMemo(
    () =>
      activeDeals.reduce(
        (sum, item) =>
          sum +
          (item.unread_count || 0) +
          (unreadNotifPaths.includes(`/deals/${item.id}`) ||
          (item.cargo_id && unreadNotifPaths.includes(`/cargos/${item.cargo_id}`)) ||
          (item.trip_id && unreadNotifPaths.includes(`/trips/${item.trip_id}`))
            ? 1
            : 0) +
          (item.tracking_action_required ||
          (role === "client" &&
            (item.status === "delivered" ||
              item.status === "awaiting_confirmation"))
            ? 1
            : 0),
        0,
      ),
    [activeDeals, role, unreadNotifPaths],
  );

  const baseItems = useMemo(() => {
    if (dealTab === "offers") {
      return offersData.map((item) => ({
        kind: 'bid',
        data: item,
        sortAt: item.updated_at || item.created_at || '',
      }));
    }
    if (dealTab === "active") {
      return activeDeals.map((item) => ({
        kind: "deal",
        data: item,
        sortAt:
          item.last_message_at || item.updated_at || item.created_at || "",
      }));
    }
    return [
      ...archivedDeals.map((item) => ({
        kind: "deal",
        data: item,
        sortAt: item.updated_at || item.created_at || "",
      })),
      ...closedBidsData.map((item) => ({
        kind: "bid",
        data: item,
        sortAt: item.updated_at || item.created_at || "",
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
        item.bidder_name,
        item.message,
        item.driver_name,
        item.shipper_name,
        item.cargo_from,
        item.cargo_to,
        item.trip_from,
        item.trip_to,
        item.last_message,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [baseItems, query]);

  const openBid = useCallback(
    (bid) => {
      if (bid.cargo_id) {
        navigation.navigate('CargoDetail', { cargoId: bid.cargo_id, bidId: bid.id, role });
        return;
      }
      if (bid.trip_id) {
        navigation.navigate("TripDetail", {
          tripId: bid.trip_id,
          bidId: bid.id,
          role,
        });
      }
    },
    [navigation, role],
  );

  const openDeal = useCallback(
    (deal) => {
      const partnerName =
        role === "client"
          ? deal.driver_name || t("role_driver")
          : deal.shipper_name || t("role_client");
      navigation.navigate("Chat", {
        dealId: deal.id,
        roomId: deal.chat_room_id || null,
        partner: {
          id: role === "client" ? deal.driver_id : deal.shipper_id,
          name: partnerName,
        },
        role,
      });
    },
    [navigation, role, t],
  );

  const renderItem = useCallback(
    ({ item }) => {
      const { kind, data } = item;

      if (kind === 'bid') {
      const isCountered = data.status === 'countered';
      const isClosed = CLOSED_BID_STATUSES.has(data.status);
      const statusLabel = data.status === 'expired'
        ? t('status_expired')
        : data.status === 'rejected'
          ? t('status_rejected')
          : data.status === 'cancelled'
            ? t('status_cancelled')
            : isCountered
              ? t('deals_offer_bargain')
              : (data._incoming ? t('deals_offer_new') : t('deals_offer_waiting'));
      const statusColor = isClosed ? ARCHIVE : isCountered ? INFO : WAITING;
      const amount = priceText(data.amount, data.currency || 'USD');
      const price = isCountered && data.counter_amount
        ? `${amount} → ${priceText(data.counter_amount, data.currency || 'USD')}`
        : amount;
      const cardTime = isClosed
        ? relTime(data.updated_at || data.created_at)
        : formatBidRemaining(data, lang);
      const isIncomingCargoOffer = role === 'client' && data._incoming && data.cargo_id;
      const offerRoute = routeFor(data, 'bid');
      const offerCargo = data.cargo_desc ? localizeCargoName(data.cargo_desc, lang) : '';
      const offerMeta = [data.bidder_name || t('role_driver'), offerCargo].filter(Boolean).join(' · ');
      return (
        <CompactDealCard
          testID="deals-driver-bid"
          routeLabel={offerRoute}
          price={price}
          statusLabel={statusLabel}
          statusColor={statusColor}
          time={isIncomingCargoOffer ? relTime(data.updated_at || data.created_at) : cardTime}
          meta={isIncomingCargoOffer ? offerMeta : undefined}
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
      const needsReceiptConfirmation = role === 'client' && (data.status === 'delivered' || data.status === 'awaiting_confirmation');
      const trackingActionRequired = !!data.tracking_action_required;
      const statusLabel = needsReceiptConfirmation
        ? t('confirm_delivery')
        : trackingActionRequired
          ? t('tracking_action_required')
          : status.label;
      const statusColor = (needsReceiptConfirmation || trackingActionRequired) ? INFO : status.color;
      const meta = [partnerName, data.last_message].filter(Boolean).join(' · ');
      const attentionRequired = needsReceiptConfirmation || trackingActionRequired ||
        unreadNotifPaths.includes(`/deals/${data.id}`) ||
        (data.cargo_id && unreadNotifPaths.includes(`/cargos/${data.cargo_id}`)) ||
        (data.trip_id && unreadNotifPaths.includes(`/trips/${data.trip_id}`));
      const unread = (data.unread_count || 0) + (attentionRequired ? 1 : 0);

      return (
        <CompactDealCard
          testID="deals-deal-card"
          routeLabel={routeFor(data, 'deal')}
          price={priceText(data.amount, data.currency || 'USD')}
          priceMeta={data.id ? `${t('deal_no')} ${data.id}` : null}
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
    openBid,
    openDeal,
    priceText,
    relTime,
    role,
    routeFor,
    t,
    palette,
    unreadNotifPaths,
  ]);

  const emptyText = dealTab === 'active'
    ? copy.activeEmpty
    : dealTab === 'archive'
      ? copy.archiveEmpty
      : copy.offersEmpty;

  const listHeader = (
    <View
      style={[
        styles.scrollingHeader,
        {
          backgroundColor: palette.pageBg,
          borderBottomColor: palette.headerBorder,
          shadowColor: palette.shadow,
        },
      ]}
      testID="deals-minimal-header"
    >
      <RootHeader navigation={navigation} role={role} testID="deals-minimal-header" bellTestID="deals-notification-settings-btn" menuTestID="deals-menu-btn" onBellPress={async () => {
            const ok = await requireLevel(LEVELS.PHONE, 'push_settings', role);
            if (ok) navigation.navigate('PushFilter', { role });
          }} />

      <View style={styles.tabsRow} testID="deals-primary-tabs">
        <TabChip
          testID="deals-tab-offers"
          label={copy.tabOffersLabel}
          count={offerCount}
          attentionCount={offerAttentionCount}
          active={dealTab === 'offers'}
          onPress={() => setDealTab('offers')}
          colors={palette}
          sp={sp}
        />
        <TabChip
          testID="deals-tab-active"
          label={copy.tabActiveLabel}
          count={activeDeals.length}
          attentionCount={activeAttentionCount}
          active={dealTab === 'active'}
          onPress={() => setDealTab('active')}
          colors={palette}
          sp={sp}
        />
        <TabChip
          testID="deals-tab-archive"
          label={copy.tabArchiveLabel}
          count={archivedDeals.length + closedBidsData.length}
          active={dealTab === 'archive'}
          onPress={() => setDealTab('archive')}
          icon="archive"
          colors={palette}
          sp={sp}
        />
      </View>

      {(offerAttentionCount > 0 || activeAttentionCount > 0) ? (
        <View style={styles.attentionA11y} testID="deals-attention-summary">
          <Text style={styles.attentionA11yText}>
            {offerAttentionCount + activeAttentionCount}
          </Text>
        </View>
      ) : null}

      <View style={[styles.scrollHeader, { backgroundColor: palette.pageBg }]} testID="deals-scroll-header">
        <View style={[styles.search, { borderColor: palette.border, backgroundColor: palette.surface, shadowColor: palette.shadow }]}>
          <Feather name="search" size={17} color={palette.textMuted} />
          <TextInput
            testID="deal-room-search"
            style={[styles.searchInput, { color: palette.text }]}
            placeholder={copy.search}
            placeholderTextColor={palette.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="clear-search"
              style={styles.clearSearch}
            >
              <Feather name="x" size={16} color={palette.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.pageBg }]}
      edges={['top']}
      testID="deal-room-list"
    >
      {loading ? (
        <>
          {listHeader}
          <ActivityIndicator color={roleAccent} style={{ marginTop: 42 }} />
        </>
      ) : loadError && baseItems.length === 0 ? (
        <>
          {listHeader}
          <View style={styles.errorState}>
            <Feather name="wifi-off" size={23} color={palette.textMuted} />
            <Text style={[styles.errorText, { color: palette.textMuted }]}>{copy.loadError}</Text>
            <TouchableOpacity testID="deals-retry" style={[styles.retryBtn, { backgroundColor: palette.accentSoft }]} onPress={load}>
              <Text style={[styles.retryText, { color: palette.accent }]}>{copy.retry}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <FlatList
          testID="deals-list"
          data={visibleItems}
          keyExtractor={(item) => `${item.kind}-${item.data.id}`}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={roleAccent}
            />
          }
          ListEmptyComponent={(
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              {query ? t('chat_no_results') : emptyText}
            </Text>
          )}
        />
      )}
      {Gate}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  scrollingHeader: {
    backgroundColor: PAGE_BG,
    paddingBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDF0EE',
    shadowColor: '#14211C',
    shadowOpacity: 0.025,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  menuRow: {
    minHeight: 38,
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  tabsRow: {
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabChip: {
    flex: 1,
    minWidth: 0,
    height: 50,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    shadowColor: '#14211C',
    shadowOpacity: 0.025,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    overflow: 'hidden',
  },
  tabChipActive: {
    borderColor: BORDER_STRONG,
    backgroundColor: ACCENT_SOFT,
  },
  tabChipLabelRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabChipText: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '800',
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  tabChipTextActive: { color: ACCENT },
  tabCountBadge: {
    minWidth: 24,
    height: 16,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tabCount: {
    color: '#7B8580',
    fontSize: 10.5,
    lineHeight: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  tabAttentionBadge: {
    position: 'absolute',
    top: 4,
    right: 6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#D64545',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabAttentionText: {
    color: '#FFFFFF',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  attentionA11y: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  attentionA11yText: { fontSize: 1 },
  scrollHeader: {
    paddingHorizontal: 18,
    paddingTop: 7,
    paddingBottom: 10,
    backgroundColor: PAGE_BG,
  },
  search: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#14211C",
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
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingTop: 0,
    paddingBottom: 118,
  },
  // Design v1 Commit 3: the card chrome lives in MarketplaceCard (radius
  // 16, border-only, StatusPill); the inbox keeps list spacing only.
  card: { marginHorizontal: 18, marginBottom: 8 },
  emptyText: {
    marginTop: 58,
    paddingHorizontal: 24,
    color: TEXT_MUTED,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  errorText: {
    color: TEXT_MUTED,
    fontSize: 14,
    textAlign: "center",
  },
  retryBtn: {
    minHeight: 44,
    marginTop: 4,
    paddingHorizontal: 22,
    borderRadius: 22,
    backgroundColor: ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: "800",
  },
});
