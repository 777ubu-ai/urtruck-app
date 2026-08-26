import React from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { SystemEventRow } from '../components/deal/DealRoom';
import AppConfirmModal from '../components/ui/AppConfirmModal';
import { chatAPI } from '../utils/chatAPI';
import { marketAPI } from '../utils/marketAPI';
import { parseRouteCities } from '../utils/geo';
import { localizePlace } from '../utils/places';
import { getLanguage, formatStatus } from '../utils/i18n';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/Toast';
import { useV1Colors } from '../theme/designV1';
import { formatPrice } from '../utils/normalizers';
import { pickDealStatus, userFacingDealStatus } from '../utils/dealStatusOrder';
import { ensureBackgroundLocationPermission, getCurrentLocationPayload } from '../utils/backgroundLocation';
import { compressImage } from '../utils/imageCompress';
import { voice } from '../utils/voiceRecorder';
import { enqueueOutbox } from '../utils/outbox';
import { setActiveRoom } from '../utils/activeRoom';
import { notifyChatRead } from '../utils/unreadEvents';
import { refreshAppIconBadge } from '../utils/appBadge';
import { SERVER_URL } from '../config/env';

const TRACKING_STATUSES = ['in_progress', 'at_border', 'delivered'];
const ACTIVE_STATUSES = ['accepted', 'in_progress', 'at_border', 'delivered'];

