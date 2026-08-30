// ChatsListScreen — «Сделки» (dealsMode) и «Чаты» (обычный режим).
//
// Архитектура «Сделки» (WhatsApp-style, 04.08.2026):
// Один плоский список — предложения и сделки вперемешку, по свежести,
// без вкладок. Источник данных — бизнес-сущности (cargos+bids / deals),
// НЕ chat rooms. Chat rooms используются только для last_message +
// unread_count внутри карточки сделки. Room не создаёт самостоятельную строку.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, SectionList, TouchableOpacity, StyleSheet, TextInput, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useI18n } from '../utils/useI18n';
import { formatStatus } from '../utils/i18n';
import { useTheme } from '../utils/ThemeContext';
import { useV1Colors } from '../theme/designV1';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import SegmentTabs from '../components/ui/v1/SegmentTabs';
import { chatAPI } from '../utils/chatAPI';
import { marketAPI } from '../utils/marketAPI';
import { storage } from '../utils/storage';
import { useToast } from '../components/Toast';
import { formatPrice } from '../utils/normalizers';
import { localizePlace, localizeCargoName } from '../utils/places';
import { countryFlag } from '../utils/countryFlags';
import { prettifyPartnerName } from '../utils/displayName';
import { accentFor } from '../components/deal/DealRoom';
import { isBidActionable } from '../utils/dealsUnread';
import { userFacingDealStatus } from '../utils/dealStatusOrder';
import { useSafeRefresh } from '../hooks/useSafeRefresh';

const ROLE_LABEL = { driver: 'role_driver', client: 'role_client', support: 'role_support' };
const ACTIVE_STATUSES = new Set(['accepted', 'in_progress', 'at_border', 'awaiting_confirmation']);
const COMPLETED_STATUSES = new Set(['completed', 'delivered', 'cancelled']);

const STATUS_COLOR = {
  accepted: '#168759', in_progress: '#3478D4',
  at_border: '#3478D4', awaiting_confirmation: '#3478D4',
  completed: '#94A3B8', delivered: '#94A3B8', cancelled: '#EF4444',
};
// Компактный статус карточки: in_progress/at_border/awaiting_confirmation
// схлопнуты в один «В пути» — WhatsApp-упрощение (04.08.2026), детальный
// статус смотрится внутри сделки, а не в списке. Ключи уже локализованы
// на 4 языках (status_*), новых строк не добавляем.
const compactStatusLabel = (status, t) => {
  if (status === 'accepted') return t('status_accepted');
  if (status === 'in_progress' || status === 'at_border' || status === 'awaiting_confirmation') return t('status_in_progress');
  if (status === 'completed' || status === 'delivered') return t('status_delivered');
  if (status === 'cancelled') return t('status_cancelled');
  return formatStatus(status);
};

