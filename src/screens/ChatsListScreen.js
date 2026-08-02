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
import { View, Text, FlatList, SectionList, TouchableOpacity, StyleSheet, TextInput, RefreshControl, ActivityIndicator, Platform, Alert } from 'react-native';
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
import { storage } from '../utils/storage';
import { notificationsAPI } from '../utils/notificationsAPI';
import { notifyNotifRead } from '../utils/unreadEvents';
import { useToast } from '../components/Toast';
import { formatPrice } from '../utils/normalizers';
import { localizePlace, localizeCargoName } from '../utils/places';
import { prettifyPartnerName } from '../utils/displayName';
import { accentFor } from '../components/deal/DealRoom';

// 01.08 v2: вместо 4 фильтр-чипов — секции (Закреплённые / Новые / Ранее)
// + долгое нажатие → закрепить/открепить (до 5, AsyncStorage).

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
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  // UX 26.07 (приказ владельца): dealsMode делится на два раздела
  // кнопками слева-справа — «Предложения» (стол переговоров) и «Чаты»
  // (переписка). При первом заходе, если есть живые предложения,
  // открываем сразу их.
  const [seg, setSeg] = useState('chats');
  const segInitRef = React.useRef(false);
  // Просмотренные предложения (локально): открыл — карточка гаснет, «новое»
  // снимается, непросмотренные всплывают наверх. Ключ — id ставки.
  const SEEN_KEY = 'ur_seen_offers';
  const [seenOffers, setSeenOffers] = useState({});
  useEffect(() => {
    storage.get(SEEN_KEY).then((raw) => { try { if (raw) setSeenOffers(JSON.parse(raw)); } catch {} });
  }, []);
  const markOfferSeen = (bidId) => {
    setSeenOffers((prev) => {
      if (prev[bidId]) return prev;
      const next = { ...prev, [bidId]: 1 };
      storage.set(SEEN_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };
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
  // Относительное время: «5 мин», «2 ч», «вчера», иначе дата.
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

  const load = useCallback(async () => {
    try {
      const data = await chatAPI.rooms();
      const rooms = data.rooms || [];
      setRooms(rooms);
      if (dealsMode) {
        // Живые предложения: у клиента — входящие ставки водителей по моим
        // грузам; у водителя — его собственные ставки ПЛЮС входящие ставки
        // клиентов на его рейсы (_incoming — для верной подписи/действий:
        // входящую водитель отклоняет rejectBid, свою отменяет cancelBid).
        const d = await marketAPI.myDashboard().catch(() => null);
        const raw = d
          ? (role === 'driver'
              ? [
                  ...(d.my_bids || []),
                  ...((d.incoming_bids || []).filter((b) => b.trip_id).map((b) => ({ ...b, _incoming: true }))),
                ]
              : (d.incoming_bids || []))
          : [];
        // Раньше «начатая переписка» (комната с любым last_message) выбрасывала
        // ставку из «Предложений» в «Чаты» (приказ 27.07). Но бэк создаёт
        // комнату вместе со ставкой и часто уже кладёт туда системное
        // сообщение — из-за этого свежие ставки исчезали из «Предложений»,
        // а у клиента «1 предложение» на карточке груза вело в пустой список
        // (жалоба 28.07). Показываем ВСЕ живые ставки — дубль с «Чаты» ок:
        // разные разделы, разные действия (Принять/Отклонить vs переписка).
        // Мёртвые ставки не показываем: груз удалён (LEFT JOIN дал пустой
        // маршрут) — торговаться не о чем, карточка «— → —» только путала.
        const live = raw.filter((b) =>
          (b.status === 'pending' || b.status === 'countered')
          && !(b.cargo_id && !b.cargo_from && !b.trip_id)
        );
        setOffers(live);
        const activeDeals = (d?.my_deals || []).filter((dl) =>
          dl.status === 'accepted' || dl.status === 'in_progress' || dl.status === 'picked_up' || dl.status === 'at_border'
        );
        setDeals(activeDeals);
        if (!segInitRef.current) {
          segInitRef.current = true;
          if (live.length > 0 || activeDeals.length > 0) setSeg('offers');
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

  // Непросмотренные предложения — наверх; внутри групп свежие выше по времени.
  // ВАЖНО: объявлено ПЕРЕД sections (иначе TDZ-ошибка «Cannot access
  // offersSorted before initialization» → крашится вся вкладка «Сделки»).
  const offersSorted = React.useMemo(() => {
    const ts = (b) => { const d = new Date(String(b.created_at || '').replace(' ', 'T')); return isNaN(d) ? 0 : d.getTime(); };
    const sorted = offers.slice().sort((a, b) => {
      const sa = seenOffers[a.id] ? 1 : 0, sb = seenOffers[b.id] ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return ts(b) - ts(a);
    });
    const dealCards = deals.map((dl) => ({ ...dl, _isDeal: true }));
    return [...dealCards, ...sorted];
  }, [offers, deals, seenOffers]);

  const sections = useMemo(() => {
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
    // Дом заказа: в «Сделках» сверху единая секция «Активные» — сделки в
    // работе + живые ставки/контр-офферы. Тап по строке ведёт в карточку
    // заказа (см. renderDealCard / renderOfferCard). Раньше это была
    // отдельная под-вкладка «Предложения» — водители путались, где искать.
    if (dealsMode) {
      const activeItems = offersSorted;
      if (activeItems.length) {
        result.push({ key: 'active', data: activeItems, count: activeItems.length, _kind: 'active' });
      }
    }
    if (pinned.length) result.push({ key: 'pinned', data: pinned });
    if (unread.length) result.push({ key: 'unread', count: unread.length, data: unread });
    if (rest.length) result.push({ key: 'rest', data: rest });
    return result;
  }, [rooms, query, pinnedIds, offersSorted, dealsMode, t, lang]);

  // Убрать предложение из списка: СВОЮ ставку отменяем (cancelBid),
  // входящую отклоняем (rejectBid). У водителя теперь бывают обе:
  // свои ставки на грузы и входящие (_incoming) на его рейсы.
  const dismissOffer = async (bid) => {
    const isMineBid = role === 'driver' && !bid._incoming;
    const q = isMineBid ? t('cancel_bid_confirm') : t('reject_bid_confirm_q');
    const doIt = async () => {
      const r = isMineBid
        ? await marketAPI.cancelBid(bid.id).catch(() => null)
        : await marketAPI.rejectBid(bid.id).catch(() => null);
      if (r && r.ok) { toast(isMineBid ? t('bid_cancelled_toast') : t('bid_rejected_toast'), 'success'); load(); }
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

  // «Дом заказа»: тап по предложению ведёт в карточку заказа, не в чат.
  // Раньше карточка предложения открывала Deal Room (чат) — водитель терял
  // контекст ЗАКАЗА и искал торг в переписке. Кнопка «💬 Открыть чат» есть
  // на карточке заказа рядом, никто ничего не теряет.
  const openOffer = async (bid) => {
    markOfferSeen(bid.id);
    if (bid.cargo_id) {
      navigation.navigate('CargoDetail', { cargoId: bid.cargo_id, bidId: bid.id, role });
      return;
    }
    if (bid.trip_id) {
      navigation.navigate('TripDetail', { tripId: bid.trip_id, bidId: bid.id, role });
      return;
    }
    // Фолбэк для очень старых ставок без cargo_id/trip_id (не должно быть).
    try {
      const r = await marketAPI.openBidChat(bid.id);
      const roomId = r && (r.chat_room_id || r.chatRoomId);
      if (r && r.ok && roomId) {
        navigation.navigate('Chat', { roomId, role, bidId: bid.id });
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
    const seen = !!seenOffers[bid.id];
    // Просмотренное — приглушаем (серая рамка, без «новое», меньше внимания);
    // непросмотренное — горит цветом + синяя точка «новое».
    const statusColor = seen ? theme.border : (isCountered ? '#A855F7' : '#FF8400');
    const label = isCountered
      ? t('deals_offer_bargain')
      : (role === 'driver' && !bid._incoming ? t('deals_offer_waiting') : t('deals_offer_new'));
    const time = relTime(bid.created_at);
    return (
      <TouchableOpacity
        key={String(bid.id)}
        testID="deals-offer-card"
        style={[s.card, { backgroundColor: theme.card, borderColor: statusColor, borderWidth: 1.5, opacity: seen ? 0.72 : 1 }]}
        onPress={() => openOffer(bid)}
        activeOpacity={0.85}
      >
        <View style={[s.avatar, { backgroundColor: (isCountered ? '#A855F7' : '#FF8400') + '22' }]}>
          <Feather name="dollar-sign" size={18} color={isCountered ? '#A855F7' : '#FF8400'} />
          {!seen ? <View style={s.newDot} testID="deals-offer-newdot" /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.row}>
            <Text style={[s.name, { color: theme.text, fontWeight: seen ? '600' : '800' }]} numberOfLines={1}>
              {localizePlace(bid.cargo_from || bid.trip_from || '—', lang)} → {localizePlace(bid.cargo_to || bid.trip_to || '—', lang)}
            </Text>
            {time ? <Text style={[s.time, { color: theme.textDim }]}>{time}</Text> : null}
          </View>
          {(bid.cargo_desc || bid.trip_desc) ? (
            <Text style={[s.preview, { color: theme.textMuted }]} numberOfLines={1}>
              {localizeCargoName(bid.cargo_desc || bid.trip_desc, lang)}
            </Text>
          ) : null}
          <View style={s.row}>
            <Text style={[s.offerAmount, { color: theme.text }]} numberOfLines={1}>
              {formatPrice(bid.amount, cur, t)}
              {isCountered && bid.counter_amount ? `  →  ${formatPrice(bid.counter_amount, cur, t)}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {!seen ? <Text style={[s.dealStatus, { color: isCountered ? '#A855F7' : '#FF8400' }]}>{label}</Text> : null}
              <Text style={[s.offerOpen, { color: accent }]}>{t('open_bid_chat')} ›</Text>
            </View>
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

  const DEAL_STATUS_LABEL = {
    accepted: t('deal_status_accepted'),
    in_progress: t('deal_status_in_progress'),
    picked_up: t('deal_status_picked_up'),
    at_border: t('deal_status_at_border'),
  };
  const DEAL_STATUS_COLOR = {
    accepted: '#22C55E', in_progress: '#FF8400', picked_up: '#FF8400', at_border: '#2563EB',
  };

  const renderDealCard = (deal) => {
    const statusColor = DEAL_STATUS_COLOR[deal.status] || '#22C55E';
    const statusLabel = DEAL_STATUS_LABEL[deal.status] || deal.status;
    const cur = deal.currency || 'USD';
    return (
      <TouchableOpacity
        key={'deal_' + deal.id}
        testID="deals-deal-card"
        style={[s.card, { backgroundColor: theme.card, borderColor: statusColor, borderWidth: 1.5 }]}
        onPress={() => {
          // «Дом заказа»: тап по сделке — в карточку заказа (там прогресс-бар,
          // статусы, кнопка «💬 Открыть чат»), а не сразу в чат.
          if (deal.cargo_id) {
            navigation.navigate('CargoDetail', { cargoId: deal.cargo_id, dealId: deal.id, role });
          } else if (deal.trip_id) {
            navigation.navigate('TripDetail', { tripId: deal.trip_id, dealId: deal.id, role });
          } else if (deal.chat_room_id) {
            navigation.navigate('Chat', { roomId: deal.chat_room_id, dealId: deal.id, role });
          }
        }}
        activeOpacity={0.85}
      >
        <View style={[s.avatar, { backgroundColor: statusColor + '22' }]}>
          <MaterialCommunityIcons name="handshake-outline" size={18} color={statusColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.row}>
            <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>
              {localizePlace(deal.from_city || '—', lang)} → {localizePlace(deal.to_city || '—', lang)}
            </Text>
          </View>
          {deal.cargo_desc ? (
            <Text style={[s.preview, { color: theme.textMuted }]} numberOfLines={1}>
              {localizeCargoName(deal.cargo_desc, lang)}
            </Text>
          ) : null}
          <View style={s.row}>
            <Text style={[s.offerAmount, { color: theme.text }]} numberOfLines={1}>
              {formatPrice(deal.amount, cur, t)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
              <Text style={[s.dealStatus, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Дом заказа 02.08.2026 (приказ владельца): «Предложения» и «Чаты»
  // объединены в единый список. Одна строка = одна связка «заказ+контрагент».
  // Сегмент оставлен только на fallback для не-dealsMode путей, но в UI не
  // показывается. showOffersSeg = false всегда (используем секции).
  const showOffersSeg = false;

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
  const renderItem = ({ item, section }) => {
    // Дом заказа: секция «Активные» рендерит карточки предложений/сделок,
    // а не строки чата. Остальные секции — обычные строки переписки.
    if (section?.key === 'active') {
      return item._isDeal ? renderDealCard(item) : renderOfferCard(item);
    }
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
          // «Дом заказа» (dealsMode): тап по строке — в карточку заказа, где
          // сверху блок торга/сделки и кнопка «💬 Открыть чат» рядом. Обычный
          // экран «Чаты» продолжает вести в переписку (переписка = переписка).
          // Support-строка (Data Room / бот поддержки) всегда идёт в чат.
          if (dealsMode && !isSupport) {
            if (item.cargo_id) {
              navigation.navigate('CargoDetail', { cargoId: item.cargo_id, dealId: item.deal_id, role });
              return;
            }
            if (item.trip_id) {
              navigation.navigate('TripDetail', { tripId: item.trip_id, dealId: item.deal_id, role });
              return;
            }
          }
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
              {roleKey ? <Text style={[s.roleInline, { color: theme.textDim }]}>  ·  {t(roleKey)}</Text> : null}
            </Text>
            {time ? <Text style={[s.time, { color: theme.textDim }]}>{time}</Text> : null}
          </View>
          {/* Статус живёт на строке маршрута (справа), цена — внизу одна:
              «8600 KZT В РАБОТЕ» слитно читалось как одно (спека владельца п.6). */}
          {(infoStr || dealStatus) ? (
            <View style={s.row}>
              <Text style={[s.info, { color: theme.textMuted, flex: 1 }]} numberOfLines={1}>{infoStr}</Text>
              {dealStatus ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={[s.statusDot, { backgroundColor: STATUS_DOT[dealStatus] || '#94A3B8' }]} />
                  <Text style={[s.statusTiny, { color: theme.textDim }]}>{formatStatus(dealStatus)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={s.row}>
            <Text style={[s.preview, { color: theme.textMuted }]} numberOfLines={1}>
              {item.last_message || t('chat_no_messages')}
            </Text>
            {bidStr ? <Text style={[s.bid, { color: theme.text }]}>{bidStr}</Text> : null}
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

      {/* Дом заказа 02.08: сегмент «Предложения / Чаты» убран. Единый список
          с секцией «Активные» сверху (см. sections в useMemo). Иначе водители
          путались, где искать торг — он был и там, и там. */}

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

      {loading ? (
        <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
      ) : showOffersSeg ? (
        <FlatList
          data={offersSorted}
          keyExtractor={(i) => String(i._isDeal ? 'deal_' + i.id : i.id)}
          renderItem={({ item }) => item._isDeal ? renderDealCard(item) : renderOfferCard(item)}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          ListEmptyComponent={<Text style={[s.empty, { color: theme.textMuted }]}>{t('deals_no_offers')}</Text>}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={s.sectionRow}>
              {section.key === 'active' ? <MaterialCommunityIcons name="handshake-outline" size={14} color={accent} /> : null}
              {section.key === 'pinned' ? <Feather name="map-pin" size={13} color={theme.textMuted} /> : null}
              {section.key === 'unread' ? <View style={[s.sectionDot, { backgroundColor: '#FF8400' }]} /> : null}
              <Text style={[s.sectionLabel, { color: section.key === 'active' ? accent : theme.textMuted }]}>
                {section.key === 'active' ? `${t('deals_section_active')} (${section.count})`
                 : section.key === 'pinned' ? t('section_pinned')
                 : section.key === 'unread' ? `${t('section_new')} (${section.count})`
                 : (dealsMode ? t('deals_section_conversations') : t('section_earlier'))}
              </Text>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          ListEmptyComponent={<Text style={[s.empty, { color: theme.textMuted }]}>{query ? t('chat_no_results') : (dealsMode ? (role === 'driver' ? t('deals_empty_driver') : t('deals_empty')) : t('chats_empty'))}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '900' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 4, paddingHorizontal: 12, height: 44, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, paddingBottom: 6 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
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
  // Синяя точка «новое» на аватаре непросмотренного предложения.
  newDot: { position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: 6, backgroundColor: '#2563EB', borderWidth: 2, borderColor: '#fff' },
});