const COPY = {
  RU: {
    messages: 'Сообщения', newMessages: 'новых', write: 'Написать водителю…',
    writeShipper: 'Написать грузоотправителю…', documents: 'Документы', statuses: 'Статусы',
    distance: 'Расстояние', remaining: 'Осталось', travelTime: 'Время', eta: 'ETA',
    updatedNow: 'Обновлено сейчас', updated: 'Обновлено', ago: 'назад', min: 'мин', hour: 'ч', day: 'д',
    cargo: 'Груз', driver: 'Водитель', shipper: 'Грузоотправитель',
    noMessages: 'Сообщений пока нет', routeUnavailable: 'Дорожный расчёт временно недоступен',
    attachPhoto: 'Фото', attachCamera: 'Камера', attachDocument: 'Документ',
    recording: 'Идёт запись…', voiceMessage: 'Голосовое сообщение',
    cancelDeal: 'Отменить сделку', cancelDealConfirm: 'Отменить эту сделку?',
    openChat: 'Открыть чат', loading: 'Загрузка сделки…',
  },
  EN: {
    messages: 'Messages', newMessages: 'new', write: 'Message driver…',
    writeShipper: 'Message shipper…', documents: 'Documents', statuses: 'Statuses',
    distance: 'Distance', remaining: 'Remaining', travelTime: 'Time', eta: 'ETA',
    updatedNow: 'Updated now', updated: 'Updated', ago: 'ago', min: 'min', hour: 'h', day: 'd',
    cargo: 'Cargo', driver: 'Driver', shipper: 'Shipper',
    noMessages: 'No messages yet', routeUnavailable: 'Road route estimate is temporarily unavailable',
    attachPhoto: 'Photo', attachCamera: 'Camera', attachDocument: 'Document',
    recording: 'Recording…', voiceMessage: 'Voice message',
    cancelDeal: 'Cancel deal', cancelDealConfirm: 'Cancel this deal?',
    openChat: 'Open chat', loading: 'Loading deal…',
  },
  ZH: {
    messages: '消息', newMessages: '条新消息', write: '给司机发消息…',
    writeShipper: '给货主发消息…', documents: '文件', statuses: '状态',
    distance: '距离', remaining: '剩余', travelTime: '时间', eta: '预计时间',
    updatedNow: '刚刚更新', updated: '更新于', ago: '前', min: '分钟', hour: '小时', day: '天',
    cargo: '货物', driver: '司机', shipper: '货主',
    noMessages: '暂无消息', routeUnavailable: '道路路线暂时无法计算',
    attachPhoto: '照片', attachCamera: '相机', attachDocument: '文件',
    recording: '正在录音…', voiceMessage: '语音消息',
    cancelDeal: '取消交易', cancelDealConfirm: '确认取消这笔交易？',
    openChat: '打开聊天', loading: '正在加载交易…',
  },
  KK: {
    messages: 'Хабарламалар', newMessages: 'жаңа', write: 'Жүргізушіге жазу…',
    writeShipper: 'Жүк иесіне жазу…', documents: 'Құжаттар', statuses: 'Мәртебелер',
    distance: 'Қашықтық', remaining: 'Қалды', travelTime: 'Уақыт', eta: 'ETA',
    updatedNow: 'Қазір жаңартылды', updated: 'Жаңартылды', ago: 'бұрын', min: 'мин', hour: 'сағ', day: 'күн',
    cargo: 'Жүк', driver: 'Жүргізуші', shipper: 'Жүк иесі',
    noMessages: 'Әзірге хабарлама жоқ', routeUnavailable: 'Жол маршрутын есептеу уақытша қолжетімсіз',
    attachPhoto: 'Фото', attachCamera: 'Камера', attachDocument: 'Құжат',
    recording: 'Жазылып жатыр…', voiceMessage: 'Дауыстық хабарлама',
    cancelDeal: 'Мәмілені болдырмау', cancelDealConfirm: 'Осы мәмілені болдырмау керек пе?',
    openChat: 'Чатты ашу', loading: 'Мәміле жүктелуде…',
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

export default function DealWorkspaceScreen({ navigation, route }) {
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
  const [attachOpen, setAttachOpen] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [recordSecs, setRecordSecs] = React.useState(0);
  const [confirmDialog, setConfirmDialog] = React.useState(null);
  const [imagePreview, setImagePreview] = React.useState(null);

  const listRef = React.useRef(null);
  const mounted = React.useRef(true);
  const recordStartRef = React.useRef(0);
  const role = params.role || session?.user?.role || 'client';
  const isDriver = role === 'driver';
  const isShipper = !isDriver;
  const language = getLanguage();

  const collapsedHeight = 92 + Math.max(insets.bottom, 6);
  const fullHeight = Math.max(collapsedHeight + 180, window.height - Math.max(insets.top, 10) - 96);
  const expandedHeight = Math.min(fullHeight - 8, Math.max(360, Math.round(window.height * 0.72)));
  const sheetAnim = React.useRef(new Animated.Value(collapsedHeight)).current;
  const dragStart = React.useRef(collapsedHeight);

  const heightForState = React.useCallback((state) => {
    if (state === 'full') return fullHeight;
    if (state === 'expanded') return expandedHeight;
    return collapsedHeight;
  }, [collapsedHeight, expandedHeight, fullHeight]);

  const setSheet = React.useCallback((next) => {
    setSheetState(next);
    Animated.spring(sheetAnim, {
      toValue: heightForState(next),
      damping: 24,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: false,
    }).start();
  }, [heightForState, sheetAnim]);

  React.useEffect(() => {
    sheetAnim.setValue(heightForState(sheetState));
  }, [window.height, insets.bottom]);

  const panResponder = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
    onPanResponderGrant: () => { dragStart.current = heightForState(sheetState); },
    onPanResponderMove: (_, gesture) => {
      const next = Math.max(collapsedHeight, Math.min(fullHeight, dragStart.current - gesture.dy));
      sheetAnim.setValue(next);
    },
    onPanResponderRelease: (_, gesture) => {
      const current = Math.max(collapsedHeight, Math.min(fullHeight, dragStart.current - gesture.dy));
      const fullBoundary = (expandedHeight + fullHeight) / 2;
      const expandedBoundary = (collapsedHeight + expandedHeight) / 2;
      if (current >= fullBoundary || gesture.vy < -0.8) setSheet('full');
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
    return () => {
      mounted.current = false;
      try { voice.stop?.(); } catch {}
    };
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

  // Resolve the canonical deal/room pair. This also lets notifications that
  // arrive with only roomId or only dealId enter the same workspace.
  React.useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      try {
        const data = await chatAPI.rooms();
        if (cancelled) return;
        const rooms = data?.rooms || [];
        let room = null;
        if (roomId) room = rooms.find((item) => item.id === roomId);
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
      } catch { /* fail closed to the data already supplied by navigation */ }
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
        ...prev,
        ...server,
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
    } catch { /* screen keeps last authoritative response */ }
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
        const mine = typeof message.mine === 'boolean'
          ? message.mine
          : message.sender_id === session?.user?.id;
        const isVoice = !!message.is_voice;
        return {
          id: String(message.id),
          clientMsgId: message.client_msg_id || null,
          mine,
          system: message.sender_id === 'system',
          text: message.text || '',
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
    } catch { /* keep visible messages on a transient poll error */ }
  }, [roomId, session?.user?.id]);

  React.useEffect(() => {
    if (!roomId) return undefined;
    loadMessages();
    setActiveRoom(roomId);
    const timer = setInterval(loadMessages, 3000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadMessages();
    });
    return () => {
      clearInterval(timer);
      appState?.remove?.();
      setActiveRoom(null);
    };
  }, [roomId, loadMessages]);

  const trackingActive = Boolean(dealId && TRACKING_STATUSES.includes(deal?.status));
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
  const routePoints = React.useMemo(() => dedupePoints([
    ...parseRouteCities(from),
    ...parseRouteCities(to),
  ]), [from, to]);
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
      if (!result?.ok && result?.status) {
        toast(result.detail || t('update_failed'), 'error');
      }
      await refreshDeal();
      await refreshTimeline();
      return result;
    } catch {
      toast(t('no_connection'), 'error');
      return null;
    } finally {
      setStatusLoading(false);
    }
  }, [dealId, statusLoading, refreshDeal, refreshTimeline, toast, t]);

  const startTrip = React.useCallback(async () => {
    if (!dealId || trackingLoading || statusLoading) return;
    setTrackingLoading(true);
    const permission = await ensureBackgroundLocationPermission();
    setTrackingLoading(false);
    if (!permission.ok) {
      toast(t('track_permission_needed'), 'error');
      return;
    }
    const result = await changeDealStatus('in_progress');
    if (result?.ok) {
      const point = await getCurrentLocationPayload();
      if (point) {
        await marketAPI.sendDealLocation(dealId, point);
        if (mounted.current) setLocation(point);
      }
    }
  }, [dealId, trackingLoading, statusLoading, changeDealStatus, toast, t]);

  const nextAction = React.useMemo(() => {
    if (!deal?.status || deal.status === 'cancelled' || deal.status === 'completed') return null;
    if (isDriver) {
      if (deal.status === 'accepted') return { key: 'in_progress', label: t('start_delivery'), icon: 'truck' };
      if (deal.status === 'in_progress' && deal.is_international === true) return { key: 'at_border', label: t('mark_at_border'), icon: 'map-pin' };
      if (deal.status === 'in_progress' && deal.is_international == null) return { key: 'clarify', label: t('deal_clarify_route'), icon: 'alert-circle', disabled: true };
      if (deal.status === 'in_progress' || deal.status === 'at_border') return { key: 'delivered', label: t('mark_arrived'), icon: 'package' };
    }
    if (isShipper && deal.status === 'delivered') return { key: 'completed', label: t('confirm_delivery'), icon: 'check-circle' };
    return null;
  }, [deal?.status, deal?.is_international, isDriver, isShipper, t]);

  const runNextAction = React.useCallback(async () => {
    if (!nextAction || nextAction.disabled) return;
    if (nextAction.key === 'in_progress') { await startTrip(); return; }
    if (nextAction.key === 'delivered' || nextAction.key === 'completed') {
      const ok = await askConfirm(nextAction.label, nextAction.key === 'delivered' ? t('confirm_mark_delivered') : t('confirm_receipt'), nextAction.label);
      if (!ok) return;
    }
    await changeDealStatus(nextAction.key);
  }, [nextAction, startTrip, askConfirm, t, changeDealStatus]);

  const recipientId = partner?.id || null;
  const sendText = React.useCallback(async () => {
    const text = input.trim();
    if (!text || (!roomId && !recipientId)) return;
    const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const optimistic = {
      id: clientId, mine: true, text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), optimistic: true,
    };
    setMessages((items) => [...items, optimistic]);
    setInput('');
    setInputHeight(44);
    setAttachOpen(false);
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 60);
    const payload = {
      roomId,
      toUserId: recipientId,
      text,
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
      } else {
        toast(t('chat_send_failed'), 'error');
      }
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
      try { uri = await compressImage(source, { maxSide: 1200, quality: 0.75 }); } catch { /* original is still valid */ }
      const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      setMessages((items) => [...items, {
        id: clientId, mine: true, text: '', photo: true, mediaUrl: uri,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), optimistic: true,
      }]);
      const upload = await chatAPI.uploadChatPhoto(uri);
      if (!upload?.photo_key) throw new Error('photo_upload');
      await chatAPI.send({
        roomId,
        toUserId: recipientId,
        photoUrl: upload.photo_key,
        cargoId: deal?.cargo_id || params.cargoId || null,
        tripId: deal?.trip_id || params.tripId || null,
        clientMsgId: clientId,
      });
      setAttachOpen(false);
      setTimeout(loadMessages, 120);
    } catch {
      toast(t('chat_send_failed'), 'error');
    }
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
      const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      setMessages((items) => [...items, {
        id: clientId,
        clientMsgId: clientId,
        mine: true,
        text: `🎤 ${ui.voiceMessage}`,
        voice: true,
        mediaUrl: result.uri,
        voiceDuration: duration,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        optimistic: true,
      }]);
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 60);
      const upload = await chatAPI.uploadChatVoice(result.uri);
      if (!upload?.voice_key) throw new Error('voice_upload');
      await chatAPI.send({
        roomId,
        toUserId: recipientId,
        text: `🎤 ${ui.voiceMessage}`,
        photoUrl: upload.voice_key,
        isVoice: true,
        voiceDuration: duration,
        cargoId: deal?.cargo_id || params.cargoId || null,
        tripId: deal?.trip_id || params.tripId || null,
        clientMsgId: clientId,
      });
      setTimeout(loadMessages, 120);
    } catch { toast(t('chat_send_failed'), 'error'); }
  }, [recording, roomId, recipientId, deal?.cargo_id, deal?.trip_id, params.cargoId, params.tripId, ui.voiceMessage, loadMessages, toast, t]);

  const cancelRecording = React.useCallback(async () => {
    setRecording(false);
    try { await voice.stopRecording(); } catch {}
  }, []);

  const renderMessage = React.useCallback(({ item }) => {
    if (item.system) {
      return (
        <View style={s.systemRow}>
          <Text style={[s.systemText, { color: colors.textMuted }]}>{item.text}</Text>
        </View>
      );
    }
    return (
      <View style={[s.messageRow, item.mine ? s.messageMine : s.messageThem]}>
        <View style={[
          s.bubble,
          item.mine ? s.bubbleMine : s.bubbleThem,
          !item.mine && { borderColor: colors.border, backgroundColor: colors.surface },
        ]}>
          {item.photo && item.mediaUrl ? (
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => setImagePreview({ uri: item.mediaUrl, time: item.time })}
              testID="deal-chat-image-open"
            >
              <Image source={{ uri: item.mediaUrl }} style={s.photo} />
            </TouchableOpacity>
          ) : null}
          {item.voice ? (
            <TouchableOpacity onPress={() => item.mediaUrl && voice.play(item.mediaUrl)} style={s.voiceRow}>
              <Feather name="play" size={15} color={item.mine ? '#FFFFFF' : colors.text} />
              <Text style={{ color: item.mine ? '#FFFFFF' : colors.text, fontWeight: '700' }}>
                {ui.voiceMessage}{item.voiceDuration ? ` · ${item.voiceDuration}${t('unit_sec_short')}` : ''}
              </Text>
            </TouchableOpacity>
          ) : item.text ? (
            <Text style={[s.messageText, { color: item.mine ? '#FFFFFF' : colors.text }]}>{item.text}</Text>
          ) : null}
          <Text style={[s.messageTime, { color: item.mine ? 'rgba(255,255,255,0.68)' : colors.textMuted }]}>{item.time}</Text>
        </View>
      </View>
    );
  }, [colors, ui.voiceMessage, t]);

  const latestMessage = messages.length ? messages[messages.length - 1] : null;
  const meta = [
    deal?.cargo_desc || null,
    deal?.amount != null ? formatPrice(deal.amount, deal.currency || 'USD', t) : null,
    deal?.plate || null,
  ].filter(Boolean).join(' · ');
  const partnerName = partner?.name || deal?.counterparty_name || null;
  const routeLabel = `${localizePlace(from, language)} → ${localizePlace(to, language)}`;
  const statusLabel = formatStatus(userFacingDealStatus(deal?.status || 'accepted'));

  const showTab = (tab) => {
    setSheetTab(tab);
    setAttachOpen(false);
    if (sheetState === 'collapsed') setSheet('expanded');
  };

  const cancelDeal = async () => {
    const ok = await askConfirm(ui.cancelDeal, ui.cancelDealConfirm, ui.cancelDeal, true);
    if (ok) await changeDealStatus('cancelled');
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]} edges={['top']} testID="deal-workspace-screen">
      <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={[s.compactHeader, { borderBottomColor: colors.border, backgroundColor: colors.bg }]} testID="deal-compact-header">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={s.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID="deal-workspace-back"
          >
            <Feather name="chevron-left" size={27} color={colors.text} />
          </TouchableOpacity>
          <View style={s.headerText}>
            <View style={s.routeHeaderRow}>
              <Text style={[s.routeTitle, { color: colors.text }]} numberOfLines={1}>{routeLabel}</Text>
              <View style={s.statusPill}>
                <View style={s.statusDot} />
                <Text style={s.statusPillText} numberOfLines={1}>{statusLabel}</Text>
              </View>
            </View>
            {meta ? <Text style={[s.metaText, { color: colors.textMuted }]} numberOfLines={1}>{meta}</Text> : null}
            {partnerName ? (
              <Text style={[s.partnerText, { color: colors.textMuted }]} numberOfLines={1}>
                {isDriver ? ui.shipper : ui.driver}: {partnerName}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={s.mapArea} testID="deal-map-first-area">
          {dealLoading && !dealId ? (
            <View style={[s.center, { backgroundColor: colors.bg }]}>
              <ActivityIndicator color="#168759" />
              <Text style={[s.loadingText, { color: colors.textMuted }]}>{ui.loading}</Text>
            </View>
          ) : (
            <TruckMap
              lat={hasLivePoint ? lat : undefined}
              lng={hasLivePoint ? lng : undefined}
              title={partnerName || t('track_truck_marker')}
              routePoints={routePoints}
              planned={!hasLivePoint}
              showBadge={false}
              onRouteSummary={onRouteSummary}
            />
          )}

          {updatedText ? (
            <View style={[s.updatedPill, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="none">
              <Feather name="refresh-cw" size={12} color="#168759" />
              <Text style={[s.updatedText, { color: colors.text }]}>{updatedText}</Text>
            </View>
          ) : locationLoading && trackingActive ? (
            <View style={[s.updatedPill, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="none">
              <ActivityIndicator size="small" color="#168759" />
            </View>
          ) : null}

          {nextAction ? (
            <TouchableOpacity
              style={[s.floatingAction, { backgroundColor: nextAction.disabled ? '#E4E8E5' : '#168759' }]}
              onPress={runNextAction}
              disabled={nextAction.disabled || statusLoading || trackingLoading}
              testID={nextAction.key === 'in_progress' ? 'deal-action-start-delivery' : nextAction.key === 'delivered' ? 'deal-action-mark-arrived' : nextAction.key === 'completed' ? 'deal-action-confirm-receipt' : 'deal-action-next'}
            >
              <Feather name={nextAction.icon} size={15} color={nextAction.disabled ? '#7C8B82' : '#FFFFFF'} />
              <Text style={[s.floatingActionText, { color: nextAction.disabled ? '#7C8B82' : '#FFFFFF' }]} numberOfLines={1}>
                {statusLoading || trackingLoading ? '…' : nextAction.label}
              </Text>
            </TouchableOpacity>
          ) : null}

          <View style={[s.mapQuickRow, { bottom: collapsedHeight + (routeSummary ? 88 : 16) }]}>
            <TouchableOpacity style={[s.mapQuick, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => showTab('docs')} testID="deal-documents-chip">
              <Feather name="file-text" size={15} color="#168759" />
              <Text style={[s.mapQuickText, { color: colors.text }]}>{ui.documents}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.mapQuick, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => showTab('status')} testID="deal-statuses-chip">
              <Feather name="activity" size={15} color="#168759" />
              <Text style={[s.mapQuickText, { color: colors.text }]}>{ui.statuses}</Text>
            </TouchableOpacity>
          </View>

          {routeSummary ? (
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
            <View style={[s.dragHandle, { backgroundColor: '#C7CEC9' }]} />
          </View>

          <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={s.sheetTitleTouch}
              onPress={() => sheetState === 'collapsed' ? setSheet('expanded') : setSheet('collapsed')}
              testID="deal-chat-toggle"
            >
              <View style={s.chatIconBox}><Feather name="message-circle" size={18} color="#168759" /></View>
              <View style={s.sheetTitleText}>
                <View style={s.sheetTitleRow}>
                  <Text style={[s.sheetTitle, { color: colors.text }]}>{sheetTab === 'chat' ? ui.messages : sheetTab === 'docs' ? ui.documents : ui.statuses}</Text>
                  {sheetTab === 'chat' && unreadCount > 0 ? <Text style={s.newCount}>{unreadCount} {ui.newMessages}</Text> : null}
                </View>
                {sheetState === 'collapsed' && sheetTab === 'chat' ? (
                  <Text style={[s.preview, { color: colors.textMuted }]} numberOfLines={1}>
                    {latestMessage?.text || (latestMessage?.voice ? ui.voiceMessage : latestMessage?.photo ? ui.attachPhoto : ui.noMessages)}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
            {sheetState !== 'collapsed' ? (
              <TouchableOpacity onPress={() => setSheet('collapsed')} style={s.collapseButton} testID="deal-chat-collapse">
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setSheet('expanded')} style={s.collapseButton}>
                <Feather name="chevron-up" size={20} color={colors.text} />
              </TouchableOpacity>
            )}
          </View>

          {sheetState !== 'collapsed' ? (
            <>
              <View style={s.tabRow}>
                {[['chat', ui.messages, 'message-circle'], ['docs', ui.documents, 'file-text'], ['status', ui.statuses, 'activity']].map(([key, label, icon]) => (
                  <TouchableOpacity key={key} style={[s.tab, sheetTab === key && s.tabActive]} onPress={() => setSheetTab(key)} testID={`deal-sheet-tab-${key}`}>
                    <Feather name={icon} size={14} color={sheetTab === key ? '#168759' : colors.textMuted} />
                    <Text style={[s.tabText, { color: sheetTab === key ? '#168759' : colors.textMuted }]} numberOfLines={1}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {sheetTab === 'chat' ? (
                <>
                  <FlatList
                    ref={listRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    style={s.messageList}
                    contentContainerStyle={s.messageContent}
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
                    ListEmptyComponent={<Text style={[s.emptyText, { color: colors.textMuted }]}>{ui.noMessages}</Text>}
                  />

                  {recording ? (
                    <View style={s.recordBar} testID="deal-chat-recording-bar">
                      <View style={s.recordDot} />
                      <Text style={s.recordText}>{ui.recording} 0:{String(recordSecs % 60).padStart(2, '0')}</Text>
                      <TouchableOpacity onPress={cancelRecording} style={s.recordCancelBtn} testID="deal-chat-recording-cancel">
                        <Feather name="trash-2" size={15} color="#B91C1C" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={toggleVoice} style={s.recordStopBtn} testID="deal-chat-recording-stop">
                        <Feather name="square" size={13} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {attachOpen ? (
                    <View style={[s.attachMenu, { borderTopColor: colors.border, backgroundColor: colors.bg }]} testID="deal-chat-attach-menu">
                      <TouchableOpacity style={s.attachItem} onPress={() => sendPhoto(false)}>
                        <View style={s.attachIcon}><Feather name="image" size={20} color="#168759" /></View>
                        <Text style={[s.attachLabel, { color: colors.text }]}>{ui.attachPhoto}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.attachItem} onPress={() => sendPhoto(true)}>
                        <View style={s.attachIcon}><Feather name="camera" size={20} color="#168759" /></View>
                        <Text style={[s.attachLabel, { color: colors.text }]}>{ui.attachCamera}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.attachItem} onPress={() => { setAttachOpen(false); setSheetTab('docs'); }}>
                        <View style={s.attachIcon}><Feather name="file-text" size={20} color="#168759" /></View>
                        <Text style={[s.attachLabel, { color: colors.text }]}>{ui.attachDocument}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <View style={[s.composer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]} testID="deal-chat-composer">
                    <TouchableOpacity
                      style={[s.composerIcon, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      onPress={() => setAttachOpen((value) => !value)}
                      testID="deal-chat-attach"
                    >
                      <Feather name="plus" size={21} color={colors.text} />
                    </TouchableOpacity>
                    <TextInput
                      value={input}
                      onChangeText={(value) => { setInput(value); if (roomId) chatAPI.typing(roomId); }}
                      onFocus={() => { setAttachOpen(false); setSheet('full'); }}
                      onContentSizeChange={(event) => setInputHeight(Math.max(44, Math.min(108, Math.ceil(event.nativeEvent.contentSize.height + 18))))}
                      multiline
                      style={[s.input, { height: inputHeight, color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                      placeholder={isDriver ? ui.writeShipper : ui.write}
                      placeholderTextColor={colors.textMuted}
                      testID="deal-chat-input"
                    />
                    {!recording && input.trim() ? (
                      <TouchableOpacity style={s.sendButton} onPress={sendText} testID="deal-chat-send">
                        <FontAwesome5 name="paper-plane" size={15} color="#FFFFFF" solid />
                      </TouchableOpacity>
                    ) : !recording ? (
                      <TouchableOpacity style={s.sendButton} onPress={toggleVoice} testID="deal-chat-voice">
                        <Feather name="mic" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </>
              ) : sheetTab === 'docs' ? (
                <View style={s.panelBody} testID="deal-documents-panel">
                  <DealAttachments conversationId={roomId} role={role} compact />
                </View>
              ) : (
                <View style={s.panelBody} testID="deal-status-panel">
                  <FlatList
                    data={timeline}
                    keyExtractor={(item, index) => String(item.id || item.event_type || index)}
                    renderItem={({ item }) => <SystemEventRow ev={item} />}
                    contentContainerStyle={{ paddingBottom: 24 }}
                    ListEmptyComponent={<Text style={[s.emptyText, { color: colors.textMuted }]}>{statusLabel}</Text>}
                  />
                  {deal?.status === 'accepted' ? (
                    <TouchableOpacity style={s.cancelLink} onPress={cancelDeal} testID="deal-cancel-link">
                      <Text style={s.cancelLinkText}>{ui.cancelDeal}</Text>
                    </TouchableOpacity>
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
        <Modal visible={!!imagePreview} transparent animationType="fade" onRequestClose={() => setImagePreview(null)}>
          <View style={s.imageViewer} testID="deal-chat-image-viewer">
            <TouchableOpacity style={s.imageViewerClose} onPress={() => setImagePreview(null)} testID="deal-chat-image-close">
              <Feather name="x" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            {imagePreview?.uri ? (
              <Image source={{ uri: imagePreview.uri }} style={s.imageViewerImage} resizeMode="contain" />
            ) : null}
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  compactHeader: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  headerText: { flex: 1, minWidth: 0, paddingRight: 10 },
  routeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  routeTitle: { flex: 1, fontSize: 19, fontWeight: '900', letterSpacing: -0.35 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#E9F6EF' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#168759' },
  statusPillText: { color: '#168759', fontSize: 11.5, fontWeight: '800', maxWidth: 104 },
  metaText: { fontSize: 12.5, fontWeight: '650', marginTop: 1 },
  partnerText: { fontSize: 11.5, marginTop: 3 },
  mapArea: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#EAF1ED' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { fontSize: 13, fontWeight: '700' },
  updatedPill: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  updatedText: { fontSize: 11.5, fontWeight: '800' },
  floatingAction: { position: 'absolute', right: 12, top: 12, maxWidth: '58%', minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 999, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  floatingActionText: { fontSize: 12.5, fontWeight: '900', flexShrink: 1 },
  mapQuickRow: { position: 'absolute', left: 12, flexDirection: 'row', gap: 8 },
  mapQuick: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  mapQuickText: { fontSize: 12.5, fontWeight: '800' },
  metricsCard: { position: 'absolute', left: 12, right: 12, minHeight: 70, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  metricCell: { flex: 1, minWidth: 0 },
  metricLabel: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.35, marginBottom: 3 },
  metricValue: { fontSize: 18, fontWeight: '900' },
  metricDivider: { width: 1, alignSelf: 'stretch', marginHorizontal: 14 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderBottomWidth: 0, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: -5 }, elevation: 12, zIndex: 30 },
  dragZone: { height: 20, alignItems: 'center', justifyContent: 'center' },
  dragHandle: { width: 42, height: 5, borderRadius: 3 },
  sheetHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitleTouch: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatIconBox: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#E9F6EF', alignItems: 'center', justifyContent: 'center' },
  sheetTitleText: { flex: 1, minWidth: 0 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '900' },
  newCount: { color: '#168759', fontSize: 12, fontWeight: '800' },
  preview: { fontSize: 12.5, marginTop: 2 },
  collapseButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tabRow: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 },
  tab: { flex: 1, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12 },
  tabActive: { backgroundColor: '#E9F6EF' },
  tabText: { fontSize: 11.5, fontWeight: '800' },
  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12 },
  messageRow: { marginBottom: 10 },
  messageMine: { alignItems: 'flex-end' },
  messageThem: { alignItems: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8 },
  bubbleMine: { backgroundColor: '#168759', borderBottomRightRadius: 5 },
  bubbleThem: { borderWidth: 1, borderBottomLeftRadius: 5 },
  messageText: { fontSize: 14.5, lineHeight: 20 },
  messageTime: { fontSize: 10.5, marginTop: 4, textAlign: 'right' },
  systemRow: { alignItems: 'center', marginVertical: 5 },
  systemText: { fontSize: 11.5, fontWeight: '650', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(124,139,130,0.12)', borderRadius: 999 },
  photo: { width: 210, height: 150, borderRadius: 11, marginBottom: 4 },
  imageViewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  imageViewerImage: { width: '100%', height: '86%' },
  imageViewerClose: { position: 'absolute', top: 46, right: 18, zIndex: 2, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  voiceRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyText: { textAlign: 'center', marginTop: 24, fontSize: 13 },
  recordBar: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15, paddingVertical: 7, backgroundColor: 'rgba(239,68,68,0.08)' },
  recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  recordText: { color: '#B91C1C', fontSize: 12, fontWeight: '800', flex: 1 },
  recordCancelBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  recordStopBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center' },
  attachMenu: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  attachItem: { flex: 1, minHeight: 74, alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 18, backgroundColor: '#F5FAF7', borderWidth: 1, borderColor: '#DDEBE4' },
  attachIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E4F5EC' },
  attachLabel: { fontSize: 11.5, fontWeight: '850' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth },
  composerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 108, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 10, fontSize: 14.5, lineHeight: 19 },
  sendButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#168759' },
  recordingButton: { backgroundColor: '#EF4444' },
  panelBody: { flex: 1, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12 },
  cancelLink: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 10, marginTop: 4 },
  cancelLinkText: { color: '#EF4444', fontSize: 12.5, fontWeight: '750' },
});
