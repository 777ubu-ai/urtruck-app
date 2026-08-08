import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Alert, Image, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';

// Кнопка действия сделки: иконка Feather + текст (вместо эмодзи-префикса).
// В загрузке показываем «...». Цвет наследуется от родителя (onAccent/text).
function DealActionLabel({ icon, text, color, loading }) {
  if (loading) return <Text style={[dealLblStyle, { color }]}>...</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Feather name={icon} size={15} color={color} />
      <Text style={[dealLblStyle, { color }]}>{text}</Text>
    </View>
  );
}
const dealLblStyle = { fontSize: 13, fontWeight: '700' };
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { formatBids, formatStatus, t as tGlobal } from '../utils/i18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { PhotoGallery } from '../components/PhotoGallery';
import { addNotification, removeCargo } from '../utils/store';
import { routeStats } from '../utils/geo';
import BidModal from '../components/BidModal';
import ShareModal from '../components/ShareModal';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS, useAuth } from '../utils/AuthContext';
import { marketAPI } from '../utils/marketAPI';
import { reviewsAPI } from '../utils/reviews';
import { pickDealStatus, userFacingDealStatus } from '../utils/dealStatusOrder';
import { openContactPartner } from '../utils/contactPartner';
import { normalizeCargo, cargoDisplay, sanitizeForDisplay, formatPrice } from '../utils/normalizers';
import { localizePlace } from '../utils/places';
import { formatDateForDisplay } from '../utils/dateInput';
import { buildCargoShareText } from '../utils/share';
import { WEB_URL } from '../config/env';
import {v1Colors, useV1Colors, v1Radius, v1AccentFor} from '../theme/designV1';
import GlassCard from '../components/ui/v1/GlassCard';
import SectionTitle from '../components/ui/v1/SectionTitle';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import StickyCTABar from '../components/ui/v1/StickyCTABar';
import PrimaryCTA from '../components/ui/actions/PrimaryCTA';
import SecondaryButton from '../components/ui/actions/SecondaryButton';
import DestructiveButton from '../components/ui/actions/DestructiveButton';
import PriceSavingsBadge from '../components/deal/PriceSavingsBadge';

const FLAGS = { KZ: '🇰🇿', UZ: '🇺🇿', RU: '🇷🇺', KG: '🇰🇬', CN: '🇨🇳', TJ: '🇹🇯', TR: '🇹🇷', TM: '🇹🇲', MN: '🇲🇳', DE: '🇩🇪', FR: '🇫🇷' };

// HOT-003: скрываем техмусор из description (остатки init_db, стектрейсы и т.п.)
const TRASH_RE = /init_db|phone_formatter|json_merger|bin_iin|SQL|sqlite|traceback|\bError:|File "[^"]+\.py"|line \d+|^```|stderr|\.py\b|SELECT |INSERT |UPDATE |DELETE |CREATE TABLE/gi;
// Stage 9: combine the legacy tech-stack scrub with the new
// `sanitizeForDisplay` (QA markers / agent ids / currency-regression
// labels) so detail screens never surface developer strings.
const sanitizeDesc = (s) => {
  const stage1 = String(s || '').replace(TRASH_RE, ' ');
  const stage2 = sanitizeForDisplay(stage1);
  return stage2 || tGlobal('desc_not_specified');
};