export default function ChatsListScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const role = route?.params?.role || 'client';
  const accent = accentFor(role);
  const dealsMode = route?.name === 'Deals';

  // ═══ Общее состояние ═══
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // Решение владельца (05.08.2026, п.3): максимум 2 компактных фильтра —
  // Все / Непрочитанные. Шторка с кузовом/датой убрана целиком.
  const [dealTab, setDealTab] = useState('offers');

  // ═══ Deals-mode состояние ═══
  // Вкладок больше нет (WhatsApp-упрощение 04.08.2026) — предложения и
  // сделки идут одним списком, отсортированным по свежести.
  const [myCargos, setMyCargos] = useState([]);
  const [myTrips, setMyTrips] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const [incomingBids, setIncomingBids] = useState([]);
  const [myBids, setMyBids] = useState([]);

  // ═══ Чаты-mode состояние ═══
  const PINNED_KEY = 'ur_pinned_chats';
  const [pinnedIds, setPinnedIds] = useState([]);
  useEffect(() => {
    storage.get(PINNED_KEY).then((raw) => { try { if (raw) setPinnedIds(JSON.parse(raw)); } catch {} });
  }, []);
  const togglePin = (roomId) => {
    setPinnedIds((prev) => {
      const id = String(roomId);
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : (prev.length >= 5 ? prev : [...prev, id]);
      storage.set(PINNED_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const relTime = (raw) => {
    if (!raw) return '';
    const d = new Date(String(raw).replace(' ', 'T') + (String(raw).includes('Z') ? '' : 'Z'));
    if (isNaN(d)) return '';
    const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
    if (min < 1) return t('time_now');
    if (min < 60) return `${min} ${t('time_min')}`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} ${t('time_hour')}`;
    const dd = Math.round(h / 24);
    if (dd === 1) return t('time_yesterday');
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  // ═══ Загрузка ═══
  const load = useCallback(async () => {
    try {
      if (dealsMode) {
        const d = await marketAPI.myDashboard().catch(() => null);
        if (d) {
          setMyCargos(d.my_cargos || []);
          setMyTrips(d.my_trips || []);
          setAllDeals(d.my_deals || []);
          // Полные списки (не только pending/countered) — отклонённые/
          // отменённые/истёкшие ставки тоже показываются в едином списке
          // статусом «Отменено» (05.08.2026, решение владельца п.3), а не
          // пропадают из UI совсем.
          setIncomingBids(d.incoming_bids || []);
          setMyBids(d.my_bids || []);
        }
      } else {
        const data = await chatAPI.rooms();
        setRooms(data.rooms || []);
      }
    } catch (e) {
      console.warn('chats load failed', e);
    } finally {
      setLoading(false);
    }
  }, [dealsMode, role]);

  useFocusEffect(useCallback(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load]));
  const { refreshing, onRefresh } = useSafeRefresh(load);

  // ═══ DEALS MODE — данные для вкладок ═══

  const OPEN_BID_STATUSES = new Set(['pending', 'countered']);
  const CLOSED_BID_STATUSES = new Set(['rejected', 'cancelled', 'expired']);

  // Предложения (клиент): грузы с активными ставками
  // Предложения (водитель): мои ставки + входящие на мои рейсы
  const offersData = useMemo(() => {
    if (!dealsMode) return [];
    if (role === 'client') {
      return myCargos
        .filter((c) => (c.active_bids_count || 0) > 0 && c.status === 'active')
        .sort((a, b) => {
          const ta = new Date(a.latest_bid_at || a.created_at || '').getTime() || 0;
          const tb = new Date(b.latest_bid_at || b.created_at || '').getTime() || 0;
          return tb - ta;
        });
    }
    const bids = [
      ...myBids.filter((b) => OPEN_BID_STATUSES.has(b.status)),
      ...incomingBids.filter((b) => b.trip_id && OPEN_BID_STATUSES.has(b.status)).map((b) => ({ ...b, _incoming: true })),
    ];
    return bids.sort((a, b) => {
      const ta = new Date(a.created_at || '').getTime() || 0;
      const tb = new Date(b.created_at || '').getTime() || 0;
      return tb - ta;
    });
  }, [dealsMode, role, myCargos, myBids, incomingBids]);

  // Отклонённые/отменённые/истёкшие ставки — переговоры, которые не стали
  // сделкой. Раньше жили в архиве «Мои рейсы»/«Мои грузы» и пропадали из UI
  // при его чистке (05.08.2026); теперь единственное место — этот список,
  // статус «Отменено».
  const closedBidsData = useMemo(() => {
    if (!dealsMode) return [];
    const bids = role === 'client'
      ? incomingBids.filter((b) => b.cargo_id && CLOSED_BID_STATUSES.has(b.status))
      : [
          ...myBids.filter((b) => CLOSED_BID_STATUSES.has(b.status)),
          ...incomingBids.filter((b) => b.trip_id && CLOSED_BID_STATUSES.has(b.status)).map((b) => ({ ...b, _incoming: true })),
        ];
    return bids.sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || '').getTime() || 0;
      const tb = new Date(b.updated_at || b.created_at || '').getTime() || 0;
      return tb - ta;
    });
  }, [dealsMode, role, myBids, incomingBids]);

  const activeDeals = useMemo(() => {
    if (!dealsMode) return [];
    return allDeals
      .filter((d) => ACTIVE_STATUSES.has(d.status))
      .sort((a, b) => {
        const ta = new Date(a.last_message_at || a.updated_at || a.created_at || '').getTime() || 0;
        const tb = new Date(b.last_message_at || b.updated_at || b.created_at || '').getTime() || 0;
        return tb - ta;
      });
  }, [dealsMode, allDeals]);

  const completedDeals = useMemo(() => {
    if (!dealsMode) return [];
    return allDeals
      .filter((d) => COMPLETED_STATUSES.has(d.status))
      .sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || '').getTime() || 0;
        const tb = new Date(b.updated_at || b.created_at || '').getTime() || 0;
        return tb - ta;
      });
  }, [dealsMode, allDeals]);

  // Один плоский список: предложения, сделки и закрытые переговоры
  // вперемешку, по свежести (WhatsApp-упрощение 04.08.2026, вкладок нет;
  // 05.08.2026: отклонённые/отменённые ставки тоже сюда — единственное
  // место для каждого разговора, без дублей в других экранах).
  const unifiedDealItems = useMemo(() => {
    if (!dealsMode) return [];
    // _unread — единая формула «требует внимания сейчас» (dealsUnread.js,
    // п.4/22 ТЗ): для сделки — реальные непрочитанные сообщения; для
    // предложения — мяч на моей стороне; закрытые переговоры — никогда.
    const offers = offersData.map((it) => ({
      _kind: 'offer',
      _sortAt: it.latest_bid_at || it.created_at || '',
      _unread: role === 'client' ? ((it.active_bids_count || 0) > 0 ? 1 : 0) : (isBidActionable(it, { asOwner: !!it._incoming }) ? 1 : 0),
      _data: it,
    }));
    const deals = [...activeDeals, ...completedDeals].map((it) => ({
      _kind: 'deal',
      _sortAt: it.last_message_at || it.updated_at || it.created_at || '',
      _unread: (it.unread_count || 0) + (it.tracking_action_required ? 1 : 0),
      _data: it,
    }));
    const closedBids = closedBidsData.map((it) => ({
      _kind: 'closedBid',
      _sortAt: it.updated_at || it.created_at || '',
      _unread: 0,
      _data: it,
    }));
    return [...offers, ...deals, ...closedBids].sort((a, b) => (new Date(b._sortAt).getTime() || 0) - (new Date(a._sortAt).getTime() || 0));
  }, [dealsMode, role, offersData, activeDeals, completedDeals, closedBidsData]);

  // ═══ Рендер: карточка предложения (клиент) — один груз ═══
  const renderCargoOffer = ({ item: cargo, unread = 0 }) => {
    const cnt = cargo.active_bids_count || 0;
    const minPrice = cargo.min_bid_price;
    const cur = cargo.currency || 'USD';
    const time = relTime(cargo.latest_bid_at);
    return (
      <TouchableOpacity
        key={cargo.id}
        testID="deals-cargo-offer"
        style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => navigation.navigate('CargoDetail', { cargoId: cargo.id, role })}
        activeOpacity={0.7}
      >
        <View style={[s.avatar, { backgroundColor: '#F0F3F1' }]}>
          <Feather name="package" size={18} color="#617067" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.row}>
            <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>
              {countryFlag(cargo.from_country)} {localizePlace(cargo.from_city || '—', lang)} → {countryFlag(cargo.to_country)} {localizePlace(cargo.to_city || '—', lang)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Feather name="clock" size={11} color={theme.textDim} />
              <Text style={[s.time, { color: theme.textDim }]}>{time}</Text>
            </View>
          </View>
          {cargo.cargo_desc ? (
            <Text style={[s.meta, { color: theme.textMuted }]} numberOfLines={1}>
              {localizeCargoName(cargo.cargo_desc, lang)}
            </Text>
          ) : null}
          <View style={s.row}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <View style={[s.statusPill, { backgroundColor: '#F0F3F1' }]}>
                <View style={[s.statusDot, { backgroundColor: '#7C8B82' }]} />
                <Text style={[s.statusPillText, { color: '#617067' }]}>
                  {cnt} {t('deals_offers_count')}
                </Text>
              </View>
              {/* Счётчик предложения уже показан во вкладке и в BottomNav.
                  Третья одинаковая цифра внутри карточки только создавала
                  визуальный шум и выглядела как ещё одно событие. */}
            </View>
            <Text style={[s.price, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
              {minPrice ? `${t('deals_offers_from')} ${formatPrice(minPrice, cur, t)}` : ''}
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={theme.textDim} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    );
  };

  // ═══ Рендер: карточка одной ставки (предложение ИЛИ закрытые переговоры:
  // отклонено/отменено/истекло) — для обеих ролей, не только водителя ═══
  const renderBidCard = ({ item: bid, unread = 0 }) => {
    const isCountered = bid.status === 'countered';
    const isClosed = bid.status === 'rejected' || bid.status === 'cancelled' || bid.status === 'expired';
    const cur = bid.currency || 'USD';
    const time = relTime(bid.updated_at || bid.created_at);
    const label = isClosed
      ? t('status_cancelled')
      : isCountered
        ? t('deals_offer_bargain')
        : (bid._incoming ? t('deals_offer_new') : t('deals_offer_waiting'));
    const statusColor = isClosed ? '#94A3B8' : isCountered ? '#3478D4' : '#617067';
    return (
      <TouchableOpacity
        key={bid.id}
        testID="deals-driver-bid"
        style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, opacity: isClosed ? 0.65 : 1 }]}
        onPress={() => {
          if (bid.cargo_id) navigation.navigate('CargoDetail', { cargoId: bid.cargo_id, bidId: bid.id, role });
          else if (bid.trip_id) navigation.navigate('TripDetail', { tripId: bid.trip_id, bidId: bid.id, role });
        }}
        activeOpacity={0.7}
      >
        <View style={[s.avatar, { backgroundColor: statusColor + '15' }]}>
          <Feather name="dollar-sign" size={18} color={statusColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.row}>
            <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>
              {countryFlag(bid.from_country)} {localizePlace(bid.cargo_from || bid.trip_from || '—', lang)} → {countryFlag(bid.to_country)} {localizePlace(bid.cargo_to || bid.trip_to || '—', lang)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Feather name="clock" size={11} color={theme.textDim} />
              <Text style={[s.time, { color: theme.textDim }]}>{time}</Text>
            </View>
          </View>
          <View style={s.row}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <View style={[s.statusPill, { backgroundColor: statusColor + '15' }]}>
                <View style={[s.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[s.statusPillText, { color: statusColor }]}>{label}</Text>
              </View>
              {/* Для предложения оставляем один статус-пилл; общий непрочитанный
                  счётчик живёт на вкладке «Сделки». */}
            </View>
            <Text style={[s.price, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
              {formatPrice(bid.amount, cur, t)}
              {isCountered && bid.counter_amount ? ` → ${formatPrice(bid.counter_amount, cur, t)}` : ''}
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={theme.textDim} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    );
  };

  // ═══ Рендер: карточка сделки (единый список, компактный статус) ═══
  const renderDealCard = ({ item: deal, unread: suppliedUnread }) => {
    const statusColor = STATUS_COLOR[deal.status] || '#94A3B8';
    const statusLabel = compactStatusLabel(deal.status, t);
    const cur = deal.currency || 'USD';
    const trackingActionRequired = !!deal.tracking_action_required;
    const unread = suppliedUnread == null
      ? (deal.unread_count || 0) + (trackingActionRequired ? 1 : 0)
      : suppliedUnread;
    const time = relTime(deal.last_message_at || deal.updated_at);
    // Партнёр — противоположная роль: клиенту показываем водителя и наоборот.
    const partnerName = role === 'client'
      ? (deal.driver_name || t('role_driver'))
      : (deal.shipper_name || t('role_client'));
    const partnerRoleLabel = role === 'client' ? t('role_driver') : t('role_client');
    return (
      <TouchableOpacity
        key={deal.id}
        testID="deals-deal-card"
        style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, opacity: deal.status === 'cancelled' ? 0.65 : 1 }]}
        // The deal itself is the operational entry point.  GPS consent and
        // the protected conversation live in the Deal Room; opening a cargo
        // detail here hid the driver's action after a GPS push.
        onPress={() => navigation.navigate('Chat', {
          dealId: deal.id,
          roomId: deal.chat_room_id || null,
          partner: { id: role === 'client' ? deal.driver_id : deal.shipper_id, name: partnerName },
          role,
        })}
        activeOpacity={0.7}
      >
        <View style={[s.avatar, { backgroundColor: statusColor + '15' }]}>
          <MaterialCommunityIcons name="account-outline" size={20} color={statusColor} />
        </View>
        <View style={{ flex: 1 }}>
          {/* Строка 1: Имя · Роль                Время */}
          <View style={s.row}>
            <Text style={{ flex: 1 }} numberOfLines={1}>
              <Text style={[s.name, { color: theme.text }]}>{partnerName}</Text>
              <Text style={[s.roleSuffix, { color: theme.textDim }]}>  · {partnerRoleLabel}</Text>
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Feather name="clock" size={11} color={theme.textDim} />
              <Text style={[s.time, { color: theme.textDim }]}>{time}</Text>
            </View>
          </View>
          {/* Строка 2: Маршрут                  Непрочитанные */}
          <View style={s.row}>
            <Text style={[s.route, { color: theme.textMuted }]} numberOfLines={1}>
              {countryFlag(deal.from_country)} {localizePlace(deal.from_city || '—', lang)} → {countryFlag(deal.to_country)} {localizePlace(deal.to_city || '—', lang)}
            </Text>
            {unread > 0 ? (
              <View style={[s.badge, { backgroundColor: '#D64545' }]}>
                <Text style={s.badgeTxt}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            ) : null}
          </View>
          {/* Строка 3: Статус-пилл (компактный, WhatsApp-упрощение) */}
          <View style={[s.statusPill, { backgroundColor: statusColor + '15', alignSelf: 'flex-start' }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {trackingActionRequired ? (
            <View style={s.trackingAction} testID="deal-tracking-action-required">
              <Feather name="navigation" size={13} color="#3478D4" />
              <Text style={s.trackingActionText}>{t('tracking_action_required')}</Text>
              <Feather name="chevron-right" size={15} color="#3478D4" />
            </View>
          ) : null}
          {/* Строка 4: Последнее сообщение    Цена */}
          <View style={s.row}>
            {deal.last_message ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                <Feather name="message-circle" size={12} color={theme.textMuted} />
                <Text style={[s.lastMsg, { color: theme.textMuted }]} numberOfLines={1}>{deal.last_message}</Text>
              </View>
            ) : <View style={{ flex: 1 }} />}
            <Text style={[s.price, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">{formatPrice(deal.amount, cur, t)}</Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={theme.textDim} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    );
  };

  // ═══ CHATS MODE — секции (не-deals) ═══
  const chatSections = useMemo(() => {
    if (dealsMode) return [];
    const q = query.trim().toLowerCase();
    const ts = (r) => { const d = new Date(String(r.last_message_at || r.last_at || '').replace(' ', 'T')); return isNaN(d) ? 0 : d.getTime(); };
    const byTime = (a, b) => ts(b) - ts(a);
    const match = (r) => {
      if (!q) return true;
      const hay = [
        prettifyPartnerName(r.partner_name, r.partner_id, t), r.partner_company,
        r.route_label, r.route_from, r.route_to,
        r.cargo_title, r.cargo_type, r.vehicle_plate, r.last_message,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    };
    const pinned = [], unread = [], rest = [];
    for (const r of rooms) {
      if (!match(r)) continue;
      if (pinnedIds.includes(String(r.id))) pinned.push(r);
      else if ((r.unread_count ?? r.unread ?? 0) > 0) unread.push(r);
      else rest.push(r);
    }
    pinned.sort((a, b) => pinnedIds.indexOf(String(a.id)) - pinnedIds.indexOf(String(b.id)));
    unread.sort(byTime);
    rest.sort(byTime);
    const result = [];
    if (pinned.length) result.push({ key: 'pinned', data: pinned });
    if (unread.length) result.push({ key: 'unread', count: unread.length, data: unread });
    if (rest.length) result.push({ key: 'rest', data: rest });
    return result;
  }, [rooms, query, pinnedIds, dealsMode, t, lang]);

  const STATUS_DOT_CHAT = {
    accepted: '#168759', confirmed: '#168759',
    in_progress: '#3478D4', at_border: '#3478D4',
    completed: '#94A3B8', delivered: '#94A3B8',
    cancelled: '#EF4444', rejected: '#EF4444', expired: '#94A3B8',
  };
  const renderChatItem = ({ item, section }) => {
    const isPinned = section?.key === 'pinned';
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
        style={[s.card, { backgroundColor: theme.card, borderColor: isPinned ? accent + '66' : theme.border }]}
        onPress={() => {
          navigation.navigate('Chat', { partner: { id: item.partner_id || item.id, name: partnerName }, roomId: item.id, dealId: item.deal_id, role });
        }}
        onLongPress={() => {
          const id = String(item.id);
          const wasPinned = pinnedIds.includes(id);
          if (!wasPinned && pinnedIds.length >= 5) { toast(t('pin_limit_reached'), 'error'); return; }
          togglePin(id);
          toast(wasPinned ? t('chat_unpinned') : t('chat_pinned'), 'success');
        }}
        delayLongPress={400}
      >
        <View style={[s.avatar, { backgroundColor: accent + '18' }]}>
          <Feather name={isSupport ? 'shield' : 'user'} size={16} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.row}>
            <Text style={{ flex: 1 }} numberOfLines={1}>
              <Text style={[s.name, { color: theme.text }]}>{partnerName}</Text>
              {roleKey ? <Text style={[s.roleSuffix, { color: theme.textDim }]}>  ·  {t(roleKey)}</Text> : null}
            </Text>
            {time ? <Text style={[s.time, { color: theme.textDim }]}>{time}</Text> : null}
          </View>
          {(infoStr || dealStatus) ? (
            <View style={s.row}>
              <Text style={[s.meta, { color: theme.textMuted, flex: 1 }]} numberOfLines={1}>{infoStr}</Text>
              {dealStatus ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={[s.statusDot, { backgroundColor: STATUS_DOT_CHAT[dealStatus] || '#94A3B8' }]} />
                  <Text style={{ fontSize: 10, color: theme.textDim }}>{formatStatus(userFacingDealStatus(dealStatus))}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={s.row}>
            <Text style={[s.lastMsg, { color: theme.textMuted }]} numberOfLines={1}>
              {item.last_message || t('chat_no_messages')}
            </Text>
            {bidStr ? <Text style={[s.price, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">{bidStr}</Text> : null}
          </View>
        </View>
        <View style={s.right}>
          {isPinned ? <Feather name="map-pin" size={12} color={theme.textDim} /> : null}
          {urgent ? (
            <View style={[s.flag, { backgroundColor: '#EF444422' }]}>
              <Text style={s.flagTxt}>{t(item.is_dispute ? 'chat_flag_dispute' : 'chat_flag_urgent')}</Text>
            </View>
          ) : null}
          {unread > 0 ? (
            <View style={[s.badge, { backgroundColor: '#D64545' }]} testID="deal-room-list-unread">
              <Text style={s.badgeTxt}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const dealTabs = useMemo(() => ([
    { key: 'offers', label: t('deals_tab_offers'), count: offersData.length,
      attentionCount: offersData.reduce((sum, item) => sum + (role === 'client'
        ? ((item.active_bids_count || 0) > 0 ? 1 : 0)
        : (isBidActionable(item, { asOwner: !!item._incoming }) ? 1 : 0)), 0),
      testID: 'deals-tab-offers' },
    { key: 'active', label: t('deals_tab_active'), count: activeDeals.length,
      attentionCount: activeDeals.reduce((sum, item) => sum + (item.unread_count || 0) + (item.tracking_action_required ? 1 : 0), 0),
      testID: 'deals-tab-active' },
    { key: 'completed', label: t('deals_tab_completed'), count: completedDeals.length + closedBidsData.length, testID: 'deals-tab-completed' },
  ]), [t, role, offersData, activeDeals, completedDeals.length, closedBidsData.length]);

  // Одинаковый путь для обеих ролей: Предложения → В работе → Завершённые.
  const renderUnifiedDealItem = ({ item }) => {
    if (item._kind === 'offer') {
      return role === 'client'
        ? renderCargoOffer({ item: item._data, unread: item._unread })
        : renderBidCard({ item: item._data, unread: item._unread });
    }
    if (item._kind === 'closedBid') {
      return renderBidCard({ item: item._data, unread: 0 });
    }
    return renderDealCard({ item: item._data, unread: item._unread });
  };

  const renderDealsContent = () => {
    let data = unifiedDealItems.filter((item) => {
      if (dealTab === 'offers') return item._kind === 'offer';
      if (dealTab === 'active') return item._kind === 'deal' && ACTIVE_STATUSES.has(item._data.status);
      return item._kind === 'closedBid' || (item._kind === 'deal' && COMPLETED_STATUSES.has(item._data.status));
    });

    // Поиск по содержимому
    const q = query.trim().toLowerCase();
    if (q) {
      data = data.filter(({ _data: item }) => {
        const hay = [
          item.from_city, item.to_city, item.cargo_desc, item.driver_name,
          item.shipper_name, item.cargo_from, item.cargo_to, item.cargo_desc,
          item.last_message,
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    const emptyText = dealTab === 'active'
      ? t('deals_no_active')
      : dealTab === 'completed'
        ? t('deals_no_completed')
        : (role === 'driver' ? t('deals_empty_driver') : t('deals_empty_unified'));

    return (
      <FlatList
        data={data}
        keyExtractor={(item) => `${item._kind}-${item._data.id}`}
        renderItem={renderUnifiedDealItem}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
        ListEmptyComponent={<Text style={[s.empty, { color: theme.textMuted }]}>{emptyText}</Text>}
      />
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

      {/* Поиск — на всех вкладках. */}
      <View style={{ paddingHorizontal: 12 }}>
        <View style={[s.search, { backgroundColor: theme.card, borderColor: theme.border, marginHorizontal: 0 }]}>
          <Feather name="search" size={17} color={theme.textMuted} />
          <TextInput
            style={[s.searchInput, { color: theme.text }]}
            placeholder={dealsMode ? (lang === 'RU' ? 'Поиск: водитель, маршрут, груз' : t('chat_search_placeholder')) : t('chat_search_placeholder')}
            placeholderTextColor={theme.textMuted}
            value={query}
            onChangeText={setQuery}
            testID="deal-room-search"
          />
          {query ? <TouchableOpacity onPress={() => setQuery('')}><Feather name="x" size={16} color={theme.textMuted} /></TouchableOpacity> : null}
        </View>
      </View>

      {/* Решение владельца (05.08.2026, п.3): максимум 2 компактных фильтра
          вместо шторки — Все / Непрочитанные, без отдельных секций. */}
      {dealsMode ? (
        <View style={s.dealTabsWrap}>
          <SegmentTabs items={dealTabs} value={dealTab} onChange={setDealTab} accent={accent} variant="underline" />
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
      ) : dealsMode ? (
        renderDealsContent()
      ) : (
        <SectionList
          sections={chatSections}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderChatItem}
          renderSectionHeader={({ section }) => (
            <View style={s.sectionRow}>
              {section.key === 'pinned' ? <Feather name="map-pin" size={13} color={theme.textMuted} /> : null}
              {section.key === 'unread' ? <View style={[s.sectionDot2, { backgroundColor: '#D64545' }]} /> : null}
              <Text style={[s.sectionLabel, { color: theme.textMuted }]}>
                {section.key === 'pinned' ? t('section_pinned')
                 : section.key === 'unread' ? `${t('section_new')} (${section.count})`
                 : t('section_earlier')}
              </Text>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          ListEmptyComponent={<Text style={[s.empty, { color: theme.textMuted }]}>{query ? t('chat_no_results') : t('chats_empty')}</Text>}
        />
      )}

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  // Поиск
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, height: 44, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  // Компактные фильтры Все/Непрочитанные (05.08.2026, п.3 — заменили шторку)
  dealTabsWrap: { paddingHorizontal: 12 },
  // Карточки
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  name: { fontSize: 14, fontWeight: '700' },
  roleSuffix: { fontSize: 12, fontWeight: '400' },
  time: { fontSize: 11 },
  meta: { fontSize: 12, fontWeight: '400' },
  route: { fontSize: 13, flex: 1 },
  lastMsg: { fontSize: 12, flex: 1 },
  // flexShrink/minWidth:0/maxWidth — длинная цена (UZS/KGS с суффиксом,
  // "X → Y" у торга) не должна раздвигать карточку "Сделки" за экран;
  // ellipsis вместо горизонтального оверфлоу (05.08.2026, п.4).
  price: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], flexShrink: 1, minWidth: 0, maxWidth: '60%', textAlign: 'right' },
  // Статус-пилл
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 3, flexShrink: 0 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 12, fontWeight: '600' },
  trackingAction: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#3478D455', backgroundColor: '#3478D412', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginTop: 6, alignSelf: 'flex-start' },
  trackingActionText: { color: '#3478D4', fontSize: 12, fontWeight: '800' },
  // Бейджи
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  // Чаты-секции
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, paddingBottom: 6 },
  sectionDot2: { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  right: { alignItems: 'flex-end', gap: 5 },
  flag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  flagTxt: { fontSize: 11, fontWeight: '900', color: '#EF4444' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
