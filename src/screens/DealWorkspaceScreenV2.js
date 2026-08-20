import React from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import * as ImagePicker from 'expo-image-picker';

import TruckMap from '../components/TruckMap';
import DealAttachments from '../components/deal/DealAttachments';
import DealStatusTimeline from '../components/deal/DealStatusTimeline';
import AppConfirmModal from '../components/ui/AppConfirmModal';
import { chatAPI } from '../utils/chatAPI';
import { marketAPI } from '../utils/marketAPI';
import { parseRouteCities } from '../utils/geo';
import { localizeCargoName, localizePlace, localizeSystemMessage } from '../utils/places';
import { getLanguage, formatStatus, formatTruckType } from '../utils/i18n';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/Toast';
import { useV1Colors } from '../theme/designV1';
import { formatPrice } from '../utils/normalizers';
import { pickDealStatus, userFacingDealStatus } from '../utils/dealStatusOrder';
import { getAvailableDealActions } from '../utils/dealActionResolver';
import { ensureBackgroundLocationPermission, getCurrentLocationPayload } from '../utils/backgroundLocation';
import { compressImage } from '../utils/imageCompress';
import { voice } from '../utils/voiceRecorder';
import { enqueueOutbox } from '../utils/outbox';
import { setActiveRoom } from '../utils/activeRoom';
import { notifyChatRead } from '../utils/unreadEvents';
import { refreshAppIconBadge } from '../utils/appBadge';
import { SERVER_URL } from '../config/env';

const LIVE_TRACKING_STATUSES = ['in_progress', 'at_border'];
const MAP_WORK_STATUSES = ['accepted', 'in_progress', 'at_border'];
const TERMINAL_STATUSES = ['completed', 'cancelled', 'rejected', 'expired'];

const COPY = {
  RU: {
    messages: 'Сообщения', statuses: 'Статусы', newMessages: 'новых',
    write: 'Написать водителю…', writeShipper: 'Написать грузоотправителю…',
    distance: 'Расстояние', remaining: 'Осталось', travelTime: 'Время', eta: 'ETA',
    updatedNow: 'Обновлено сейчас', updated: 'Обновлено', ago: 'назад', min: 'мин', hour: 'ч', day: 'д',
    cargo: 'Груз', driver: 'Водитель', shipper: 'Грузоотправитель',
    noMessages: 'Сообщений пока нет', attachPhoto: 'Фото', attachCamera: 'Камера', attachDocument: 'Документ',
    recording: 'Идёт запись…', voiceMessage: 'Голосовое сообщение',
    cancelDeal: 'Отменить сделку', cancelDealConfirm: 'Отменить эту сделку?', loading: 'Загрузка сделки…',
    loadingDate: 'Загрузка', deliveryDate: 'Доставка', expandMap: 'Развернуть карту', collapseMap: 'Свернуть карту',
    tripFinished: 'Сделка завершена', tripDelivered: 'Груз доставлен', awaitingReceiptStatus: 'Ожидает подтверждения', tripAwaitingReceipt: 'Ожидаем подтверждения грузоотправителя', tripAwaitingReceiptHint: 'Водитель отметил груз как доставленный. Сделка завершится после подтверждения получения.', tripReceived: 'Получение подтверждено', mapFinishedHint: 'Live GPS для этого рейса больше не используется.',
    jumpLatest: 'Новые сообщения', closePhoto: 'Закрыть фото',
  },
  EN: {
    messages: 'Messages', statuses: 'Statuses', newMessages: 'new',
    write: 'Message driver…', writeShipper: 'Message shipper…',
    distance: 'Distance', remaining: 'Remaining', travelTime: 'Time', eta: 'ETA',
    updatedNow: 'Updated now', updated: 'Updated', ago: 'ago', min: 'min', hour: 'h', day: 'd',
    cargo: 'Cargo', driver: 'Driver', shipper: 'Shipper',
    noMessages: 'No messages yet', attachPhoto: 'Photo', attachCamera: 'Camera', attachDocument: 'Document',
    recording: 'Recording…', voiceMessage: 'Voice message',
    cancelDeal: 'Cancel deal', cancelDealConfirm: 'Cancel this deal?', loading: 'Loading deal…',
    loadingDate: 'Pickup', deliveryDate: 'Delivery', expandMap: 'Expand map', collapseMap: 'Collapse map',
    tripFinished: 'Deal completed', tripDelivered: 'Cargo delivered', awaitingReceiptStatus: 'Awaiting confirmation', tripAwaitingReceipt: 'Awaiting shipper confirmation', tripAwaitingReceiptHint: 'The driver marked the cargo as delivered. The deal is completed after receipt is confirmed.', tripReceived: 'Receipt confirmed', mapFinishedHint: 'Live GPS is no longer used for this trip.',
    jumpLatest: 'New messages', closePhoto: 'Close photo',
  },
  ZH: {
    messages: '消息', statuses: '状态', newMessages: '条新消息',
    write: '给司机发消息…', writeShipper: '给货主发消息…',
    distance: '距离', remaining: '剩余', travelTime: '时间', eta: '预计时间',
    updatedNow: '刚刚更新', updated: '更新于', ago: '前', min: '分钟', hour: '小时', day: '天',
    cargo: '货物', driver: '司机', shipper: '货主',
    noMessages: '暂无消息', attachPhoto: '照片', attachCamera: '相机', attachDocument: '文件',
    recording: '正在录音…', voiceMessage: '语音消息',
    cancelDeal: '取消交易', cancelDealConfirm: '确认取消这笔交易？', loading: '正在加载交易…',
    loadingDate: '装货', deliveryDate: '送达', expandMap: '展开地图', collapseMap: '收起地图',
    tripFinished: '交易已完成', tripDelivered: '货物已送达', awaitingReceiptStatus: '等待确认', tripAwaitingReceipt: '等待货主确认收货', tripAwaitingReceiptHint: '司机已标记货物送达。货主确认收货后，交易才能完成。', tripReceived: '已确认收货', mapFinishedHint: '本次运输已停止实时 GPS。',
    jumpLatest: '新消息', closePhoto: '关闭照片',
  },
  KK: {
    messages: 'Хабарламалар', statuses: 'Мәртебелер', newMessages: 'жаңа',
    write: 'Жүргізушіге жазу…', writeShipper: 'Жүк иесіне жазу…',
    distance: 'Қашықтық', remaining: 'Қалды', travelTime: 'Уақыт', eta: 'ETA',
    updatedNow: 'Қазір жаңартылды', updated: 'Жаңартылды', ago: 'бұрын', min: 'мин', hour: 'сағ', day: 'күн',
    cargo: 'Жүк', driver: 'Жүргізуші', shipper: 'Жүк иесі',
    noMessages: 'Әзірге хабарлама жоқ', attachPhoto: 'Фото', attachCamera: 'Камера', attachDocument: 'Құжат',
    recording: 'Жазылып жатыр…', voiceMessage: 'Дауыстық хабарлама',
    cancelDeal: 'Мәмілені болдырмау', cancelDealConfirm: 'Осы мәмілені болдырмау керек пе?', loading: 'Мәміле жүктелуде…',
    loadingDate: 'Тиеу', deliveryDate: 'Жеткізу', expandMap: 'Картаны үлкейту', collapseMap: 'Картаны кішірейту',
    tripFinished: 'Мәміле аяқталды', tripDelivered: 'Жүк жеткізілді', awaitingReceiptStatus: 'Растауды күтуде', tripAwaitingReceipt: 'Жүк иесінің қабылдауды растауын күтеміз', tripAwaitingReceiptHint: 'Жүргізуші жүкті жеткізілді деп белгіледі. Жүк иесі қабылдауды растағаннан кейін мәміле аяқталады.', tripReceived: 'Қабылдау расталды', mapFinishedHint: 'Бұл рейсте live GPS енді қолданылмайды.',
    jumpLatest: 'Жаңа хабарламалар', closePhoto: 'Фотоны жабу',
  },
};