export default function CargoDetail({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  container: { flex: 1 },
  // Brand bar moved to <BrandBarWithShare/> in stage 3D — local
  // brandBar/backHit/backIcon/brandRow/brandText/ftlPill/ftlText/shareBtn/
  // shareIcon styles were removed as part of stage 3E cleanup.
  pageTitle: { color: v1.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.2, marginVertical: 12 },
  priceLabelV1: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  priceValueV1: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2, color: '#FF8400', fontVariant: ['tabular-nums'] },
  // Legacy local styles still used by deal-block / bid cards / reviews
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  section: { borderRadius: 16, padding: 18, borderWidth: 1, marginBottom: 10 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  city: { fontSize: 15, fontWeight: '700' },
  line: { flex: 1, height: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '50%', marginBottom: 10 },
  gridLabel: { fontSize: 11 },
  gridValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  priceBlock: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#052E16', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#14532D', marginBottom: 16 },
  priceLabel: { color: '#4ADE80', fontSize: 11 },
  priceValue: { color: '#168A5B', fontSize: 28, fontWeight: '900' },
  beta: { color: '#57534E', fontSize: 11 },
  bidBtn: { backgroundColor: '#168A5B', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14 },
  bidBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  bidsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  // 27.07: было flexDirection:'row' → кнопки справа съедали ширину и имя/
  // сообщение схлопывались в вертикальный столбик по букве. Теперь колонка:
  // сверху [флаг+имя ... сумма], ниже — кнопки на всю ширину (сами переносятся).
  bidCard: { borderRadius: 10, padding: 12, borderWidth: 1, marginBottom: 8, flexDirection: 'column', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  bidLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  bidFlag: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bidName: { fontSize: 13, fontWeight: '600' },
  bidInfo: { color: '#FBBF24', fontSize: 11 },
  // Сумма ставки ВОДИТЕЛЯ на груз клиента — зелёная (роль источника цены),
  // не оранжевая: та же карточка показывает и цену груза владельца
  // (priceValueV1, оранжевая), совпадение цвета читалось как одна цена
  // (05.08.2026, п.16 ТЗ).
  bidAmt: { color: '#00C766', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  confirmBanner: { backgroundColor: '#168A5B20', borderWidth: 1, borderColor: '#168A5B', borderRadius: 12, padding: 14, marginBottom: 12, alignItems: 'center' },
  confirmText: { color: '#168A5B', fontSize: 14, fontWeight: '800' },
  photoWrap: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, marginBottom: 12, position: 'relative' },
  photo: { width: '100%', height: 200 },
  photoBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  photoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  // «Для перчаток и солнца»: крупные тап-цели (≥44pt) и читаемый текст.
  acceptBtn: { backgroundColor: '#168A5B', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rejectBtn: { backgroundColor: 'rgba(239,68,68,0.10)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, justifyContent: 'center', borderWidth: 0 },
  rejectBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
  miniBtn: { backgroundColor: 'rgba(148,163,184,0.14)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, justifyContent: 'center', borderWidth: 0 },
  miniBtnText: { fontSize: 14, fontWeight: '700' },
  paymentBlock: { borderRadius: 12, borderWidth: 1, padding: 14 },
  reviewBlock: { borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 10 },
  reviewTitle: { fontSize: 15, fontWeight: '700' },
  starsRow: { flexDirection: 'row', gap: 8 },
  reviewInput: { width: '100%', borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13 },
  reviewSubmitBtn: { backgroundColor: '#168A5B', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  reviewSubmitText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dealBlock: { borderWidth: 1, borderRadius: 14, padding: 16, alignItems: 'center', gap: 10 },
  myBidCard: { padding: 14, borderRadius: 10, borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  myBidHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  myBidLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  myBidAmount: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2, flexShrink: 1, fontVariant: ['tabular-nums'] },
  myBidStatus: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  myBidCounter: { fontSize: 14, fontWeight: '800', marginBottom: 12 },
  myBidBtnRow: { flexDirection: 'row', gap: 10 },
  myBidBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  myBidBtnText: { fontSize: 14, fontWeight: '800' },
  dealStatusLabel: { fontSize: 15, fontWeight: '700' },
  dealActionBtn: { backgroundColor: '#168A5B', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center', maxWidth: '100%', flexShrink: 1 },
  // Ghost-стиль (обводка) для акцентных действий сделки — вместо сплошной заливки.
  dealActionGhost: { backgroundColor: 'transparent', borderWidth: 1.6 },
  dealActionText: { color: '#fff', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  chatBtn: { backgroundColor: '#168A5B', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  chatBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Дизайн 2026 v3 (03.08): «Удалить груз» — редкое действие, не должно
  // «кричать» красным контуром. Text-only серый, красным только при нажатии.
  deleteMyBtn: { paddingVertical: 10, alignItems: 'center' },
  deleteMyBtnText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },

  }), [v1]);
  const { cargo: paramCargo, cargoId, role, dealId: routeDealId } = route.params || {};
  // Canonical cargo: never reach into raw fields directly. The pre-pilot
  // mixed shapes (server snake_case, FeedScreen camelCase, store.js demo)
  // all flow through normalizeCargo so renders never blow up on null.
  const cargo = normalizeCargo(paramCargo) || {};
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const { session } = useAuth();
  const myUserId = session?.user?.id;
  const [bidModal, setBidModal] = useState(false);
  const [bidModalMode, setBidModalMode] = useState('create');
  // Часть 1 (конфиденциальные ставки): число предложений (видно всем) и признак
  // владельца листинга (владелец видит все суммы; чужой — только свою + count).
  const [bidsCount, setBidsCount] = useState(0);
  const [isListingOwner, setIsListingOwner] = useState(false);
  // Конфиденциальный вид включается АВТОМАТИЧЕСКИ по ответу сервера: если бэк
  // (при BIDS_CONFIDENTIAL=true) урезал список не-владельцу — видимых ставок
  // меньше, чем count. При открытом режиме сервер шлёт полный список → false.
  const [bidsConfidential, setBidsConfidential] = useState(false);
  const [editingBid, setEditingBid] = useState(null);
  const [shareModal, setShareModal] = useState(false);
  const [bids, setBids] = useState([]);
  const [fullCargo, setFullCargo] = useState(null);
  // `c` collapses (server fetch || nav params) to one canonical shape so all
  // JSX paths read defensively. Closures (handlers, useEffect) reference `c`
  // freshly via the latest render, like any other derived value.
  const [accepting, setAccepting] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [chatRoomId, setChatRoomId] = useState(null);
  const [dealId, setDealId] = useState(routeDealId || null);
  const [dealStatus, setDealStatus] = useState(null);
  // Телефон контрагента — только после сделки (backend get_deal() гейтит
  // counterparty_phone участием в сделке, т.е. только post-accept), для
  // secondary-кнопки «Позвонить» (05.08.2026, п.6/17 ТЗ).
  const [counterpartyPhone, setCounterpartyPhone] = useState(null);
  const [shipperId, setShipperId] = useState(null);
  const [driverId, setDriverId] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSent, setReviewSent] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [acceptedDriverId, setAcceptedDriverId] = useState(null);
  // Live canonical cargo (server overrides params when available).
  // PR-C2 (P0-5 bid actions invisible): backend's GET /cargos/{id}
  // returns owner_id but no isMine flag (it doesn't know the caller).
  // normalizeCargo only forwards raw.isMine, which is `undefined` for
  // server-returned rows. The previous code therefore lost the owner-
  // side detection after the server fetch landed and the accept/reject/
  // counter/chat buttons (which gate on c.isMine) disappeared.
  // Recompute isMine from raw owner_id whenever it's available; fall
  // back to the navigation-param value so we don't regress the path
  // where the screen was opened with explicit isMine.
  const c = (() => {
    if (!fullCargo) return cargo;
    const normalized = normalizeCargo(fullCargo);
    const fromParam = cargo && cargo.isMine;
    const fromServer = myUserId && fullCargo.owner_id === myUserId;
    // owner_id нужен для прямого чата с грузовладельцем (кнопка внизу).
    // from_country/to_country — для гейта статуса сделки (см. isDomestic/
    // hasKnownRoute ниже): без них дом. и межд. маршруты неразличимы.
    return {
      ...normalized, owner_id: fullCargo.owner_id, isMine: fromParam || fromServer || normalized.isMine,
      from_country: fullCargo.from_country, to_country: fullCargo.to_country,
    };
  })();
  const cid = cargoId || c.id;
  // route.params.role is the authoritative side hint when CargoDetail is opened
  // from MyTripsScreen → Orders. The previous id-based comparison is unreliable
  // because session.user.id is a synthetic `u_<timestamp>` until AuthContext
  // refreshes it from /register/me, which races the deal-block render.
  const isDriverSide = role === 'driver'
    || (driverId && driverId === myUserId)
    || (acceptedDriverId && acceptedDriverId === myUserId);
  const isShipper = role === 'client' || role === 'shipper'
    || !!c.isMine
    || (shipperId && shipperId === myUserId);
  // Гейт статуса сделки (приказ владельца 03.08, зеркально MyTripsScreen):
  // домашний рейс не идёт через границу, международный не доставляется
  // минуя её, неизвестный маршрут не двигается дальше вообще — сервер это
  // уже блокирует 409-м, здесь просто не предлагаем действие, которое
  // всё равно будет отклонено.
  const hasKnownRoute = Boolean(c.from_country && c.to_country);
  if (!cid && !c.from) return null;

  const loadBids = () => {
    if (!cid) return;
    marketAPI.listBids({ cargoId: cid })
      .then(d => {
        const mapped = (d.bids || []).map(b => ({
          id: b.id, bidderId: b.bidder_id,
          name: b.bidder_name || b.bidder_phone || t('driver'),
          // Реальные данные оферента с бэка (list_bids обогащает) —
          // клиент видит рейтинг/верификацию, а не принимает вслепую.
          co: 'KZ',
          rating: b.bidder_rating || 0,
          reviews: b.bidder_reviews_count || 0,
          verified: !!b.bidder_verified,
          amount: b.amount,
          time: b.created_at?.slice(11, 16) || '•', message: b.message,
          status: b.status, isMine: b.bidder_id === myUserId,
          counterAmount: b.counter_amount,
          counterMessage: b.counter_message,
          counterBy: b.counter_by,
        }));
        setBids(mapped);
        // Часть 1: count/is_owner с бэка. count = все предложения (видно всем),
        // даже если чужие суммы не пришли (конфиденциальность на сервере).
        const count = typeof d.count === 'number' ? d.count : mapped.length;
        setBidsCount(count);
        setIsListingOwner(!!d.is_owner);
        // Явный сигнал сервера: прячет ли он чужие суммы (BIDS_CONFIDENTIAL).
        // Не полагаемся на длину списка — dirty-фильтр QA-ставок в открытом
        // режиме иначе выглядел бы как конфиденциальность.
        setBidsConfidential(!!d.confidential);
        // bid.status ЗАСТЫВАЕТ на 'accepted' навсегда с момента accept_bid —
        // он не двигается вместе с in_progress/at_border/delivered. Раньше
        // здесь стоял setDealStatus((prev) => prev || 'accepted') «пока
        // сделка не загрузилась» — но если фактический fetch сделки (см.
        // refreshDeal → getDeal) опаздывал или падал, экран застывал на
        // «Принят»/«Начать перевозку», хотя список уже показывал in_progress/
        // at_border. Единственный источник dealStatus — ответ getDeal/
        // myDashboard (см. applyDeal). bid.status здесь используется только
        // для определения ЛИЧНОСТИ водителя (acceptedDriverId), не статуса.
        const accepted = mapped.find(b => b.status === 'accepted');
        if (accepted) {
          setAcceptedDriverId(accepted.bidderId);
        }
      })
      .catch(() => {});
  };

  const sendCounter = (bid) => {
    setEditingBid(bid);
    setBidModalMode('counter');
    setBidModal(true);
  };

  const acceptCounter = async (bid) => {
    try {
      const r = await marketAPI.acceptCounterBid(bid.id);
      if (r.ok) {
        toast('✅ ' + t('counter_accepted'), 'success');
        if (r.chat_room_id) setChatRoomId(r.chat_room_id);
        if (r.deal_id) { setDealId(r.deal_id); setDealStatus('accepted'); }
        loadBids();
        // WhatsApp-упрощение (04.08.2026, п.9 ТЗ): согласовали цену — сразу
        // в чат сделки, а не «ищите сами кнопку внизу карточки».
        if (r.chat_room_id) navigation.navigate('Chat', { roomId: r.chat_room_id, dealId: r.deal_id, role });
      } else {
        toast(r.detail || t('accept_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
  };

  const declineCounter = async (bid) => {
    try {
      const r = await marketAPI.declineCounterBid(bid.id);
      if (r.ok) {
        toast('↩ ' + t('counter_declined'), 'success');
        loadBids();
      } else {
        toast(r.detail || t('reject_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
  };

  // Монотонный счётчик запросов сделки — защита от гонки: если более
  // старый (медленный) fetch отвечает ПОСЛЕ более нового, его результат
  // отбрасывается (приказ владельца 04.08 п.3). Каждый refreshDeal() берёт
  // новый номер; applyDeal() применяет ответ только если seq всё ещё
  // актуален на момент resolve.
  const dealFetchSeq = React.useRef(0);
  const applyDeal = (d, seq) => {
    if (!d || !d.id) return;
    if (seq != null && seq !== dealFetchSeq.current) return; // ответ устарел
    setDealId(d.id);
    // deal.status — ЕДИНСТВЕННЫЙ источник статуса после создания сделки
    // (приказ владельца 04.08 п.1). seq-guard выше отсекает большинство
    // гонок, но добавляем вторую независимую страховку через общий
    // pickDealStatus (utils/dealStatusOrder.js, 05.08 п.6): статус не
    // откатывается назад, а completed/delivered — не «отменяются задним
    // числом» устаревшим cancelled.
    setDealStatus((prev) => pickDealStatus(prev, d.status || 'accepted'));
    if (d.chat_room_id) setChatRoomId(d.chat_room_id);
    if (d.counterparty_phone) setCounterpartyPhone(d.counterparty_phone);
    if (d.shipper_id) setShipperId(d.shipper_id);
    if (d.driver_id) {
      setDriverId(d.driver_id);
      if (!acceptedDriverId) setAcceptedDriverId(d.driver_id);
    }
  };

  // Синхронизация статуса сделки. Раньше грузилось ТОЛЬКО на mount — если
  // вторая сторона (водитель) двигала статус, у клиента карточка застывала на
  // «Принят», пока не перезайдёшь. Теперь: перечитываем при каждом фокусе
  // экрана + лёгкий поллинг раз в 15с, пока экран открыт (как в чате/сделках).
  const refreshDeal = useCallback(() => {
    if (!cid) return;
    marketAPI.getCargo(cid).then(d => { if (d && d.id) setFullCargo(d); }).catch(() => {});
    loadBids();
    const seq = ++dealFetchSeq.current;
    // dealId (state) авторитетнее routeDealId — тот навсегда фиксирован
    // параметрами навигации, а dealId уже содержит реальный id, если
    // сделка создана прямо в этой сессии (owner принял ставку без
    // изначального dealId в route.params).
    const dealIdToFetch = dealId || routeDealId;
    if (dealIdToFetch) {
      marketAPI.getDeal(dealIdToFetch).then(d => { if (d && d.ok !== false) applyDeal(d, seq); }).catch(() => {});
    } else {
      marketAPI.myDashboard().then(d => {
        const found = (d?.my_deals || []).find(x => x.cargo_id === cid);
        if (found) applyDeal(found, seq);
      }).catch(() => {});
    }
  }, [cid, routeDealId, dealId]);

  useFocusEffect(useCallback(() => {
    refreshDeal();
    const iv = setInterval(refreshDeal, 15000);
    return () => clearInterval(iv);
  }, [refreshDeal]));

  const onDeleteCargo = () => {
    const doDel = async () => {
      if (c._server) {
        await marketAPI.deleteCargo(c.id).catch(() => {});
      } else if (c.id) {
        removeCargo(c.id);
      }
      toast('🗑 ' + t('cargo_deleted'), 'info');
      navigation.goBack();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(t('delete_cargo_q'))) doDel();
    } else {
      Alert.alert(t('delete_cargo_q'), '', [{ text: t('cancel') }, { text: t('delete'), style: 'destructive', onPress: doDel }]);
    }
  };

  // changeDealStatus удалён (05.08.2026): кнопки статуса переехали в
  // ChatScreen (единственное место действия на deal.status, см. п.9/13 ТЗ).
  // Эта страница только показывает текущий статус текстом (см. ниже).

  const handleBid = () => {
    // Ставка отправлена через BidModal → перезагружаем список с сервера
    loadBids();
  };

  const view = cargoDisplay(c, t);
  // Если по грузу есть ПРИНЯТАЯ ставка — в блоке цены показываем СУММУ СДЕЛКИ,
  // а не цену объявления. Раньше заголовок висел «$12 000» (листинг), хотя
  // сделка принята за $12 100 — на одном экране две разные цены путали.
  const acceptedBid = bids.find(b => b.status === 'accepted');
  // Моя активная (pending/countered) ставка на чужой груз — используется
  // для плашки «Моя ставка $X · Ожидает ответа», симметрично TripDetail.
  const myPendingBid = bids.find(b => b.isMine && (b.status === 'pending' || b.status === 'countered'));
  const priceDisplay = acceptedBid ? formatPrice(acceptedBid.amount, c.currency) : view.price;
  const myBidStatusLabel = React.useMemo(() => {
    if (!myPendingBid) return '';
    switch (myPendingBid.status) {
      case 'countered': return t('my_bid_status_countered') || 'Клиент предложил встречную цену';
      case 'pending':
      default:          return t('my_bid_status_pending')   || 'Ожидает ответа клиента';
    }
  }, [myPendingBid, t]);
  const safePhotos = (c.photos || []).filter(p => typeof p === 'string' && !p.startsWith('data:') && p.length < 1000);
  const dash = t('not_specified');

  // v1 brand accent: карточка груза — объект грузоотправителя, поэтому акцент
  // всегда клиентский (оранжевый) для всех зрителей. Раньше владелец-клиент,
  // открывая свой груз, видел зелёный driver-акцент (решение владельца
  // 2026-06-13: клиент везде оранжевый).
  const isDriverViewing = role === 'driver' || (driverId && driverId === myUserId);
  const v1Accent = v1AccentFor('client');
  // Кнопки сделки (чат/подтвердить/старт) — действия текущего зрителя, поэтому
  // акцент роль-семантический: client → жёлтый #FF8400, driver → неон #168A5B.
  // Раньше был хардкод #168A5B (зелёный) на всех поверхностях, в т.ч. клиентских.
  const dealAccent = v1AccentFor(isDriverSide ? 'driver' : 'client');
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandBarWithShare
        onBack={() => navigation.goBack()}
        onShare={() => setShareModal(true)}
        accent={v1Accent.main}
        rightTestID="cargo-share-btn"
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 60 + insets.bottom }}>
        {/* Stage 17: dropped the leading 📦 — Stage 16 quiet visual
            language already removed the bright route emoji from
            feed cards; the detail title should match. */}
        <Text style={s.pageTitle} numberOfLines={1}>{localizePlace(view.from, lang)} → {localizePlace(view.to, lang)}</Text>

        {safePhotos.length > 0 ? (
          <View style={{ marginBottom: 10, borderRadius: v1Radius.card, overflow: 'hidden' }}>
            <PhotoGallery photos={safePhotos} />
          </View>
        ) : null}

        <GlassCard>
          <SectionTitle featherIcon="map" label={t('trip_route')} />
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: '#EF4444' }]} /><Text style={[s.city, { color: v1.text }]}>{localizePlace(view.from, lang)}</Text>
            <View style={[s.line, { backgroundColor: v1.border }]} /><Feather name="truck" size={16} color={v1.textMuted} /><View style={[s.line, { backgroundColor: v1.border }]} />
            <Text style={[s.city, { color: v1.text }]}>{localizePlace(view.to, lang)}</Text><View style={[s.dot, { backgroundColor: '#168A5B' }]} />
          </View>
          <View style={s.grid}>
            {(() => {
              const stats = routeStats(c.from, c.to);
              const desc = sanitizeDesc(c.cargoDesc);
              const items = [];
              items.push([t('cargoDesc'), desc || dash]);
              // Stage 17: previously a single mushy cell labelled
              // "Вес/Объём" with a "X т · Y м³" string. Split into
              // two grid items so weight and volume each get their
              // own slot and a missing one doesn't read as missing
              // both. Matches TripDetail's transport block.
              items.push([t('weight'), view.weight]);
              items.push([t('volume'), view.volume]);
              items.push([t('truckType'), view.cargoType]);
              items.push([t('pickupDate'), c.pickupDate ? formatDateForDisplay(c.pickupDate) : dash]);
              if (stats) {
                items.push([t('distance'), stats.km + ' км']);
                items.push([t('delivery_time'), '~' + stats.days + ' дн.']);
              }
              return items.map(([l, v]) => (
                <View key={l} style={s.gridItem}><Text style={[s.gridLabel, { color: v1.textMuted }]}>{l}</Text><Text style={[s.gridValue, { color: v1.text }]}>{v}</Text></View>
              ));
            })()}
          </View>
        </GlassCard>

        {/* Дизайн v6 (04.08): компакт-строка цены — label слева, сумма справа
            в одну линию. Без accent-рамки (была огромная оранжевая рамка). */}
        <GlassCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <Feather name="dollar-sign" size={12} color={theme.textMuted} />
              <Text testID="cargo-price-label" style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>{acceptedBid ? t('deal_price') : t('price')}</Text>
            </View>
            <Text testID="cargo-price-value" style={{ color: '#FF8400', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'], flexShrink: 1, minWidth: 0, textAlign: 'right' }} numberOfLines={1} ellipsizeMode="tail">{priceDisplay}</Text>
          </View>
        </GlassCard>

        {/* Карточка грузоотправителя — водитель видит, кому ставит ставку
            (имя, верификация, рейтинг), а не ставит вслепую. */}
        {!c.isMine && fullCargo?.owner_id ? (() => {
          // Приказ владельца 03.08: не выдавать нейтральную роль за
          // подтверждённую личность. owner_name с бэка иногда — не имя, а
          // техническая заглушка (хвост телефона «+2244» или generic-строка),
          // когда профиль не заполнен. В этом случае показываем нейтральное
          // «Грузоотправитель», а не псевдо-имя.
          const rawName = fullCargo.owner_name || '';
          const hasRealName = rawName && !rawName.startsWith('+') && rawName !== 'Пользователь UrTruck';
          return (
            <GlassCard>
              <SectionTitle featherIcon="user" label={t('shipper_label')} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                  {hasRealName ? rawName : t('shipper_label')}
                  {!hasRealName && fullCargo.owner_verified ? ` · ${t('verified_short')}` : ''}
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>
                  {hasRealName ? (
                    <>
                      {fullCargo.owner_verified ? '✅ ' + t('verified_short') + ' · ' : ''}
                      {fullCargo.owner_reviews_count > 0
                        ? `⭐ ${Number(fullCargo.owner_rating).toFixed(1)} (${fullCargo.owner_reviews_count})`
                        : t('no_reviews_yet')}
                    </>
                  ) : (
                    fullCargo.owner_reviews_count > 0
                      ? `${t('rating_label')} ${Number(fullCargo.owner_rating).toFixed(1)}`
                      : t('profile_incomplete')
                  )}
                </Text>
              </View>
            </GlassCard>
          );
        })() : null}

        {/* Часть 1: показываем ЧИСЛО предложений (видно всем), не длину
            урезанного списка. */}
        <Text style={[s.bidsTitle, { color: theme.text }]} testID="cargo-bids-count">{formatBids(bidsCount)}</Text>
        {/* Конфиденциальный вид (модель InDriver) — ТОЛЬКО когда сервер реально
            урезал список (BIDS_CONFIDENTIAL=true). При открытом режиме подсказки
            нет, ниже рендерится полный список ставок как раньше. */}
        {bidsConfidential && bidsCount > 0 && (
          <Text style={{ color: theme.textMuted, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 8, fontSize: 12 }} testID="cargo-bids-confidential">
            {t('bids_confidential_hint')}
          </Text>
        )}
        {bidsCount === 0 && (
          <Text style={{ color: theme.textMuted, textAlign: 'center', padding: 20, fontSize: 13 }}>
            {t('no_bids_be_first')}
          </Text>
        )}
          {bids.filter(b => {
          if (b.isMine && (b.status === 'pending' || b.status === 'countered') && isDriverViewing && !dealStatus) return false;
          return true;
        }).map(b => {
          const hasAccepted = bids.some(x => x.status === 'accepted');
          const isCancelled = b.status === 'cancelled';
          const isCountered = b.status === 'countered';
          const isActive = b.status === 'pending' || isCountered;
          return (
            <View key={b.id} style={[s.bidCard, {
              backgroundColor: theme.card,
              borderColor: b.status === 'accepted' ? '#168A5B'
                : b.status === 'rejected' ? '#EF444440'
                : isCancelled ? '#78716C40'
                : isCountered ? '#E06D00' /* purple — counter active */
                : b.isMine ? '#168A5B60' : theme.border,
              borderWidth: b.status === 'accepted' || isCountered || b.isMine ? 2 : 1,
              opacity: (b.status === 'rejected' || isCancelled) ? 0.55 : 1,
            }]}>
              <View style={s.bidLeft}>
                <View style={[s.bidFlag, { backgroundColor: b.status === 'accepted' ? '#168A5B' : b.isMine ? '#168A5B' : theme.border }]}>
                  <Text style={{ fontSize: 14 }}>{b.isMine ? '🫵' : b.status === 'accepted' ? '✅' : isCountered ? '🔁' : (FLAGS[b.co] || '🏳️')}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity
                    disabled={b.isMine || !b.bidderId}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('DriverDetail', {
                      driver: { id: b.bidderId, name: b.name, rating: b.rating, reviews: b.reviews, verified: b.verified, _server: true, _isDriver: true },
                      role,
                    })}
                  >
                    <Text style={[s.bidName, { color: theme.text }]}>{b.name}{b.isMine ? ' ' + t('you_marker') : (b.bidderId ? ' ›' : '')}</Text>
                  </TouchableOpacity>
                  {!b.isMine ? (
                    <Text style={{ fontSize: 11, marginTop: 2, color: theme.textMuted }}>
                      {b.verified ? '✅ ' + t('verified_short') + ' · ' : ''}
                      {b.reviews > 0 ? `⭐ ${Number(b.rating).toFixed(1)} (${b.reviews})` : t('no_reviews_yet')}
                    </Text>
                  ) : null}
                  {b.message ? <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{b.message}</Text> : null}
                  <Text style={[s.bidInfo, {
                    color: b.status === 'accepted' ? '#168A5B'
                      : b.status === 'rejected' ? '#EF4444'
                      : isCancelled ? '#78716C'
                      : isCountered ? '#E06D00'
                      : '#FBBF24',
                  }]}>
                    {b.status === 'accepted' ? '✅ ' + t('driver_chosen')
                      : b.status === 'rejected' ? '❌ ' + t('bid_rejected')
                      : isCancelled ? '⊘ ' + t('bid_cancelled')
                      : isCountered ? '🔁 ' + (c.isMine ? t('counter_sent_status') : t('bid_countered'))
                      : b.time}
                  </Text>
                  {isCountered && b.counterAmount ? (
                    <Text style={{ color: '#E06D00', fontSize: 11, marginTop: 2, fontWeight: '700' }}>
                      {t('counter_amount')}: {formatPrice(b.counterAmount, c.currency || 'USD', t)}{b.counterMessage ? ` · ${b.counterMessage}` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.bidAmt}>{formatPrice(b.amount, c.currency || 'USD', t)}</Text>

                {/* Дизайн-система 2026 (приказ владельца 02.08):
                    Одна главная кнопка (56px, role-accent) + пара вторичных
                    (48px) + деструктив (48px, контур). Иерархия: Принять →
                    Чат/Торг → Отклонить. Заменяет предыдущую «стену из 4
                    одинаковых кнопок». Savings-badge показывает выгоду цены.
                    После accept — success-state (semantic green #168A5B,
                    отличный от driver-акцента). */}
                {/* Дизайн 2026 v3 (приказ владельца 03.08, скриншоты): до
                    создания сделки — никакого чата. Иерархия — одна большая
                    «Принять», вторичная «Предложить свою цену», текстовый
                    «Отклонить». */}
                {c.isMine && b.status === 'pending' && !hasAccepted && (
                  <View style={{ marginTop: 10, gap: 6, alignSelf: 'stretch' }}>
                    <PriceSavingsBadge listingPrice={c.price} bidPrice={b.amount} currency={c.currency || 'USD'} />
                    <PrimaryCTA
                      testID="bid-accept"
                      role="client"
                      icon="✓"
                      label={`${t('accept_bid_btn')} ${formatPrice(b.amount, c.currency || 'USD', t)}`}
                      numberOfLines={2}
                      loading={accepting === b.id}
                      disabled={!!accepting || !!rejecting}
                      success={dealStatus === 'accepted' && dealId != null}
                      onPress={async () => {
                        const sum = formatPrice(b.amount, c.currency);
                        const msg = t('accept_bid_confirm').replace('{sum}', sum);
                        const ok = Platform.OS === 'web'
                          ? (typeof window !== 'undefined' && window.confirm(msg))
                          : await new Promise((res) => Alert.alert(
                              t('accept_bid_confirm_title'), msg,
                              [
                                { text: t('cancel'), style: 'cancel', onPress: () => res(false) },
                                { text: t('accept_bid_btn'), onPress: () => res(true) },
                              ],
                            ));
                        if (!ok) return;
                        setAccepting(b.id);
                        try {
                          const r = await marketAPI.acceptBid(b.id);
                          if (r.ok) {
                            toast('✓ ' + t('driver_chosen'), 'success');
                            if (r.chat_room_id) setChatRoomId(r.chat_room_id);
                            if (r.deal_id) { setDealId(r.deal_id); setDealStatus('accepted'); }
                            loadBids();
                            // WhatsApp-упрощение (04.08.2026, п.9 ТЗ): сразу в чат сделки.
                            if (r.chat_room_id) navigation.navigate('Chat', { roomId: r.chat_room_id, dealId: r.deal_id, role });
                          } else {
                            toast(r.detail || t('accept_failed'), 'error');
                          }
                        } catch {
                          toast(t('no_connection'), 'error');
                        }
                        setAccepting(null);
                      }}
                    />
                    <SecondaryButton
                      testID="bid-counter"
                      role="client"
                      icon="🔁"
                      label={t('counter_offer')}
                      disabled={!!accepting || !!rejecting}
                      onPress={() => sendCounter(b)}
                    />
                    <TouchableOpacity
                      testID="bid-reject"
                      onPress={async () => {
                        setRejecting(b.id);
                        try {
                          const r = await marketAPI.rejectBid(b.id);
                          if (r.ok) {
                            toast('❌ ' + t('bid_rejected_toast'), 'success');
                            loadBids();
                          } else {
                            toast(r.detail || t('reject_failed'), 'error');
                          }
                        } catch {
                          toast(t('no_connection'), 'error');
                        }
                        setRejecting(null);
                      }}
                      disabled={!!accepting || !!rejecting}
                      style={{ alignSelf: 'center', maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 10 }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700', opacity: (accepting || rejecting) ? 0.55 : 1, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">
                        {rejecting === b.id ? '…' : t('reject_btn')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Клиент + countered: те же 2 кнопки. «Принять $X» под капотом
                    отменяет свою встречку и принимает оригинал водителя одним
                    нажатием (см. cancelOwnCounter → acceptBid). Требование
                    владельца: две кнопки во всех состояниях, без «отменить
                    встречную». */}
                {c.isMine && isCountered && (
                  <View style={{ marginTop: 10, gap: 6, alignSelf: 'stretch' }}>
                      <PrimaryCTA
                        testID="bid-accept"
                        role="client"
                        icon="✓"
                        label={`${t('accept_bid_btn')} ${formatPrice(b.amount, c.currency || 'USD', t)}`}
                        numberOfLines={2}
                        loading={accepting === b.id}
                        disabled={!!accepting || !!rejecting}
                        onPress={async () => {
                          // Confirm сначала — под капотом два вызова, дороже отменить нельзя.
                          const sum = formatPrice(b.amount, c.currency);
                          const msg = t('accept_bid_confirm').replace('{sum}', sum);
                          const ok = Platform.OS === 'web'
                            ? (typeof window !== 'undefined' && window.confirm(msg))
                            : await new Promise((res) => Alert.alert(
                                t('accept_bid_confirm_title'), msg,
                                [
                                  { text: t('cancel'), style: 'cancel', onPress: () => res(false) },
                                  { text: t('accept_bid_btn'), onPress: () => res(true) },
                                ],
                              ));
                          if (!ok) return;
                          setAccepting(b.id);
                          try {
                            // Шаг 1: отменяем свою встречку (ставка → pending).
                            const c1 = await marketAPI.cancelOwnCounter(b.id);
                            if (!c1.ok) { toast(c1.detail || t('accept_failed'), 'error'); setAccepting(null); return; }
                            // Шаг 2: принимаем оригинальную сумму водителя.
                            const r = await marketAPI.acceptBid(b.id);
                            if (r.ok) {
                              toast('✓ ' + t('driver_chosen'), 'success');
                              if (r.chat_room_id) setChatRoomId(r.chat_room_id);
                              if (r.deal_id) { setDealId(r.deal_id); setDealStatus('accepted'); }
                              loadBids();
                              // WhatsApp-упрощение (04.08.2026, п.9 ТЗ): сразу в чат сделки.
                              if (r.chat_room_id) navigation.navigate('Chat', { roomId: r.chat_room_id, dealId: r.deal_id, role });
                            } else {
                              toast(r.detail || t('accept_failed'), 'error');
                            }
                          } catch { toast(t('no_connection'), 'error'); }
                          setAccepting(null);
                        }}
                      />
                      <TouchableOpacity
                        testID="bid-reject"
                        onPress={async () => {
                          setRejecting(b.id);
                          try {
                            const r = await marketAPI.rejectBid(b.id);
                            if (r.ok) { toast('❌ ' + t('bid_rejected_toast'), 'success'); loadBids(); }
                            else toast(r.detail || t('reject_failed'), 'error');
                          } catch { toast(t('no_connection'), 'error'); }
                          setRejecting(null);
                        }}
                        disabled={!!rejecting || !!accepting}
                        style={{ alignSelf: 'center', maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 10 }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700', opacity: (accepting || rejecting) ? 0.55 : 1, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">
                          {rejecting === b.id ? '…' : t('reject_btn')}
                        </Text>
                      </TouchableOpacity>
                  </View>
                )}

                {/* Водитель + countered: primary = «Принять контр $X» (driver
                    green), Destructive Decline. Чат — только после сделки. */}
                {b.isMine && !c.isMine && isCountered && (
                  <View style={{ marginTop: 10, gap: 8, alignSelf: 'stretch' }}>
                    <PrimaryCTA
                      testID="bid-accept-counter"
                      role="driver"
                      icon="✓"
                      label={`${t('accept_counter')} ${formatPrice(b.counterAmount, c.currency || 'USD', t)}`}
                      numberOfLines={2}
                      onPress={() => acceptCounter(b)}
                    />
                    <DestructiveButton
                      testID="bid-decline-counter"
                      icon="↩"
                      label={t('decline_counter')}
                      onPress={() => declineCounter(b)}
                    />
                  </View>
                )}

                {/* Водитель + своя ставка pending: primary НЕТ (ждём хода
                    клиента), только Edit + Chat + Destructive Cancel. */}
                {b.isMine && !c.isMine && b.status === 'pending' && !hasAccepted && (
                  <View style={{ marginTop: 10, gap: 8, alignSelf: 'stretch' }}>
                    <SecondaryButton
                      testID="bid-edit"
                      role="driver"
                      icon="✏️"
                      label={t('edit_bid')}
                      onPress={() => {
                        setEditingBid(b);
                        setBidModalMode('edit');
                        setBidModal(true);
                      }}
                      disabled={!!cancelling}
                    />
                    <DestructiveButton
                      testID="bid-cancel"
                      icon="⊘"
                      label={t('cancel_bid')}
                      loading={cancelling === b.id}
                      disabled={!!cancelling}
                      onPress={async () => {
                        const ok = Platform.OS === 'web'
                          ? (typeof window !== 'undefined' && window.confirm(t('cancel_bid_confirm')))
                          : await new Promise((res) => Alert.alert(
                              t('cancel_bid_confirm'), '',
                              [
                                { text: t('cancel'), style: 'cancel', onPress: () => res(false) },
                                { text: t('cancel_bid'), style: 'destructive', onPress: () => res(true) },
                              ],
                            ));
                        if (!ok) return;
                        setCancelling(b.id);
                        try {
                          const r = await marketAPI.cancelBid(b.id);
                          if (r.ok) {
                            toast('⊘ ' + t('bid_cancelled_toast'), 'success');
                            loadBids();
                          } else {
                            toast(r.detail || t('cancel_failed'), 'error');
                          }
                        } catch {
                          toast(t('no_connection'), 'error');
                        }
                        setCancelling(null);
                      }}
                    />
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      {/* Плашка «Моя ставка» (водитель уже сделал ставку на этот груз, но
          сделки ещё нет). По жалобе владельца 28.07: клиент отправил ставку —
          и никакой обратной связи. Показывает сумму, статус (ожидает/встречка)
          и кнопки [Изменить] [Чат]. Симметрично TripDetail. */}
      {myPendingBid && isDriverViewing && !dealStatus ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          {/* Карточка своей ставки видна только водителю (isDriverViewing) —
              значит и цена, и рамка красятся его цветом (dealAccent), а не
              жёстко клиентским v1Accent, как было раньше: две разные по
              смыслу цены (груз владельца — оранжевым, ставка водителя —
              тоже оранжевым) читались как одна (05.08.2026, п.16 ТЗ). */}
          <View style={[s.myBidCard, { borderColor: dealAccent.main, backgroundColor: theme.card }]} testID="cargo-my-active-bid">
            <View style={s.myBidHeader}>
              <Text style={[s.myBidLabel, { color: theme.textMuted }]}>{t('my_bid_label') || 'Моя ставка'}</Text>
              <Text style={[s.myBidAmount, { color: dealAccent.main }]}>{formatPrice(myPendingBid.amount, c.currency)}</Text>
            </View>
            <Text style={[s.myBidStatus, { color: theme.text }]}>{myBidStatusLabel}</Text>
            {myPendingBid.status === 'countered' && myPendingBid.counterAmount ? (
              <>
                {/* Водитель + пришёл контр-оффер от клиента: primary =
                    «Принять контр $X» (driver green), Secondary Chat,
                    Destructive Decline. Иерархия дизайн-системы 2026. */}
                <Text style={[s.myBidCounter, { color: '#E06D00' }]} testID="cargo-counter-amount">
                  🔁 {t('counter_amount')}: {formatPrice(myPendingBid.counterAmount, c.currency, t)}
                  {myPendingBid.counterMessage ? ` · ${myPendingBid.counterMessage}` : ''}
                </Text>
                <View style={{ marginTop: 8, gap: 8 }}>
                  <PrimaryCTA
                    testID="cargo-counter-accept"
                    role="driver"
                    icon="✓"
                    label={`${t('accept_counter')} ${formatPrice(myPendingBid.counterAmount, c.currency, t)}`}
                    numberOfLines={2}
                    onPress={() => acceptCounter(myPendingBid)}
                  />
                  <DestructiveButton
                    testID="cargo-counter-decline"
                    icon="↩"
                    label={t('decline_counter')}
                    onPress={() => declineCounter(myPendingBid)}
                  />
                </View>
              </>
            ) : (
              <View style={{ marginTop: 8, gap: 4 }}>
                {/* Водитель + своя ставка pending: primary НЕТ (ждём хода
                    клиента). Чат — только после сделки. Секция 15 ТЗ
                    (05.08.2026): убраны декоративные emoji-иконки
                    (карандаш/запрет), «Отозвать ставку» — мелкая красная
                    текстовая ссылка, а не большая деструктивная кнопка —
                    отзыв ставки не должен визуально спорить с реальными
                    действиями (Изменить/принять контрпредложение). */}
                <SecondaryButton
                  testID="cargo-my-bid-edit"
                  role="driver"
                  label={t('edit_bid') || 'Изменить'}
                  onPress={() => { setEditingBid(myPendingBid); setBidModalMode('edit'); setBidModal(true); }}
                  disabled={cancelling === myPendingBid.id}
                />
                <TouchableOpacity
                  testID="cargo-my-bid-cancel"
                  disabled={cancelling === myPendingBid.id}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ alignSelf: 'center', marginTop: 6, opacity: cancelling === myPendingBid.id ? 0.5 : 1 }}
                  onPress={async () => {
                    const ok = Platform.OS === 'web'
                      ? (typeof window !== 'undefined' && window.confirm(t('cancel_bid_confirm')))
                      : await new Promise((res) => Alert.alert(
                          t('cancel_bid_confirm'), '',
                          [
                            { text: t('cancel'), style: 'cancel', onPress: () => res(false) },
                            { text: t('cancel_bid'), style: 'destructive', onPress: () => res(true) },
                          ],
                        ));
                    if (!ok) return;
                    setCancelling(myPendingBid.id);
                    try {
                      const r = await marketAPI.cancelBid(myPendingBid.id);
                      if (r.ok) { toast(t('bid_cancelled_toast'), 'success'); loadBids(); }
                      else toast(r.detail || t('cancel_failed'), 'error');
                    } catch { toast(t('no_connection'), 'error'); }
                    setCancelling(null);
                  }}
                >
                  <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>
                    {cancelling === myPendingBid.id ? '…' : t('withdraw_bid_link')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      ) : null}
      {dealStatus && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[s.dealBlock, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {/* Компактный статус вместо горизонтальной шкалы Принят/В работе/
                На границе/Завершён (05.08.2026, п.9 ТЗ). Кнопки действия
                («Начать»/«На границе»/«Доставлен»/«Подтвердить получение»/
                «Отменить») переехали в разговор (ChatScreen) — единственное
                место действия на статус сделки, без дублей между экранами. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' }}>
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>{t('trip_current_status')}</Text>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{formatStatus(userFacingDealStatus(dealStatus))}</Text>
            </View>
            {(dealStatus === 'accepted' || dealStatus === 'in_progress' || dealStatus === 'at_border') && (
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>
                {dealStatus === 'in_progress' && !hasKnownRoute ? t('clarify_route') : (
                  <>
                    {t('order_next_step')}: {
                      isDriverSide
                        ? (dealStatus === 'accepted' ? t('driver_next_step_accepted')
                           : dealStatus === 'in_progress' ? t('driver_next_step_in_progress')
                           : t('driver_next_step_at_border'))
                        : (dealStatus === 'accepted' ? t('shipper_next_step_accepted')
                           : t('shipper_next_step_in_progress'))
                    }
                  </>
                )}
              </Text>
            )}
            {chatRoomId && (
              <View style={{ marginTop: 10, gap: 8 }}>
                {/* «Написать сообщение» — главное действие по сделке
                    (05.08.2026, п.5/17 ТЗ): большая ролевая кнопка вместо
                    мелкой ссылки «Чат по заказу». Звонок — secondary,
                    видна только когда backend уже отдал counterparty_phone
                    (гейт по участию в сделке = только post-accept). */}
                <PrimaryCTA
                  testID="deal-order-chat"
                  role={isDriverSide ? 'driver' : 'client'}
                  icon="💬"
                  label={t('write_message')}
                  onPress={() => navigation.navigate('Chat', { roomId: chatRoomId, role })}
                  style={{ height: 54 }}
                />
                {counterpartyPhone ? (
                  <SecondaryButton
                    testID="deal-order-call"
                    role={isDriverSide ? 'driver' : 'client'}
                    icon="📞"
                    label={t('call_partner')}
                    onPress={() => openContactPartner(counterpartyPhone, t)}
                  />
                ) : null}
              </View>
            )}
          </View>
        </View>
      )}
      {dealStatus === 'delivered' && !reviewSent && (isShipper ? acceptedDriverId : shipperId) && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[s.reviewBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.reviewTitle, { color: theme.text }]}>{isShipper ? t('rate_driver') : t('rate_shipper')}</Text>
            <View style={s.starsRow}>
              {[1,2,3,4,5].map(n => (
                <TouchableOpacity key={n} onPress={() => setReviewRating(n)}>
                  <Text style={{ fontSize: 28 }}>{n <= reviewRating ? '★' : '☆'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[s.reviewInput, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
              value={reviewText}
              onChangeText={setReviewText}
              placeholder={t('comment_optional')}
              placeholderTextColor={theme.textMuted}
              maxLength={200}
            />
            <TouchableOpacity
              style={[s.reviewSubmitBtn, reviewRating === 0 && { opacity: 0.4 }]}
              disabled={reviewRating === 0 || reviewLoading}
              onPress={async () => {
                setReviewLoading(true);
                try {
                  await reviewsAPI.create({
                    targetId: isShipper ? acceptedDriverId : shipperId,
                    // Backend reviews API accepts only 'driver' | 'client' (Pydantic pattern).
                    // Driver leaves review on the cargo owner — that's role 'client' on the server.
                    targetRole: isShipper ? 'driver' : 'client',
                    rating: reviewRating,
                    text: reviewText.trim() || null,
                  });
                  setReviewSent(true);
                  toast(t('thanks_for_review'), 'success');
                } catch {
                  toast(t('review_failed'), 'error');
                }
                setReviewLoading(false);
              }}
            >
              <Text style={s.reviewSubmitText}>{reviewLoading ? '...' : t('submit_rating')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {dealStatus === 'delivered' && reviewSent && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center' }}>
          <Text style={{ color: '#168A5B', fontSize: 14, fontWeight: '600' }}>{t('thanks_for_review')}</Text>
        </View>
      )}
      {/* Legacy "Open chat with driver" button removed: deal-block above
          already renders the single "Написать сообщение" CTA for both sides
          to avoid duplicate buttons. */}
      {c.isMine && !chatRoomId && (
        <View style={{ padding: 16, paddingTop: 0 }}>
          <TouchableOpacity style={s.deleteMyBtn} onPress={onDeleteCargo}>
            <Text style={s.deleteMyBtnText}>🗑 {t('delete_cargo')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Sticky CTA — только «Предложить цену». Свободный чат до сделки убран
          (решение владельца 03.08): переговоры ведутся через ставку/контрпредложение,
          чат создаётся автоматически после accept. */}
      {!c.isMine && !dealStatus && !myPendingBid ? (
        <StickyCTABar
          accent={v1Accent.main}
          primary={{
            label: t('suggestPrice'),
            onPress: async () => {
              const ok = await requireLevel(LEVELS.PHONE, 'bid');
              if (ok) setBidModal(true);
            },
            testID: 'cargo-sticky-bid',
          }}
        />
      ) : null}
      <BidModal
        visible={bidModal}
        onClose={() => { setBidModal(false); setBidModalMode('create'); setEditingBid(null); }}
        onSubmit={handleBid}
        mode={bidModalMode}
        currentPrice={c.price}
        currency={c.currency}
        cargoId={c.id}
        bidId={editingBid?.id}
        initialAmount={editingBid?.amount}
        initialMessage={editingBid?.message}
        // counter-режим открывает владелец-клиент → оранжевый акцент;
        // create/edit (водитель ставит) — зелёный по умолчанию.
        accent={bidModalMode === 'counter' ? v1Accent.main : '#168A5B'}
        onAccent={bidModalMode === 'counter' ? v1Accent.onAccent : '#fff'}
      />
      <ShareModal
        visible={shareModal}
        onClose={() => setShareModal(false)}
        shareText={buildCargoShareText(c, `${WEB_URL || 'https://urtruck.kz'}/cargo/${c.id}`)}
        url={`${WEB_URL || 'https://urtruck.kz'}/cargo/${c.id}`}
      />
      {Gate}
    </SafeAreaView>
  );
}