const resolveAttachment = (value) =>
  value && typeof value === 'string' && value.startsWith('/') ? `${SERVER_URL}${value}` : value;

const fmtMessageTime = (raw) => {
  if (!raw) return '';
  let value = String(raw);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(value)) {
    value = value.replace(' ', 'T') + 'Z';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(raw).slice(11, 16);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const dedupePoints = (points) => {
  const seen = new Set();
  return points.filter((point) => {
    if (!Array.isArray(point) || point.length < 2) return false;
    const key = `${point[0]}:${point[1]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const text = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
};

const compactDate = (raw, lang) => {
  if (!raw) return '';
  const value = String(raw).trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value.slice(0, 10);
  const locale = lang === 'ZH' ? 'zh-CN' : lang === 'EN' ? 'en-GB' : lang === 'KK' ? 'kk-KZ' : 'ru-RU';
  try {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`));
  } catch { return `${match[3]}.${match[2]}`; }
};

const formatWeight = (value, lang) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const amount = Number.isInteger(n) ? n : n.toFixed(1);
  if (lang === 'ZH') return `${amount} 吨`;
  if (lang === 'EN') return `${amount} t`;
  return `${amount} т`;
};

export default function DealWorkspaceScreenV2({ navigation, route }) {
  const { t, lang } = useI18n();
  const ui = COPY[lang] || COPY.RU;
  const colors = useV1Colors();
  const { session } = useAuth();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const params = route?.params || {};

  const [dealId, setDealId] = React.useState(params.dealId || null);
  const [roomId, setRoomId] = React.useState(params.roomId || null);
  const [deal, setDeal] = React.useState(() => ({
    status: params.dealStatus || 'accepted',
    from_city: params.fromCity || null,
    to_city: params.toCity || null,
    cargo_desc: params.cargoDesc || null,
    amount: params.amount ?? null,
    currency: params.currency || null,
    plate: params.plate || null,
    counterparty_name: params.partner?.name || null,
  }));
  const [context, setContext] = React.useState({});
  const [partner, setPartner] = React.useState(params.partner || null);
  const [dealLoading, setDealLoading] = React.useState(!params.dealId);
  const [messages, setMessages] = React.useState([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [input, setInput] = React.useState('');
  const [inputHeight, setInputHeight] = React.useState(44);
  const [timeline, setTimeline] = React.useState([]);
  const [location, setLocation] = React.useState(null);
  const [locationLoading, setLocationLoading] = React.useState(false);
  const [routeSummary, setRouteSummary] = React.useState(null);
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [trackingLoading, setTrackingLoading] = React.useState(false);
  const [sheetState, setSheetState] = React.useState('collapsed');
  const [sheetTab, setSheetTab] = React.useState('chat');
  const [mapExpanded, setMapExpanded] = React.useState(false);
  const [attachOpen, setAttachOpen] = React.useState(false);
  const [documentTrigger, setDocumentTrigger] = React.useState(0);
  const [recording, setRecording] = React.useState(false);
  const [recordSecs, setRecordSecs] = React.useState(0);
  const [confirmDialog, setConfirmDialog] = React.useState(null);
  const [showJumpLatest, setShowJumpLatest] = React.useState(false);
  const [photoViewer, setPhotoViewer] = React.useState(null);

  const listRef = React.useRef(null);
  const mounted = React.useRef(true);
  const recordStartRef = React.useRef(0);
  const nearBottomRef = React.useRef(true);
  const lastCountRef = React.useRef(0);
  const role = params.role || session?.user?.role || 'client';
  const isDriver = role === 'driver';
  const isShipper = !isDriver;
  const language = getLanguage();

  const normalCollapsedHeight = 132 + Math.max(insets.bottom, 6);
  const compactCollapsedHeight = 76 + Math.max(insets.bottom, 6);
  const collapsedHeight = mapExpanded ? compactCollapsedHeight : normalCollapsedHeight;
  const fullHeight = Math.max(collapsedHeight + 180, window.height - Math.max(insets.top, 10) - 112);
  const expandedHeight = Math.min(fullHeight - 8, Math.max(380, Math.round(window.height * 0.72)));
  const sheetAnim = React.useRef(new Animated.Value(collapsedHeight)).current;
  const dragStart = React.useRef(collapsedHeight);

  const heightForState = React.useCallback((state) => {
    if (state === 'full') return fullHeight;
    if (state === 'expanded') return expandedHeight;
    return collapsedHeight;
  }, [collapsedHeight, expandedHeight, fullHeight]);

  const setSheet = React.useCallback((next) => {
    setSheetState(next);
    if (next !== 'collapsed') setMapExpanded(false);
    Animated.spring(sheetAnim, {
      toValue: heightForState(next), damping: 24, stiffness: 220, mass: 0.9, useNativeDriver: false,
    }).start();
  }, [heightForState, sheetAnim]);

  React.useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: heightForState(sheetState), damping: 24, stiffness: 220, mass: 0.9, useNativeDriver: false,
    }).start();
  }, [window.height, insets.bottom, mapExpanded, sheetState, heightForState, sheetAnim]);

  const panResponder = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 5,
    onPanResponderGrant: () => { dragStart.current = heightForState(sheetState); },
    onPanResponderMove: (_, gesture) => {
      const next = Math.max(collapsedHeight, Math.min(fullHeight, dragStart.current - gesture.dy));
      sheetAnim.setValue(next);
    },
    onPanResponderRelease: (_, gesture) => {
      const current = Math.max(collapsedHeight, Math.min(fullHeight, dragStart.current - gesture.dy));
      if (gesture.vy > 0.9) { setSheet('collapsed'); return; }
      if (gesture.vy < -0.9) { setSheet(current > expandedHeight ? 'full' : 'expanded'); return; }
      const fullBoundary = (expandedHeight + fullHeight) / 2;
      const expandedBoundary = (collapsedHeight + expandedHeight) / 2;
      if (current >= fullBoundary) setSheet('full');
      else if (current >= expandedBoundary) setSheet('expanded');
      else setSheet('collapsed');
    },
  }), [collapsedHeight, expandedHeight, fullHeight, heightForState, setSheet, sheetState, sheetAnim]);

  const askConfirm = React.useCallback((title, message = '', confirmLabel = t('confirm'), destructive = false) => (
    new Promise((resolve) => setConfirmDialog({ title, message, confirmLabel, destructive, resolve }))
  ), [t]);
  const settleConfirm = React.useCallback((answer) => {
    setConfirmDialog((current) => { current?.resolve?.(answer); return null; });
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; try { voice.stop?.(); } catch {} };
  }, []);

  React.useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setSheet('full'));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      if (sheetState === 'full') setSheet('expanded');
    });
    return () => { show.remove(); hide.remove(); };
  }, [setSheet, sheetState]);

  React.useEffect(() => {
    if (!recording) { setRecordSecs(0); return undefined; }
    const timer = setInterval(() => setRecordSecs(Math.max(0, Math.floor((Date.now() - recordStartRef.current) / 1000))), 500);
    return () => clearInterval(timer);
  }, [recording]);

  React.useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      try {
        const data = await chatAPI.rooms();
        if (cancelled) return;
        const rooms = data?.rooms || [];
        let room = roomId ? rooms.find((item) => item.id === roomId) : null;
        if (!room && dealId) room = rooms.find((item) => item.deal_id === dealId);
        if (room) {
          if (!roomId) setRoomId(room.id);
          if (!dealId && room.deal_id) setDealId(room.deal_id);
          setPartner((prev) => ({
            id: prev?.id || room.partner_id || null,
            name: prev?.name || room.partner_name || null,
            role: prev?.role || room.partner_role || null,
          }));
          setUnreadCount(Number(room.unread_count || room.unread || 0));
        }
      } catch { /* keep navigation data */ }
      if (!cancelled) setDealLoading(false);
    };
    resolve();
    return () => { cancelled = true; };
  }, [dealId, roomId]);

  const refreshDeal = React.useCallback(async () => {
    if (!dealId) return;
    try {
      const server = await marketAPI.getDeal(dealId);
      if (!mounted.current || !server || server.ok === false) return;
      setDeal((prev) => ({
        ...prev, ...server,
        status: pickDealStatus(prev?.status, server.status || 'accepted'),
        from_city: server.from_city || prev?.from_city,
        to_city: server.to_city || prev?.to_city,
        cargo_desc: server.cargo_desc || prev?.cargo_desc,
        amount: server.amount ?? prev?.amount,
        currency: server.currency || prev?.currency,
        plate: server.plate || prev?.plate,
        counterparty_name: server.counterparty_name || prev?.counterparty_name,
      }));
      if (server.counterparty_name) setPartner((prev) => ({ ...(prev || {}), name: server.counterparty_name }));

      const detail = {};
      if (server.cargo_id) {
        try { detail.cargo = await marketAPI.getCargo(server.cargo_id); } catch {}
      }
      if (server.trip_id) {
        try { detail.trip = await marketAPI.getTrip(server.trip_id); } catch {}
      }
      if (mounted.current) setContext(detail);
    } catch { /* keep last authoritative response */ }
  }, [dealId]);

  React.useEffect(() => {
    refreshDeal();
    if (!dealId) return undefined;
    const timer = setInterval(refreshDeal, 15000);
    return () => clearInterval(timer);
  }, [dealId, refreshDeal]);

  const refreshTimeline = React.useCallback(async () => {
    if (!dealId) return;
    try {
      const result = await chatAPI.dealTimeline(dealId);
      if (mounted.current) setTimeline(Array.isArray(result?.events) ? result.events : []);
    } catch { /* no fake timeline */ }
  }, [dealId]);
  React.useEffect(() => { refreshTimeline(); }, [refreshTimeline]);

  const loadMessages = React.useCallback(async () => {
    if (!roomId) return;
    try {
      const result = await chatAPI.messages(roomId);
      if (!mounted.current) return;
      const mapped = (result?.messages || []).map((message) => {
        const mine = typeof message.mine === 'boolean' ? message.mine : message.sender_id === session?.user?.id;
        const isVoice = !!message.is_voice;
        const system = message.sender_id === 'system';
        return {
          id: String(message.id),
          clientMsgId: message.client_msg_id || null,
          mine,
          system,
          text: system ? localizeSystemMessage(message.text || '', lang) : (message.text || ''),
          photo: !!message.photo_url && !isVoice,
          voice: isVoice,
          mediaUrl: resolveAttachment(message.photo_url),
          voiceDuration: Number(message.voice_duration || 0),
          time: fmtMessageTime(message.created_at),
          read: !!message.is_read,
        };
      });
      setMessages((previous) => {
        const optimistic = previous.filter((item) => item.optimistic && !mapped.some((server) =>
          server.clientMsgId === item.id || (server.mine && item.text && server.text === item.text)
        ));
        return [...mapped, ...optimistic];
      });
      setUnreadCount(0);
      notifyChatRead();
      refreshAppIconBadge();
    } catch { /* preserve messages */ }
  }, [roomId, session?.user?.id, lang]);

  React.useEffect(() => {
    if (!roomId) return undefined;
    loadMessages();
    setActiveRoom(roomId);
    const timer = setInterval(loadMessages, 3000);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') loadMessages(); });
    return () => { clearInterval(timer); appState?.remove?.(); setActiveRoom(null); };
  }, [roomId, loadMessages]);

  React.useEffect(() => {
    if (messages.length > lastCountRef.current) {
      if (nearBottomRef.current) setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 40);
      else setShowJumpLatest(true);
    }
    lastCountRef.current = messages.length;
  }, [messages.length]);

  const trackingActive = Boolean(dealId && LIVE_TRACKING_STATUSES.includes(deal?.status));
  const refreshLocation = React.useCallback(async () => {
    if (!trackingActive || !dealId) {
      setLocation(null);
      setLocationLoading(false);
      return;
    }
    setLocationLoading(true);
    try {
      const result = await marketAPI.getDealLocation(dealId);
      if (mounted.current && result?.has_location && result.location) setLocation(result.location);
    } finally {
      if (mounted.current) setLocationLoading(false);
    }
  }, [dealId, trackingActive]);
  React.useEffect(() => {
    refreshLocation();
    if (!trackingActive) return undefined;
    const timer = setInterval(refreshLocation, 10000);
    return () => clearInterval(timer);
  }, [trackingActive, refreshLocation]);

  const from = deal?.from_city || params.fromCity || '—';
  const to = deal?.to_city || params.toCity || '—';
  const routePoints = React.useMemo(() => dedupePoints([...parseRouteCities(from), ...parseRouteCities(to)]), [from, to]);
  const lat = location ? Number(location.lat) : null;
  const lng = location ? Number(location.lng) : null;
  const hasLivePoint = Number.isFinite(lat) && Number.isFinite(lng);
  const onRouteSummary = React.useCallback((summary) => setRouteSummary(summary || null), []);

  const updatedText = React.useMemo(() => {
    if (!location?.updated_at) return null;
    let raw = String(location.updated_at);
    if (!/[zZ]|[+\-]\d{2}:?\d{2}$/.test(raw)) raw = raw.replace(' ', 'T') + 'Z';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes === 0) return ui.updatedNow;
    if (minutes < 60) return `${ui.updated} ${minutes} ${ui.min} ${ui.ago}`;
    if (minutes < 1440) return `${ui.updated} ${Math.floor(minutes / 60)} ${ui.hour} ${ui.ago}`;
    return `${ui.updated} ${Math.floor(minutes / 1440)} ${ui.day} ${ui.ago}`;
  }, [location?.updated_at, ui]);

  const changeDealStatus = React.useCallback(async (nextStatus) => {
    if (!dealId || statusLoading) return null;
    setStatusLoading(true);
    try {
      const result = await marketAPI.updateDealStatus(dealId, nextStatus);
      if (!result?.ok && result?.status) toast(result.detail || t('update_failed'), 'error');
      await refreshDeal();
      await refreshTimeline();
      return result;
    } catch { toast(t('no_connection'), 'error'); return null; }
    finally { setStatusLoading(false); }
  }, [dealId, statusLoading, refreshDeal, refreshTimeline, toast, t]);

  const startTrip = React.useCallback(async () => {
    if (!dealId || trackingLoading || statusLoading) return;
    setTrackingLoading(true);
    const permission = await ensureBackgroundLocationPermission();
    setTrackingLoading(false);
    if (!permission.ok) { toast(t('track_permission_needed'), 'error'); return; }
    const result = await changeDealStatus('in_progress');
    if (result?.ok) {
      const point = await getCurrentLocationPayload();
      if (point) {
        await marketAPI.sendDealLocation(dealId, point);
        if (mounted.current) setLocation(point);
      }
    }
  }, [dealId, trackingLoading, statusLoading, changeDealStatus, toast, t]);

  const nextAction = React.useMemo(() => (
    getAvailableDealActions({
      role,
      status: deal?.status,
      isInternational: deal?.is_international,
      t,
    })[0] || null
  ), [role, deal?.status, deal?.is_international, t]);

  const runNextAction = React.useCallback(async () => {
    if (!nextAction || nextAction.disabled) return;
    if (nextAction.key === 'in_progress') { await startTrip(); return; }
    if (['delivered', 'received', 'completed'].includes(nextAction.key)) {
      const message = nextAction.key === 'delivered'
        ? t('confirm_mark_delivered')
        : nextAction.key === 'received'
          ? t('confirm_receipt')
          : t('confirm_complete_deal');
      const ok = await askConfirm(nextAction.label, message, nextAction.label);
      if (!ok) return;
    }
    await changeDealStatus(nextAction.key);
  }, [nextAction, startTrip, askConfirm, t, changeDealStatus]);

  const recipientId = partner?.id || null;
  const sendText = React.useCallback(async () => {
    const body = input.trim();
    if (!body || (!roomId && !recipientId)) return;
    const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    setMessages((items) => [...items, {
      id: clientId, mine: true, text: body,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), optimistic: true,
    }]);
    setInput('');
    setInputHeight(44);
    setAttachOpen(false);
    nearBottomRef.current = true;
    setShowJumpLatest(false);
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 60);
    const payload = {
      roomId, toUserId: recipientId, text: body,
      cargoId: deal?.cargo_id || params.cargoId || null,
      tripId: deal?.trip_id || params.tripId || null,
      clientMsgId: clientId,
    };
    try {
      const result = await chatAPI.send(payload);
      if (result?.room_id && !roomId) setRoomId(result.room_id);
      setTimeout(loadMessages, 120);
    } catch (error) {
      if (error?.isNetwork) {
        await enqueueOutbox({ clientId, payload }, session?.user?.id);
        toast(t('chat_queued'), 'info', 2200);
      } else toast(t('chat_send_failed'), 'error');
    }
  }, [input, roomId, recipientId, deal?.cargo_id, deal?.trip_id, params.cargoId, params.tripId, loadMessages, session?.user?.id, toast, t]);

  const sendPhoto = React.useCallback(async (camera) => {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') return;
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') return;
      }
      const pick = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.75 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 });
      if (pick.canceled || !pick.assets?.[0]?.uri) return;
      const source = pick.assets[0].uri;
      let uri = source;
      try { uri = await compressImage(source, { maxSide: 1200, quality: 0.75 }); } catch {}
      const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      setMessages((items) => [...items, {
        id: clientId, mine: true, text: '', photo: true, mediaUrl: uri,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), optimistic: true,
      }]);
      const upload = await chatAPI.uploadChatPhoto(uri);
      if (!upload?.photo_key) throw new Error('photo_upload');
      await chatAPI.send({
        roomId, toUserId: recipientId, photoUrl: upload.photo_key,
        cargoId: deal?.cargo_id || params.cargoId || null,
        tripId: deal?.trip_id || params.tripId || null,
        clientMsgId: clientId,
      });
      setAttachOpen(false);
      setTimeout(loadMessages, 120);
    } catch { toast(t('chat_send_failed'), 'error'); }
  }, [roomId, recipientId, deal?.cargo_id, deal?.trip_id, params.cargoId, params.tripId, loadMessages, toast, t]);

  const toggleVoice = React.useCallback(async () => {
    if (!recording) {
      try {
        const ok = await voice.startRecording();
        if (!ok) return;
        recordStartRef.current = Date.now();
        setRecording(true);
      } catch { toast(t('voice_permission'), 'warn'); }
      return;
    }
    setRecording(false);
    try {
      const result = await voice.stopRecording();
      if (!result?.uri) return;
      const duration = result.duration || Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
      const upload = await chatAPI.uploadChatVoice(result.uri);
      if (!upload?.voice_key) throw new Error('voice_upload');
      await chatAPI.send({
        roomId, toUserId: recipientId, text: `🎤 ${ui.voiceMessage}`, photoUrl: upload.voice_key,
        isVoice: true, voiceDuration: duration,
        cargoId: deal?.cargo_id || params.cargoId || null, tripId: deal?.trip_id || params.tripId || null,
        clientMsgId: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      });
      setTimeout(loadMessages, 120);
    } catch { toast(t('chat_send_failed'), 'error'); }
  }, [recording, roomId, recipientId, deal?.cargo_id, deal?.trip_id, params.cargoId, params.tripId, ui.voiceMessage, loadMessages, toast, t]);

  const renderMessage = React.useCallback(({ item }) => {
    if (item.system) return (
      <View style={s.systemRow}><Text style={[s.systemText, { color: colors.textMuted }]}>{item.text}</Text></View>
    );
    return (
      <View style={[s.messageRow, item.mine ? s.messageMine : s.messageThem]}>
        <View style={[s.bubble, item.mine ? s.bubbleMine : s.bubbleThem, !item.mine && { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {item.photo && item.mediaUrl ? (
            <Pressable
              onPress={() => setPhotoViewer({ uri: item.mediaUrl, mine: item.mine, time: item.time })}
              style={s.photoPress}
              testID="deal-chat-photo-open"
            >
              <Image source={{ uri: item.mediaUrl }} style={s.photo} resizeMode="cover" />
            </Pressable>
          ) : null}
          {item.voice ? (
            <TouchableOpacity onPress={() => item.mediaUrl && voice.play(item.mediaUrl)} style={s.voiceRow}>
              <Feather name="play" size={15} color={item.mine ? '#FFFFFF' : colors.text} />
              <Text style={{ color: item.mine ? '#FFFFFF' : colors.text, fontWeight: '700' }}>
                {ui.voiceMessage}{item.voiceDuration ? ` · ${item.voiceDuration}${t('unit_sec_short')}` : ''}
              </Text>
            </TouchableOpacity>
          ) : item.text ? <Text style={[s.messageText, { color: item.mine ? '#FFFFFF' : colors.text }]}>{item.text}</Text> : null}
          <Text style={[s.messageTime, { color: item.mine ? 'rgba(255,255,255,0.68)' : colors.textMuted }]}>{item.time}</Text>
        </View>
      </View>
    );
  }, [colors, ui.voiceMessage, t]);

  const latestMessage = messages.length ? messages[messages.length - 1] : null;
  const cargo = context.cargo || {};
  const trip = context.trip || {};
  const routeLabel = `${localizePlace(from, language)} → ${localizePlace(to, language)}`;
  const visibleDealStatus = userFacingDealStatus(deal?.status || 'accepted');
  const statusLabel = visibleDealStatus === 'delivered' ? ui.awaitingReceiptStatus : formatStatus(visibleDealStatus);
  const partnerName = text(partner?.name, deal?.counterparty_name, isDriver ? cargo?.owner_name : trip?.driver_display_name);

  const rawCargoName = text(deal?.cargo_desc, cargo?.cargo_desc);
  const rawTruckType = text(deal?.cargo_type, cargo?.cargo_type, deal?.truck_type, trip?.truck_type);
  const cargoMeta = [
    localizeCargoName(rawCargoName, lang) || rawCargoName,
    formatWeight(text(deal?.weight_tons, cargo?.weight_tons), lang),
    rawTruckType ? formatTruckType(rawTruckType) : null,
    deal?.amount != null ? formatPrice(deal.amount, deal.currency || cargo?.currency || trip?.currency || 'USD', t) : null,
  ].filter(Boolean).join(' · ');

  const pickup = text(deal?.pickup_date, deal?.departure, cargo?.pickup_date, trip?.departure);
  const delivery = text(deal?.delivery_date, deal?.delivery_deadline, deal?.arrival, trip?.arrival);
  const scheduleMeta = [
    pickup ? `${ui.loadingDate}: ${compactDate(pickup, lang)}` : null,
    delivery ? `${ui.deliveryDate}: ${compactDate(delivery, lang)}` : null,
  ].filter(Boolean).join(' · ');

  const counterpartyMeta = [
    `${isDriver ? ui.shipper : ui.driver}: ${partnerName || '—'}`,
    isDriver ? text(cargo?.company_name, deal?.shipper_company) : text(trip?.vehicle_brand, deal?.vehicle_brand),
    isDriver ? text(cargo?.country, deal?.shipper_country) : text(deal?.plate, trip?.vehicle_plate),
  ].filter(Boolean).join(' · ');

  const mapWorking = MAP_WORK_STATUSES.includes(visibleDealStatus);
  const showLiveMap = !TERMINAL_STATUSES.includes(visibleDealStatus) && visibleDealStatus !== 'delivered' && visibleDealStatus !== 'received' && mapWorking;
  const inactiveTitle = visibleDealStatus === 'delivered'
    ? ui.tripDelivered
    : visibleDealStatus === 'received'
      ? ui.tripReceived
      : ui.tripFinished;
  const inactiveSubtitle = visibleDealStatus === 'delivered' ? ui.tripAwaitingReceipt : '';
  const inactiveHint = visibleDealStatus === 'delivered' ? ui.tripAwaitingReceiptHint : '';

  const showTab = (tab) => {
    setSheetTab(tab);
    setAttachOpen(false);
    if (sheetState === 'collapsed') setSheet('expanded');
  };

  const cancelDeal = async () => {
    const ok = await askConfirm(ui.cancelDeal, ui.cancelDealConfirm, ui.cancelDeal, true);
    if (ok) await changeDealStatus('cancelled');
  };

  const toggleMap = () => {
    setMapExpanded((value) => !value);
    setSheetTab('chat');
    setSheet('collapsed');
  };

  const jumpLatest = () => {
    nearBottomRef.current = true;
    setShowJumpLatest(false);
    listRef.current?.scrollToEnd?.({ animated: true });
  };

  const expandChat = () => {
    if (sheetState === 'collapsed') setSheet('expanded');
    else if (sheetState === 'expanded') setSheet('full');
    else setSheet('collapsed');
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']} testID="deal-workspace-screen">
      <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={[s.compactHeader, { borderBottomColor: colors.border, backgroundColor: colors.bg }]} testID="deal-compact-header">
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="deal-workspace-back">
            <Feather name="chevron-left" size={28} color={colors.text} />
          </TouchableOpacity>
          <View style={s.headerText}>
            <View style={s.routeHeaderRow}>
              <Text style={[s.routeTitle, { color: colors.text }]} numberOfLines={1}>{routeLabel}</Text>
              <View style={s.statusPill}>
                <View style={s.statusDot} />
                <Text style={s.statusPillText} numberOfLines={1}>{statusLabel}</Text>
              </View>
            </View>
            {cargoMeta ? <Text style={[s.metaPrimary, { color: colors.text }]} numberOfLines={1}>{cargoMeta}</Text> : null}
            {scheduleMeta ? <Text style={[s.metaSecondary, { color: colors.textMuted }]} numberOfLines={1}>{scheduleMeta}</Text> : null}
            <Text style={[s.partnerText, { color: colors.textMuted }]} numberOfLines={1}>{counterpartyMeta}</Text>
          </View>
        </View>

        <View style={s.mapArea} testID="deal-map-first-area">
          {dealLoading && !dealId ? (
            <View style={[s.center, { backgroundColor: colors.bg }]}>
              <ActivityIndicator color="#168759" />
              <Text style={[s.loadingText, { color: colors.textMuted }]}>{ui.loading}</Text>
            </View>
          ) : showLiveMap ? (
            <TruckMap
              lat={hasLivePoint ? lat : undefined}
              lng={hasLivePoint ? lng : undefined}
              title={partnerName || t('track_truck_marker')}
              routePoints={routePoints}
              planned={!hasLivePoint}
              showBadge={false}
              onRouteSummary={onRouteSummary}
            />
          ) : (
            <View style={[s.finishedMap, { backgroundColor: colors.surface }]} testID="deal-inactive-map-summary">
              <View style={s.finishedIcon}><Feather name={visibleDealStatus === 'delivered' ? 'package' : 'check-circle'} size={28} color="#168759" /></View>
              <Text style={[s.finishedTitle, { color: colors.text }]}>{inactiveTitle}</Text>
              <Text style={[s.finishedRoute, { color: colors.text }]}>{routeLabel}</Text>
              {inactiveSubtitle ? <Text style={[s.finishedSubtitle, { color: colors.text }]}>{inactiveSubtitle}</Text> : null}
              {inactiveHint ? <Text style={[s.finishedHint, { color: colors.textMuted }]}>{inactiveHint}</Text> : null}
              <Text style={[s.finishedGpsHint, { color: colors.textMuted }]}>{ui.mapFinishedHint}</Text>
              {nextAction ? (
                <TouchableOpacity
                  style={s.finishedAction}
                  onPress={runNextAction}
                  disabled={statusLoading || trackingLoading}
                  testID={nextAction.key === 'received' ? 'deal-action-confirm-receipt' : nextAction.key === 'completed' ? 'deal-action-complete' : 'deal-action-next'}
                >
                  <Feather name={nextAction.icon} size={16} color="#FFFFFF" />
                  <Text style={s.finishedActionText}>{statusLoading ? '…' : nextAction.label}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {showLiveMap ? (
            <TouchableOpacity style={[s.mapExpand, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={toggleMap} testID="deal-map-expand-toggle" accessibilityLabel={mapExpanded ? ui.collapseMap : ui.expandMap}>
              <Feather name={mapExpanded ? 'minimize-2' : 'maximize-2'} size={18} color={colors.text} />
            </TouchableOpacity>
          ) : null}

          {showLiveMap && updatedText ? (
            <View style={[s.updatedPill, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="none">
              <Feather name="refresh-cw" size={12} color="#168759" />
              <Text style={[s.updatedText, { color: colors.text }]}>{updatedText}</Text>
            </View>
          ) : showLiveMap && locationLoading && trackingActive ? (
            <View style={[s.updatedPill, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="none"><ActivityIndicator size="small" color="#168759" /></View>
          ) : null}

          {showLiveMap && nextAction ? (
            <TouchableOpacity
              style={[s.floatingAction, { backgroundColor: nextAction.disabled ? '#E4E8E5' : '#168759' }]}
              onPress={runNextAction}
              disabled={nextAction.disabled || statusLoading || trackingLoading}
              testID={nextAction.key === 'in_progress' ? 'deal-action-start-delivery' : nextAction.key === 'delivered' ? 'deal-action-mark-arrived' : nextAction.key === 'received' ? 'deal-action-confirm-receipt' : nextAction.key === 'completed' ? 'deal-action-complete' : 'deal-action-next'}
            >
              <Feather name={nextAction.icon} size={15} color={nextAction.disabled ? '#7C8B82' : '#FFFFFF'} />
              <Text style={[s.floatingActionText, { color: nextAction.disabled ? '#7C8B82' : '#FFFFFF' }]} numberOfLines={1}>{statusLoading || trackingLoading ? '…' : nextAction.label}</Text>
            </TouchableOpacity>
          ) : null}

          {showLiveMap && routeSummary ? (
            <View style={[s.metricsCard, { bottom: collapsedHeight + 12, backgroundColor: colors.surface, borderColor: colors.border }]} testID="deal-route-metrics" pointerEvents="none">
              <View style={s.metricCell}>
                <Text style={[s.metricLabel, { color: colors.textMuted }]}>{routeSummary.isRemaining ? ui.remaining : ui.distance}</Text>
                <Text style={[s.metricValue, { color: colors.text }]} numberOfLines={1}>{routeSummary.distanceText}</Text>
              </View>
              <View style={[s.metricDivider, { backgroundColor: colors.border }]} />
              <View style={s.metricCell}>
                <Text style={[s.metricLabel, { color: colors.textMuted }]}>{routeSummary.isRemaining ? ui.eta : ui.travelTime}</Text>
                <Text style={[s.metricValue, { color: colors.text }]} numberOfLines={1}>{routeSummary.durationText}</Text>
              </View>
            </View>
          ) : null}
        </View>

        <Animated.View style={[s.sheet, { height: sheetAnim, backgroundColor: colors.bg, borderColor: colors.border }]} testID={`deal-chat-sheet-${sheetState}`}>
          <View {...panResponder.panHandlers} style={s.dragZone} testID="deal-chat-drag-handle">
            <View style={s.dragHandle} />
          </View>

          <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity style={s.sheetTitleTouch} onPress={expandChat} testID="deal-chat-toggle">
              <View style={s.chatIconBox}><Feather name={sheetTab === 'chat' ? 'message-circle' : 'activity'} size={18} color="#168759" /></View>
              <View style={s.sheetTitleText}>
                <View style={s.sheetTitleRow}>
                  <Text style={[s.sheetTitle, { color: colors.text }]}>{sheetTab === 'chat' ? ui.messages : ui.statuses}</Text>
                  {sheetTab === 'chat' && unreadCount > 0 ? <Text style={s.newCount}>{unreadCount} {ui.newMessages}</Text> : null}
                </View>
                {sheetState === 'collapsed' && sheetTab === 'chat' ? (
                  <Text style={[s.preview, { color: colors.textMuted }]} numberOfLines={mapExpanded ? 1 : 2}>
                    {latestMessage?.text || (latestMessage?.voice ? ui.voiceMessage : latestMessage?.photo ? ui.attachPhoto : ui.noMessages)}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => sheetState === 'collapsed' ? setSheet('expanded') : setSheet('collapsed')} style={s.collapseButton} testID="deal-chat-collapse">
              <Feather name={sheetState === 'collapsed' ? 'chevron-up' : 'x'} size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {sheetState !== 'collapsed' ? (
            <>
              <View style={s.tabRow} testID="deal-sheet-two-tabs">
                {[['chat', ui.messages, 'message-circle'], ['status', ui.statuses, 'activity']].map(([key, label, icon]) => (
                  <TouchableOpacity key={key} style={[s.tab, sheetTab === key && s.tabActive]} onPress={() => showTab(key)} testID={`deal-sheet-tab-${key}`}>
                    <Feather name={icon} size={15} color={sheetTab === key ? '#168759' : colors.textMuted} />
                    <Text style={[s.tabText, { color: sheetTab === key ? '#168759' : colors.textMuted }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {sheetTab === 'chat' ? (
                <>
                  <View style={s.chatBody}>
                    <FlatList
                      ref={listRef}
                      data={messages}
                      renderItem={renderMessage}
                      keyExtractor={(item) => item.id}
                      style={s.messageList}
                      contentContainerStyle={s.messageContent}
                      keyboardShouldPersistTaps="handled"
                      onScroll={(event) => {
                        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                        const nearBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80;
                        nearBottomRef.current = nearBottom;
                        if (nearBottom && showJumpLatest) setShowJumpLatest(false);
                      }}
                      scrollEventThrottle={80}
                      onContentSizeChange={() => { if (nearBottomRef.current && messages.length <= lastCountRef.current) listRef.current?.scrollToEnd?.({ animated: false }); }}
                      ListEmptyComponent={<Text style={[s.emptyText, { color: colors.textMuted }]}>{ui.noMessages}</Text>}
                    />
                    {showJumpLatest ? (
                      <TouchableOpacity style={s.jumpLatest} onPress={jumpLatest} testID="deal-chat-jump-latest">
                        <Feather name="arrow-down" size={14} color="#FFFFFF" />
                        <Text style={s.jumpLatestText}>{ui.jumpLatest}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {recording ? (
                    <View style={s.recordBar}><View style={s.recordDot} /><Text style={s.recordText}>{ui.recording} 0:{String(recordSecs % 60).padStart(2, '0')}</Text></View>
                  ) : null}

                  <DealAttachments conversationId={roomId} role={role} compact inline documentTrigger={documentTrigger} />

                  {attachOpen ? (
                    <View style={[s.attachMenu, { borderTopColor: colors.border }]} testID="deal-chat-attach-menu">
                      <TouchableOpacity style={s.attachItem} onPress={() => sendPhoto(false)}>
                        <View style={[s.attachIcon, { backgroundColor: '#E9F6EF' }]}><Feather name="image" size={21} color="#168759" /></View>
                        <Text style={[s.attachLabel, { color: colors.text }]}>{ui.attachPhoto}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.attachItem} onPress={() => sendPhoto(true)}>
                        <View style={[s.attachIcon, { backgroundColor: '#E9F6EF' }]}><Feather name="camera" size={21} color="#168759" /></View>
                        <Text style={[s.attachLabel, { color: colors.text }]}>{ui.attachCamera}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.attachItem} onPress={() => { setAttachOpen(false); setDocumentTrigger((value) => value + 1); }} testID="deal-chat-attach-document">
                        <View style={[s.attachIcon, { backgroundColor: '#E9F6EF' }]}><Feather name="file-text" size={21} color="#168759" /></View>
                        <Text style={[s.attachLabel, { color: colors.text }]}>{ui.attachDocument}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <View style={[s.composer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]} testID="deal-chat-composer">
                    <TouchableOpacity style={[s.composerIcon, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setAttachOpen((value) => !value)} testID="deal-chat-attach">
                      <Feather name="plus" size={21} color={colors.text} />
                    </TouchableOpacity>
                    <TextInput
                      value={input}
                      onChangeText={(value) => { setInput(value); if (roomId) chatAPI.typing(roomId); }}
                      onFocus={() => { setAttachOpen(false); setSheet('full'); }}
                      onContentSizeChange={(event) => setInputHeight(Math.max(44, Math.min(112, Math.ceil(event.nativeEvent.contentSize.height + 18))))}
                      multiline
                      scrollEnabled={inputHeight >= 112}
                      style={[s.input, { height: inputHeight, color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                      placeholder={isDriver ? ui.writeShipper : ui.write}
                      placeholderTextColor={colors.textMuted}
                      testID="deal-chat-input"
                    />
                    {input.trim() ? (
                      <TouchableOpacity style={s.sendButton} onPress={sendText} testID="deal-chat-send"><FontAwesome5 name="paper-plane" size={15} color="#FFFFFF" solid /></TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[s.sendButton, recording && s.recordingButton]} onPress={toggleVoice} testID="deal-chat-voice"><Feather name={recording ? 'square' : 'mic'} size={18} color="#FFFFFF" /></TouchableOpacity>
                    )}
                  </View>
                </>
              ) : (
                <View style={s.panelBody} testID="deal-status-panel">
                  <FlatList
                    data={[{ id: 'timeline' }]}
                    keyExtractor={(item) => item.id}
                    renderItem={() => <DealStatusTimeline events={timeline} fallbackStatus={statusLabel} />}
                    contentContainerStyle={{ paddingBottom: 20 }}
                  />
                  {deal?.status === 'accepted' ? (
                    <TouchableOpacity style={s.cancelLink} onPress={cancelDeal} testID="deal-cancel-link"><Text style={s.cancelLinkText}>{ui.cancelDeal}</Text></TouchableOpacity>
                  ) : null}
                </View>
              )}
            </>
          ) : null}
        </Animated.View>

        <AppConfirmModal
          visible={!!confirmDialog}
          title={confirmDialog?.title}
          message={confirmDialog?.message}
          cancelLabel={t('cancel')}
          confirmLabel={confirmDialog?.confirmLabel || t('confirm')}
          destructive={!!confirmDialog?.destructive}
          onCancel={() => settleConfirm(false)}
          onConfirm={() => settleConfirm(true)}
          testID="deal-workspace-confirm"
        />

        <Modal
          visible={!!photoViewer}
          transparent
          animationType="fade"
          onRequestClose={() => setPhotoViewer(null)}
          testID="deal-chat-photo-viewer"
        >
          <View style={s.photoViewer}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPhotoViewer(null)} />
            <Image source={{ uri: photoViewer?.uri }} style={s.photoViewerImage} resizeMode="contain" />
            <TouchableOpacity
              style={s.photoViewerClose}
              onPress={() => setPhotoViewer(null)}
              accessibilityLabel={ui.closePhoto}
              testID="deal-chat-photo-viewer-close"
            >
              <Feather name="x" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  compactHeader: { minHeight: 118, flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 9, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 20 },
  backButton: { width: 42, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  headerText: { flex: 1, minWidth: 0, paddingRight: 10 },
  routeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  routeTitle: { flex: 1, fontSize: 19, fontWeight: '900', letterSpacing: -0.35 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#E9F6EF' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#168759' },
  statusPillText: { color: '#168759', fontSize: 11.5, fontWeight: '800', maxWidth: 104 },
  metaPrimary: { fontSize: 12.7, fontWeight: '800', marginTop: 1 },
  metaSecondary: { fontSize: 11.5, fontWeight: '650', marginTop: 3 },
  partnerText: { fontSize: 11.5, fontWeight: '650', marginTop: 3 },
  mapArea: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#EAF1ED' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { fontSize: 13, fontWeight: '700' },
  updatedPill: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  updatedText: { fontSize: 11.5, fontWeight: '800' },
  mapExpand: { position: 'absolute', right: 12, bottom: 14, width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3, zIndex: 8 },
  floatingAction: { position: 'absolute', right: 12, top: 12, maxWidth: '58%', minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 999, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  floatingActionText: { fontSize: 12.5, fontWeight: '900', flexShrink: 1 },
  metricsCard: { position: 'absolute', left: 12, right: 66, minHeight: 68, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  metricCell: { flex: 1, minWidth: 0 },
  metricLabel: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.35, marginBottom: 3 },
  metricValue: { fontSize: 18, fontWeight: '900' },
  metricDivider: { width: 1, alignSelf: 'stretch', marginHorizontal: 14 },
  finishedMap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  finishedIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#E9F6EF', alignItems: 'center', justifyContent: 'center' },
  finishedTitle: { fontSize: 20, fontWeight: '900', marginTop: 14 },
  finishedRoute: { fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  finishedSubtitle: { fontSize: 15, fontWeight: '800', textAlign: 'center', lineHeight: 20, marginTop: 13 },
  finishedHint: { fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: 7, maxWidth: 420 },
  finishedGpsHint: { fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 8, opacity: 0.82 },
  finishedAction: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 20, marginTop: 18, borderRadius: 16, backgroundColor: '#168759' },
  finishedActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderBottomWidth: 0, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: -5 }, elevation: 12, zIndex: 30 },
  dragZone: { height: 20, alignItems: 'center', justifyContent: 'center' },
  dragHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#C7CEC9' },
  sheetHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitleTouch: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatIconBox: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#E9F6EF', alignItems: 'center', justifyContent: 'center' },
  sheetTitleText: { flex: 1, minWidth: 0 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '900' },
  newCount: { color: '#168759', fontSize: 12, fontWeight: '800' },
  preview: { fontSize: 12.5, lineHeight: 17, marginTop: 2, paddingRight: 6 },
  collapseButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tabRow: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  tab: { flex: 1, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13 },
  tabActive: { backgroundColor: '#E9F6EF' },
  tabText: { fontSize: 12.5, fontWeight: '850' },
  chatBody: { flex: 1, position: 'relative' },
  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12 },
  messageRow: { marginBottom: 10 },
  messageMine: { alignItems: 'flex-end' },
  messageThem: { alignItems: 'flex-start' },
  bubble: { maxWidth: '84%', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8 },
  bubbleMine: { backgroundColor: '#168759', borderBottomRightRadius: 5 },
  bubbleThem: { borderWidth: 1, borderBottomLeftRadius: 5 },
  messageText: { fontSize: 14.5, lineHeight: 20 },
  messageTime: { fontSize: 10.5, marginTop: 4, textAlign: 'right' },
  systemRow: { alignItems: 'center', marginVertical: 5 },
  systemText: { fontSize: 11.5, fontWeight: '650', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(124,139,130,0.12)', borderRadius: 999 },
  photoPress: { marginBottom: 4 },
  photo: { width: 210, height: 150, borderRadius: 11 },
  photoViewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  photoViewerImage: { width: '100%', height: '100%' },
  photoViewerClose: { position: 'absolute', top: 52, right: 18, width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  voiceRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyText: { textAlign: 'center', marginTop: 24, fontSize: 13 },
  jumpLatest: { position: 'absolute', right: 14, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#168759', paddingHorizontal: 11, height: 34, borderRadius: 17, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  jumpLatestText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },
  recordBar: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15, paddingVertical: 7, backgroundColor: 'rgba(239,68,68,0.08)' },
  recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  recordText: { color: '#B91C1C', fontSize: 12, fontWeight: '800' },
  attachMenu: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, backgroundColor: '#FAFBFA' },
  attachItem: { minWidth: 86, alignItems: 'center', gap: 7 },
  attachIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0E8E3', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  attachLabel: { fontSize: 12, fontWeight: '850' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth },
  composerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 112, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 10, fontSize: 14.5, lineHeight: 19 },
  sendButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#168759' },
  recordingButton: { backgroundColor: '#EF4444' },
  panelBody: { flex: 1, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12 },
  cancelLink: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 10, marginTop: 4 },
  cancelLinkText: { color: '#EF4444', fontSize: 12.5, fontWeight: '750' },
});
