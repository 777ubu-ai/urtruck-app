import React from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import * as DocumentPicker from 'expo-document-picker';

import TruckMap from '../components/TruckMap';
import DealStatusTimeline from '../components/deal/DealStatusTimeline';
import AppConfirmModal from '../components/ui/AppConfirmModal';
import { chatAPI, documentKindFromFile } from '../utils/chatAPI';
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
import {
  ensureBackgroundLocationPermission,
  getCurrentLocationPayload,
  requestForegroundLocationPermission,
} from '../utils/backgroundLocation';
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

// WhatsApp-style chat is the default view; the trip map is a deliberate,
// button-triggered secondary view (PR #255 review: "map-first бардак" was the
// prior design — chat must never be pushed off-screen by the map again).
const VIEW_CHAT = 'chat';
const VIEW_MAP = 'map';

const DOC_ATTACH_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv', 'text/comma-separated-values', 'application/csv', // .csv
];

const COPY = {
  RU: {
    messages: 'Сообщения',
    write: 'Написать водителю…', writeShipper: 'Написать грузоотправителю…',
    distance: 'Расстояние', remaining: 'Осталось', travelTime: 'Время', eta: 'ETA',
    updatedNow: 'Обновлено сейчас', updated: 'Обновлено', ago: 'назад', min: 'мин', hour: 'ч', day: 'д',
    cargo: 'Груз', driver: 'Водитель', shipper: 'Грузоотправитель',
    noMessages: 'Сообщений пока нет', attachPhoto: 'Фото', attachCamera: 'Камера', attachDocument: 'Документ',
    attachLocation: 'Местопол.', attachQuickReply: 'Быстрый ответ', attachCall: 'Звонок', attachTranslate: 'Перевод',
    callAudio: 'Аудиозвонок', callVideo: 'Видеозвонок', callSendLink: 'Отправить ссылку на звонок',
    callSchedule: 'Запланировать звонок', comingSoon: 'Скоро добавим',
    recording: 'Идёт запись…', voiceMessage: 'Голосовое сообщение',
    cancelDeal: 'Отменить сделку', cancelDealConfirm: 'Отменить эту сделку?', loading: 'Загрузка сделки…',
    loadingDate: 'Загрузка', deliveryDate: 'Доставка', collapseMap: 'Свернуть карту',
    tripFinished: 'Сделка завершена', tripDelivered: 'Груз доставлен', awaitingReceiptStatus: 'Ожидает подтверждения', tripAwaitingReceipt: 'Ожидаем подтверждения грузоотправителя', tripAwaitingReceiptHint: 'Водитель отметил груз как доставленный. Сделка завершится после подтверждения получения.', tripReceived: 'Получение подтверждено', mapFinishedHint: 'Live GPS для этого рейса больше не используется.',
    jumpLatest: 'Новые сообщения', statuses: 'Статусы и история',
  },
  EN: {
    messages: 'Messages',
    write: 'Message driver…', writeShipper: 'Message shipper…',
    distance: 'Distance', remaining: 'Remaining', travelTime: 'Time', eta: 'ETA',
    updatedNow: 'Updated now', updated: 'Updated', ago: 'ago', min: 'min', hour: 'h', day: 'd',
    cargo: 'Cargo', driver: 'Driver', shipper: 'Shipper',
    noMessages: 'No messages yet', attachPhoto: 'Photo', attachCamera: 'Camera', attachDocument: 'Document',
    attachLocation: 'Location', attachQuickReply: 'Quick reply', attachCall: 'Call', attachTranslate: 'Translate',
    callAudio: 'Audio call', callVideo: 'Video call', callSendLink: 'Send call link',
    callSchedule: 'Schedule a call', comingSoon: 'Coming soon',
    recording: 'Recording…', voiceMessage: 'Voice message',
    cancelDeal: 'Cancel deal', cancelDealConfirm: 'Cancel this deal?', loading: 'Loading deal…',
    loadingDate: 'Pickup', deliveryDate: 'Delivery', collapseMap: 'Collapse map',
    tripFinished: 'Deal completed', tripDelivered: 'Cargo delivered', awaitingReceiptStatus: 'Awaiting confirmation', tripAwaitingReceipt: 'Awaiting shipper confirmation', tripAwaitingReceiptHint: 'The driver marked the cargo as delivered. The deal is completed after receipt is confirmed.', tripReceived: 'Receipt confirmed', mapFinishedHint: 'Live GPS is no longer used for this trip.',
    jumpLatest: 'New messages', statuses: 'Status & history',
  },
  ZH: {
    messages: '消息',
    write: '给司机发消息…', writeShipper: '给货主发消息…',
    distance: '距离', remaining: '剩余', travelTime: '时间', eta: '预计时间',
    updatedNow: '刚刚更新', updated: '更新于', ago: '前', min: '分钟', hour: '小时', day: '天',
    cargo: '货物', driver: '司机', shipper: '货主',
    noMessages: '暂无消息', attachPhoto: '照片', attachCamera: '相机', attachDocument: '文件',
    attachLocation: '位置', attachQuickReply: '快速回复', attachCall: '通话', attachTranslate: '翻译',
    callAudio: '语音通话', callVideo: '视频通话', callSendLink: '发送通话链接',
    callSchedule: '安排通话', comingSoon: '即将推出',
    recording: '正在录音…', voiceMessage: '语音消息',
    cancelDeal: '取消交易', cancelDealConfirm: '确认取消这笔交易？', loading: '正在加载交易…',
    loadingDate: '装货', deliveryDate: '送达', collapseMap: '收起地图',
    tripFinished: '交易已完成', tripDelivered: '货物已送达', awaitingReceiptStatus: '等待确认', tripAwaitingReceipt: '等待货主确认收货', tripAwaitingReceiptHint: '司机已标记货物送达。货主确认收货后，交易才能完成。', tripReceived: '已确认收货', mapFinishedHint: '本次运输已停止实时 GPS。',
    jumpLatest: '新消息', statuses: '状态与历史',
  },
  KK: {
    messages: 'Хабарламалар',
    write: 'Жүргізушіге жазу…', writeShipper: 'Жүк иесіне жазу…',
    distance: 'Қашықтық', remaining: 'Қалды', travelTime: 'Уақыт', eta: 'ETA',
    updatedNow: 'Қазір жаңартылды', updated: 'Жаңартылды', ago: 'бұрын', min: 'мин', hour: 'сағ', day: 'күн',
    cargo: 'Жүк', driver: 'Жүргізуші', shipper: 'Жүк иесі',
    noMessages: 'Әзірге хабарлама жоқ', attachPhoto: 'Фото', attachCamera: 'Камера', attachDocument: 'Құжат',
    attachLocation: 'Орналасу', attachQuickReply: 'Жылдам жауап', attachCall: 'Қоңырау', attachTranslate: 'Аудару',
    callAudio: 'Аудиоқоңырау', callVideo: 'Бейнеқоңырау', callSendLink: 'Қоңырау сілтемесін жіберу',
    callSchedule: 'Қоңырауды жоспарлау', comingSoon: 'Жақында қосамыз',
    recording: 'Жазылып жатыр…', voiceMessage: 'Дауыстық хабарлама',
    cancelDeal: 'Мәмілені болдырмау', cancelDealConfirm: 'Осы мәмілені болдырмау керек пе?', loading: 'Мәміле жүктелуде…',
    loadingDate: 'Тиеу', deliveryDate: 'Жеткізу', collapseMap: 'Картаны жию',
    tripFinished: 'Мәміле аяқталды', tripDelivered: 'Жүк жеткізілді', awaitingReceiptStatus: 'Растауды күтуде', tripAwaitingReceipt: 'Жүк иесінің қабылдауды растауын күтеміз', tripAwaitingReceiptHint: 'Жүргізуші жүкті жеткізілді деп белгіледі. Жүк иесі қабылдауды растағаннан кейін мәміле аяқталады.', tripReceived: 'Қабылдау расталды', mapFinishedHint: 'Бұл рейсте live GPS енді қолданылмайды.',
    jumpLatest: 'Жаңа хабарламалар', statuses: 'Мәртебе және тарих',
  },
};

const resolveAttachment = (value) =>
  value && typeof value === 'string' && value.startsWith('/') ? `${SERVER_URL}${value}` : value;

// SQLite stores naive-UTC TEXT timestamps (no timezone suffix). Both
// chat_messages.created_at and message_attachments.created_at use the same
// CURRENT_TIMESTAMP format, so one normalizer covers formatting AND the
// merge-sort that interleaves text/photo/voice messages with document
// attachments into a single chronological feed.
const parseServerDate = (raw) => {
  if (!raw) return null;
  let value = String(raw);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(value)) {
    value = value.replace(' ', 'T') + 'Z';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const fmtMessageTime = (raw) => {
  const date = parseServerDate(raw);
  return date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : String(raw || '').slice(11, 16);
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

const formatBytes = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
};

const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const newClientId = (prefix = 'c') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// A CGR-style Yandex Maps deep link. Real, openable pin — not a promise of an
// in-app live-location feature the "Местопол." button never claimed to be.
const yandexMapsLink = (lat, lng) => `https://yandex.ru/maps/?pt=${lng},${lat}&z=16&l=map`;

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
  const [viewMode, setViewMode] = React.useState(VIEW_CHAT);
  const [attachOpen, setAttachOpen] = React.useState(false);
  const [callMenuOpen, setCallMenuOpen] = React.useState(false);
  const [statusModalOpen, setStatusModalOpen] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [recordSecs, setRecordSecs] = React.useState(0);
  const [confirmDialog, setConfirmDialog] = React.useState(null);
  const [showJumpLatest, setShowJumpLatest] = React.useState(false);
  const [fullImage, setFullImage] = React.useState(null);
  const [locationSending, setLocationSending] = React.useState(false);
  const [translations, setTranslations] = React.useState({});
  const [translating, setTranslating] = React.useState(null);
  const [autoTranslate, setAutoTranslate] = React.useState(false);

  const listRef = React.useRef(null);
  const mounted = React.useRef(true);
  const recordStartRef = React.useRef(0);
  const nearBottomRef = React.useRef(true);
  const lastCountRef = React.useRef(0);
  // A signed attachment URL may be reissued on every 3s poll. Keep the first
  // valid URL per immutable message/attachment id so an already-shown photo
  // is never remounted/flashed (PR #255 review item 4: "не должно быть
  // мигания фото при polling"; ported from the same fix in ChatScreen.js).
  const attachmentUrlCache = React.useRef(new Map());
  const role = params.role || session?.user?.role || 'client';
  const isDriver = role === 'driver';
  const isShipper = !isDriver;
  const language = getLanguage();

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

  // Section 2: focusing the composer must close every overlay that could
  // otherwise sit on top of it (attach menu, call menu). The map itself
  // cannot be open while the composer is mounted — it only renders in
  // viewMode === 'chat' — so this already satisfies "закрывать карту" by
  // construction, not by an extra branch.
  const onComposerFocus = React.useCallback(() => {
    setAttachOpen(false);
    setCallMenuOpen(false);
  }, []);

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

  // Documents render as ordinary bubbles in the same list as text/photo/voice
  // (PR #255 review item 5: "не отдельной нижней панелью, а как обычное
  // сообщение в ленте"). The backend keeps documents in message_attachments,
  // separate from chat_messages, so each poll merges both by created_at —
  // deliberately NOT a chat_messages schema change (see commit message).
  const loadMessages = React.useCallback(async () => {
    if (!roomId) return;
    try {
      const [result, attachResult] = await Promise.all([
        chatAPI.messages(roomId),
        chatAPI.listAttachments(roomId).catch(() => ({ attachments: [] })),
      ]);
      if (!mounted.current) return;
      const mapped = (result?.messages || []).map((message) => {
        const mine = typeof message.mine === 'boolean' ? message.mine : message.sender_id === session?.user?.id;
        const isVoice = !!message.is_voice;
        const system = message.sender_id === 'system';
        const cacheKey = `${isVoice ? 'voice' : 'photo'}:${message.id}`;
        const issuedUrl = resolveAttachment(message.photo_url);
        let mediaUrl = issuedUrl;
        if (issuedUrl) {
          mediaUrl = attachmentUrlCache.current.get(cacheKey) || issuedUrl;
          attachmentUrlCache.current.set(cacheKey, mediaUrl);
        }
        return {
          id: String(message.id),
          clientMsgId: message.client_msg_id || null,
          mine, system,
          text: system ? localizeSystemMessage(message.text || '', lang) : (message.text || ''),
          photo: !!message.photo_url && !isVoice,
          voice: isVoice,
          mediaUrl,
          voiceDuration: Number(message.voice_duration || 0),
          time: fmtMessageTime(message.created_at),
          createdAt: message.created_at,
          read: !!message.is_read,
        };
      });
      const serverDocs = (attachResult?.attachments || [])
        .filter((a) => a.kind === 'document')
        .map((a) => {
          const cacheKey = `doc:${a.id}`;
          const issuedUrl = resolveAttachment(a.url);
          let docUrl = issuedUrl;
          if (issuedUrl) {
            docUrl = attachmentUrlCache.current.get(cacheKey) || issuedUrl;
            attachmentUrlCache.current.set(cacheKey, docUrl);
          }
          return {
            id: `doc_${a.id}`,
            clientUploadId: a.client_upload_id || null,
            mine: a.uploader_id === session?.user?.id,
            kind: 'document',
            docName: a.original_name || a.id,
            docSize: a.size_bytes,
            docKind: documentKindFromFile(a.mime_type, a.original_name),
            docUrl,
            docStatus: 'uploaded',
            time: fmtMessageTime(a.created_at),
            createdAt: a.created_at,
          };
        });
      const merged = [...mapped, ...serverDocs].sort((x, y) => {
        const dx = parseServerDate(x.createdAt)?.getTime() || 0;
        const dy = parseServerDate(y.createdAt)?.getTime() || 0;
        return dx - dy;
      });
      setMessages((previous) => {
        const optimisticRemaining = previous.filter((item) => {
          if (!item.optimistic) return false;
          if (item.kind === 'document') return !serverDocs.some((d) => d.clientUploadId === item.id);
          return !merged.some((server) => server.clientMsgId === item.id || (server.mine && item.text && server.text === item.text));
        });
        return [...merged, ...optimisticRemaining];
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

  React.useEffect(() => {
    if (!autoTranslate) return undefined;
    let cancelled = false;
    const pending = messages.filter((m) => m?.id && !m.mine && !m.system && m.text && !m.photo && !m.voice && !translations[m.id]);
    if (!pending.length) return undefined;
    (async () => {
      for (const item of pending.slice(0, 6)) {
        try {
          const result = await chatAPI.translate(item.id, getLanguage().toLowerCase());
          if (!cancelled && result?.translated_text) {
            setTranslations((prev) => (prev[item.id] ? prev : ({
              ...prev,
              [item.id]: { text: result.translated_text, provider: result.provider, showOriginal: false },
            })));
          }
        } catch { /* translation is an assistive layer, never blocks chat */ }
      }
    })();
    return () => { cancelled = true; };
  }, [autoTranslate, messages, translations]);

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
      if (!mounted.current) return;
      if (result?.has_location && result.location) setLocation(result.location);
      // P1 (аудит 2026-08-21): раньше ветки else не было — если сервер
      // авторитетно отвечал has_location:false (водитель остановил трекинг,
      // согласие отозвано, запись удалена), последняя точка навсегда
      // оставалась на карте грузоотправителя со счётчиком «обновлено N минут
      // назад». Гасим ТОЛЬКО по успешному ответу (result.ok === true):
      // сетевая ошибка отдаёт ok:false и не должна стирать валидную позицию.
      else if (result?.ok === true) setLocation(null);
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
    const date = parseServerDate(location?.updated_at);
    if (!date) return null;
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

  // Shared by the composer, quick-reply, and call-link — every "send a fixed
  // string" action funnels through here so error handling (section 6) is
  // written once. Returns the local optimistic id so callers can retry.
  const sendRawText = React.useCallback(async (body) => {
    if (!body || (!roomId && !recipientId)) return;
    const clientId = newClientId();
    setMessages((items) => [...items, {
      id: clientId, mine: true, text: body, time: nowTime(), optimistic: true, sendStatus: 'sending',
    }]);
    setAttachOpen(false);
    setCallMenuOpen(false);
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
        setMessages((items) => items.map((m) => (m.id === clientId ? { ...m, sendStatus: 'queued' } : m)));
        return;
      }
      // Section 6: never silently drop the bubble — surface the real reason.
      // 403 is a known, finite case (chat gated until deal accepted) so it
      // gets a fully localized message; 400 varies per input and the owner
      // explicitly asked to show backend detail for it (accepted trade-off:
      // backend error strings are Russian-only, same as the rest of the API —
      // see CLAUDE.md's known non-blocking findings).
      const errorText = error?.status === 403
        ? t('chat_error_403')
        : error?.status === 400 && error?.detail
          ? `${t('chat_error_prefix')}: ${error.detail}`
          : t('chat_send_failed');
      toast(errorText, 'error');
      setMessages((items) => items.map((m) => (m.id === clientId ? { ...m, sendStatus: 'failed', sendError: errorText } : m)));
    }
  }, [roomId, recipientId, deal?.cargo_id, deal?.trip_id, params.cargoId, params.tripId, loadMessages, session?.user?.id, toast, t]);

  const sendText = React.useCallback(() => {
    const body = input.trim();
    if (!body) return;
    setInput('');
    setInputHeight(44);
    sendRawText(body);
  }, [input, sendRawText]);

  const retryFailedText = React.useCallback((item) => {
    setMessages((items) => items.filter((m) => m.id !== item.id));
    sendRawText(item.text);
  }, [sendRawText]);

  const appendOptimisticVoice = React.useCallback((uri, duration) => {
    const clientId = newClientId();
    setMessages((items) => [...items, {
      id: clientId,
      clientMsgId: clientId,
      mine: true,
      text: `🎤 ${ui.voiceMessage}`,
      voice: true,
      mediaUrl: uri,
      voiceDuration: duration,
      time: nowTime(),
      optimistic: true,
      sendStatus: 'uploading',
    }]);
    nearBottomRef.current = true;
    setShowJumpLatest(false);
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 60);
    return clientId;
  }, [ui.voiceMessage]);

  const sendQuickReply = React.useCallback(() => {
    setAttachOpen(false);
    sendRawText(t('deal_chat_quick_reply'));
  }, [sendRawText, t]);

  const sendCallLink = React.useCallback(() => {
    setCallMenuOpen(false);
    setAttachOpen(false);
    sendRawText(t('deal_chat_call_link_text'));
  }, [sendRawText, t]);

  const toggleAutoTranslate = React.useCallback(() => {
    setAttachOpen(false);
    setAutoTranslate((current) => {
      const next = !current;
      toast(next ? t('autotranslate_on') : t('autotranslate_off'), 'info', 1800);
      return next;
    });
  }, [toast, t]);

  const sendLocation = React.useCallback(async () => {
    setAttachOpen(false);
    if (locationSending) return;
    setLocationSending(true);
    try {
      const permission = await requestForegroundLocationPermission();
      if (!permission.ok) { toast(t('location_denied'), 'error'); return; }
      const point = await getCurrentLocationPayload();
      if (!point) { toast(t('location_denied'), 'error'); return; }
      const link = yandexMapsLink(point.lat, point.lng);
      await sendRawText(`📍 ${t('deal_chat_my_location')}: ${link}`);
    } finally {
      if (mounted.current) setLocationSending(false);
    }
  }, [locationSending, sendRawText, toast, t]);

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
      const clientId = newClientId();
      setMessages((items) => [...items, {
        id: clientId, mine: true, text: '', photo: true, mediaUrl: uri,
        time: nowTime(), optimistic: true,
      }]);
      setAttachOpen(false);
      const upload = await chatAPI.uploadChatPhoto(uri);
      if (!upload?.photo_key) throw new Error('photo_upload');
      await chatAPI.send({
        roomId, toUserId: recipientId, photoUrl: upload.photo_key,
        cargoId: deal?.cargo_id || params.cargoId || null,
        tripId: deal?.trip_id || params.tripId || null,
        clientMsgId: clientId,
      });
      setTimeout(loadMessages, 120);
    } catch (error) {
      toast(error?.isNetwork ? t('no_connection') : t('chat_send_failed'), 'error');
    }
  }, [roomId, recipientId, deal?.cargo_id, deal?.trip_id, params.cargoId, params.tripId, loadMessages, toast, t]);

  // Documents: one clientUploadId drives both the initial attempt and any
  // Retry, mirroring DealAttachments.js's idempotency pattern so a double
  // tap on Retry cannot create a duplicate durable file server-side.
  const uploadDocument = React.useCallback(async (docItem) => {
    setMessages((items) => items.map((m) => (m.id === docItem.id ? { ...m, docStatus: 'uploading', docErrorText: null } : m)));
    try {
      await chatAPI.uploadAttachment(roomId, {
        uri: docItem.docUri, kind: 'document', name: docItem.docName, type: docItem.docMime,
        clientUploadId: docItem.id,
      });
      setTimeout(loadMessages, 120);
    } catch (error) {
      const key = error?.isNetwork ? 'doc_error_network'
        : error?.status === 413 ? 'doc_error_too_large'
          : error?.status === 415 ? 'doc_error_unsupported'
            : (error?.status === 401 || error?.status === 403) ? 'doc_error_forbidden'
              : error?.status >= 500 ? 'doc_error_server'
                : 'doc_error_failed';
      setMessages((items) => items.map((m) => (m.id === docItem.id ? { ...m, docStatus: 'failed', docErrorText: t(key) } : m)));
    }
  }, [roomId, loadMessages, t]);

  const retryDocument = React.useCallback((item) => {
    uploadDocument({ ...item, docStatus: 'retrying' });
  }, [uploadDocument]);

  const pickAndSendDocument = React.useCallback(async () => {
    setAttachOpen(false);
    if (!roomId) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: DOC_ATTACH_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res?.canceled) return;
    const file = res?.assets?.[0];
    if (!file?.uri) return;
    const kind = documentKindFromFile(file.mimeType, file.name);
    const localId = newClientId('doc');
    const docItem = {
      id: localId, mine: true, kind: 'document', optimistic: true,
      docName: file.name || `document.${kind.ext}`,
      docSize: file.size || null,
      docKind: kind,
      docStatus: 'uploading',
      docUri: file.uri,
      docMime: kind.mime,
      time: nowTime(),
    };
    setMessages((items) => [...items, docItem]);
    await uploadDocument(docItem);
  }, [roomId, uploadDocument]);

  const cancelRecording = React.useCallback(async () => {
    setRecording(false);
    try { await voice.stopRecording(); } catch {}
  }, []);

  const toggleVoice = React.useCallback(async () => {
    if (!recording) {
      try {
        const ok = await voice.startRecording();
        if (!ok) { toast(t('voice_error_record'), 'error'); return; }
        recordStartRef.current = Date.now();
        setRecording(true);
      } catch { toast(t('voice_permission'), 'warn'); }
      return;
    }
    setRecording(false);
    let result;
    try {
      result = await voice.stopRecording();
    } catch { toast(t('voice_error_record'), 'error'); return; }
    if (!result?.uri) { toast(t('voice_error_record'), 'error'); return; }
    const duration = result.duration || Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
    const clientId = appendOptimisticVoice(result.uri, duration);
    let upload;
    try {
      upload = await chatAPI.uploadChatVoice(result.uri, {
        blob: result.blob || null,
        type: result.blob?.type || null,
      });
    } catch (error) {
      // Mirror uploadDocument's precise-cause mapping (P0 2026-08-21): the
      // backend now distinguishes "storage unreachable" (503) from "storage
      // rejected the file" (502) instead of one flat error, and 413 is real
      // (voice/backend.py enforces a 10MB cap) — surface all of it instead of
      // one generic message regardless of cause.
      const key = error?.isNetwork ? null
        : error?.status === 413 ? 'doc_error_too_large'
          : error?.status >= 500 ? 'doc_error_server'
            : 'voice_error_upload';
      setMessages((items) => items.map((m) => (
        m.id === clientId
          ? { ...m, sendStatus: 'failed', sendError: key ? t(key) : t('no_connection') }
          : m
      )));
      toast(key ? t(key) : t('no_connection'), 'error');
      return;
    }
    if (!upload?.voice_key) { toast(t('voice_error_upload'), 'error'); return; }
    setMessages((items) => items.map((m) => (m.id === clientId ? { ...m, sendStatus: 'sending' } : m)));
    const payload = {
      roomId, toUserId: recipientId, text: `🎤 ${ui.voiceMessage}`, photoUrl: upload.voice_key,
      isVoice: true, voiceDuration: duration,
      cargoId: deal?.cargo_id || params.cargoId || null, tripId: deal?.trip_id || params.tripId || null,
      clientMsgId: clientId,
    };
    try {
      const response = await chatAPI.send(payload);
      if (response?.room_id && !roomId) setRoomId(response.room_id);
      setTimeout(loadMessages, 120);
    } catch (error) {
      if (error?.isNetwork) {
        await enqueueOutbox({ clientId, payload }, session?.user?.id);
        toast(t('chat_queued'), 'info', 2200);
        setMessages((items) => items.map((m) => (m.id === clientId ? { ...m, sendStatus: 'queued' } : m)));
        return;
      }
      setMessages((items) => items.map((m) => (m.id === clientId ? { ...m, sendStatus: 'failed', sendError: t('voice_error_send') } : m)));
      toast(t('voice_error_send'), 'error');
    }
  }, [recording, roomId, recipientId, deal?.cargo_id, deal?.trip_id, params.cargoId, params.tripId, ui.voiceMessage, loadMessages, toast, t, appendOptimisticVoice, session?.user?.id]);

  const renderMessage = React.useCallback(({ item }) => {
    if (item.system) return (
      <View style={s.systemRow}><Text style={[s.systemText, { color: colors.textMuted }]}>{item.text}</Text></View>
    );

    if (item.kind === 'document') {
      const meta = item.docKind || {};
      const isBusy = item.docStatus === 'uploading' || item.docStatus === 'queued' || item.docStatus === 'retrying';
      const isFailed = item.docStatus === 'failed';
      return (
        <View style={[s.messageRow, item.mine ? s.messageMine : s.messageThem]}>
          <TouchableOpacity
            activeOpacity={item.docUrl ? 0.72 : 1}
            disabled={!item.docUrl}
            onPress={() => item.docUrl && Linking.openURL(item.docUrl).catch(() => {})}
            style={[s.docBubble, item.mine ? s.bubbleMine : s.bubbleThem, !item.mine && { borderColor: colors.border, backgroundColor: colors.surface }]}
            testID="deal-chat-document-bubble"
          >
            <View style={[s.docIconBox, { backgroundColor: item.mine ? 'rgba(255,255,255,0.18)' : '#E9F6EF' }]}>
              <Feather name={meta.icon || 'file'} size={20} color={item.mine ? '#FFFFFF' : '#168759'} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[s.docName, { color: item.mine ? '#FFFFFF' : colors.text }]}>{item.docName}</Text>
              <Text numberOfLines={1} style={[s.docMeta, { color: isFailed ? (item.mine ? '#FFE1E1' : '#EF4444') : (item.mine ? 'rgba(255,255,255,0.75)' : colors.textMuted) }]}>
                {isFailed
                  ? (item.docErrorText || t('doc_error_failed'))
                  : [formatBytes(item.docSize), isBusy ? t('chat_attach_status_uploading') : t('chat_attach_status_uploaded')].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {isBusy ? <ActivityIndicator size="small" color={item.mine ? '#FFFFFF' : '#168759'} /> : null}
            {isFailed ? (
              <TouchableOpacity onPress={() => retryDocument(item)} style={s.docRetryBtn} testID="deal-chat-document-retry">
                <Feather name="refresh-cw" size={15} color={item.mine ? '#FFFFFF' : '#168759'} />
              </TouchableOpacity>
            ) : item.docUrl ? <Feather name="chevron-right" size={16} color={item.mine ? 'rgba(255,255,255,0.75)' : colors.textMuted} /> : null}
          </TouchableOpacity>
          <Text style={[s.messageTime, { color: colors.textMuted, textAlign: item.mine ? 'right' : 'left' }]}>{item.time}</Text>
        </View>
      );
    }

    return (
      <View style={[s.messageRow, item.mine ? s.messageMine : s.messageThem]}>
        <View style={[s.bubble, item.mine ? s.bubbleMine : s.bubbleThem, !item.mine && { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {item.photo && item.mediaUrl ? (
            <TouchableOpacity onPress={() => setFullImage(item.mediaUrl)} testID="deal-chat-photo-bubble">
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
            <>
              <Text style={[s.messageText, { color: item.mine ? '#FFFFFF' : colors.text }]}>
                {translations[item.id] && !translations[item.id].showOriginal ? translations[item.id].text : item.text}
              </Text>
              {!item.mine && !item.system ? (
                <TouchableOpacity
                  style={s.translateBtn}
                  disabled={translating === item.id}
                  onPress={async () => {
                    const current = translations[item.id];
                    if (current) {
                      setTranslations((prev) => ({ ...prev, [item.id]: { ...current, showOriginal: !current.showOriginal } }));
                      return;
                    }
                    setTranslating(item.id);
                    try {
                      const result = await chatAPI.translate(item.id, getLanguage().toLowerCase());
                      if (result?.translated_text) {
                        setTranslations((prev) => ({
                          ...prev,
                          [item.id]: { text: result.translated_text, provider: result.provider, showOriginal: false },
                        }));
                      } else {
                        toast(t('translation_unavailable'), 'info');
                      }
                    } catch {
                      toast(t('translation_unavailable'), 'info');
                    } finally {
                      setTranslating(null);
                    }
                  }}
                  testID="deal-chat-message-translate"
                >
                  <Feather name="globe" size={11} color={item.mine ? 'rgba(255,255,255,0.65)' : colors.textMuted} />
                  <Text style={[s.translateText, { color: item.mine ? 'rgba(255,255,255,0.68)' : colors.textMuted }]}>
                    {translating === item.id ? '...' : translations[item.id] ? (translations[item.id].showOriginal ? t('hide_original') : t('show_original')) : t('translate')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
          <Text style={[s.messageTime, { color: item.mine ? 'rgba(255,255,255,0.68)' : colors.textMuted }]}>{item.time}</Text>
        </View>
        {item.sendStatus === 'failed' && !item.voice ? (
          <TouchableOpacity onPress={() => retryFailedText(item)} style={s.errorRow} testID="deal-chat-message-retry">
            <Feather name="alert-circle" size={12} color="#EF4444" />
            <Text style={s.errorText} numberOfLines={2}>{item.sendError || t('chat_send_failed')} · {t('chat_attach_retry')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }, [colors, ui.voiceMessage, translations, translating, t, toast, retryDocument, retryFailedText]);

  const latestMessage = messages.length ? messages[messages.length - 1] : null;
  const latestPreview = latestMessage
    ? (latestMessage.kind === 'document' ? `📎 ${latestMessage.docName}` : latestMessage.text || (latestMessage.voice ? ui.voiceMessage : latestMessage.photo ? ui.attachPhoto : ''))
    : ui.noMessages;
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

  const cancelDeal = async () => {
    const ok = await askConfirm(ui.cancelDeal, ui.cancelDealConfirm, ui.cancelDeal, true);
    if (ok) { setStatusModalOpen(false); await changeDealStatus('cancelled'); }
  };

  const openMap = () => { setAttachOpen(false); setCallMenuOpen(false); setViewMode(VIEW_MAP); };
  const closeMap = () => setViewMode(VIEW_CHAT);

  const jumpLatest = () => {
    nearBottomRef.current = true;
    setShowJumpLatest(false);
    listRef.current?.scrollToEnd?.({ animated: true });
  };

  const nextActionTestId = nextAction ? (
    nextAction.key === 'in_progress' ? 'deal-action-start-delivery'
      : nextAction.key === 'delivered' ? 'deal-action-mark-arrived'
        : nextAction.key === 'received' ? 'deal-action-confirm-receipt'
          : nextAction.key === 'completed' ? 'deal-action-complete'
            : 'deal-action-next'
  ) : null;

  const PLUS_MENU = [
    { key: 'photo', icon: 'image', label: ui.attachPhoto, onPress: () => sendPhoto(false) },
    { key: 'camera', icon: 'camera', label: ui.attachCamera, onPress: () => sendPhoto(true) },
    { key: 'document', icon: 'file-text', label: ui.attachDocument, onPress: pickAndSendDocument, testID: 'deal-chat-attach-document' },
    { key: 'location', icon: 'map-pin', label: ui.attachLocation, onPress: sendLocation, busy: locationSending, testID: 'deal-chat-attach-location' },
    { key: 'quick-reply', icon: 'zap', label: ui.attachQuickReply, onPress: sendQuickReply, testID: 'deal-chat-attach-quick-reply' },
    { key: 'translate', icon: 'globe', label: ui.attachTranslate, onPress: toggleAutoTranslate, testID: 'deal-chat-attach-translate' },
    { key: 'call', icon: 'phone', label: ui.attachCall, onPress: () => { setAttachOpen(false); setCallMenuOpen(true); }, testID: 'deal-chat-attach-call' },
  ];

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
          <View style={s.headerActions}>
            <TouchableOpacity
              onPress={() => setCallMenuOpen(true)}
              style={[s.headerIconBtn, { borderColor: colors.border }]}
              testID="deal-header-call"
              accessibilityLabel={ui.attachCall}
            >
              <Feather name="phone" size={16} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setStatusModalOpen(true)}
              style={[s.headerIconBtn, { borderColor: colors.border }]}
              testID="deal-status-open"
              accessibilityLabel={ui.statuses}
            >
              <Feather name="clock" size={16} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {viewMode === VIEW_CHAT ? (
          <View style={s.chatFullscreen} testID="deal-chat-fullscreen">
            {dealLoading && !dealId ? (
              <View style={[s.center, { backgroundColor: colors.bg }]}>
                <ActivityIndicator color="#168759" />
                <Text style={[s.loadingText, { color: colors.textMuted }]}>{ui.loading}</Text>
              </View>
            ) : (
              <>
                {nextAction ? (
                  <TouchableOpacity
                    style={[s.actionBar, { backgroundColor: nextAction.disabled ? '#E4E8E5' : '#168759' }]}
                    onPress={runNextAction}
                    disabled={nextAction.disabled || statusLoading || trackingLoading}
                    testID={nextActionTestId}
                  >
                    <Feather name={nextAction.icon} size={16} color={nextAction.disabled ? '#7C8B82' : '#FFFFFF'} />
                    <Text style={[s.actionBarText, { color: nextAction.disabled ? '#7C8B82' : '#FFFFFF' }]} numberOfLines={1}>
                      {statusLoading || trackingLoading ? '…' : nextAction.label}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {dealId ? (
                  <TouchableOpacity style={[s.mapCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={openMap} testID="deal-map-card-open">
                    <View style={s.mapCardIcon}><Feather name="map" size={17} color="#168759" /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.mapCardTitle, { color: colors.text }]}>{t('deal_map_card_title')}</Text>
                      <Text style={[s.mapCardStatus, { color: colors.textMuted }]} numberOfLines={1}>{statusLabel}</Text>
                    </View>
                    <View style={s.mapCardOpenPill}>
                      <Text style={s.mapCardOpenText}>{t('deal_map_card_open')}</Text>
                      <Feather name="chevron-right" size={14} color="#168759" />
                    </View>
                  </TouchableOpacity>
                ) : null}

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
                    onContentSizeChange={() => { if (nearBottomRef.current) listRef.current?.scrollToEnd?.({ animated: false }); }}
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
                  <View style={s.recordBar} testID="deal-chat-recording-bar">
                    <View style={s.recordDot} />
                    <View style={s.recordWave} pointerEvents="none">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <View key={i} style={[s.recordWaveBar, { height: 5 + (i % 4) * 4 }]} />
                      ))}
                    </View>
                    <Text style={s.recordText}>{ui.recording} 0:{String(recordSecs % 60).padStart(2, '0')}</Text>
                    <TouchableOpacity onPress={cancelRecording} style={s.recordCancelBtn} testID="deal-chat-recording-cancel" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="trash-2" size={15} color="#B91C1C" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={toggleVoice} style={s.recordStopBtn} testID="deal-chat-recording-stop">
                      <Feather name="square" size={13} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {attachOpen ? (
                  <View style={[s.attachMenu, { borderTopColor: colors.border }]} testID="deal-chat-attach-menu">
                    {PLUS_MENU.map((item) => (
                      <TouchableOpacity key={item.key} style={s.attachItem} onPress={item.onPress} testID={item.testID} disabled={item.busy}>
                        <View style={[s.attachIcon, { backgroundColor: colors.surface }]}>
                          {item.busy ? <ActivityIndicator size="small" color="#168759" /> : <Feather name={item.icon} size={20} color={colors.text} />}
                        </View>
                        <Text style={[s.attachLabel, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                <View style={[s.composer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]} testID="deal-chat-composer">
                  <TouchableOpacity
                    style={[s.composerIcon, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => { setAttachOpen((value) => !value); setCallMenuOpen(false); }}
                    testID="deal-chat-attach"
                  >
                    <Feather name="plus" size={21} color={colors.text} />
                  </TouchableOpacity>
                  <TextInput
                    value={input}
                    onChangeText={(value) => { setInput(value); if (roomId) chatAPI.typing(roomId); }}
                    onFocus={onComposerFocus}
                    onContentSizeChange={(event) => setInputHeight(Math.max(44, Math.min(112, Math.ceil(event.nativeEvent.contentSize.height + 18))))}
                    multiline
                    scrollEnabled={inputHeight >= 112}
                    style={[s.input, { height: inputHeight, color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                    placeholder={isDriver ? ui.writeShipper : ui.write}
                    placeholderTextColor={colors.textMuted}
                    testID="deal-chat-input"
                  />
                  {!recording ? (
                    <TouchableOpacity
                      style={[s.composerIcon, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      onPress={() => sendPhoto(true)}
                      testID="deal-chat-camera"
                    >
                      <Feather name="camera" size={19} color={colors.text} />
                    </TouchableOpacity>
                  ) : null}
                  {!recording ? (
                    input.trim() ? (
                      <TouchableOpacity style={s.sendButton} onPress={sendText} testID="deal-chat-send"><FontAwesome5 name="paper-plane" size={15} color="#FFFFFF" solid /></TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={s.sendButton} onPress={toggleVoice} testID="deal-chat-voice"><Feather name="mic" size={18} color="#FFFFFF" /></TouchableOpacity>
                    )
                  ) : null}
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={s.mapFullscreen} testID="deal-map-fullscreen">
            <View style={s.mapArea} testID="deal-map-first-area">
              {showLiveMap ? (
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
                </View>
              )}

              <TouchableOpacity style={[s.mapCollapse, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={closeMap} testID="deal-map-collapse">
                <Feather name="minimize-2" size={17} color={colors.text} />
                <Text style={[s.mapCollapseText, { color: colors.text }]}>{ui.collapseMap}</Text>
              </TouchableOpacity>

              {showLiveMap && updatedText ? (
                <View style={[s.updatedPill, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="none">
                  <Feather name="refresh-cw" size={12} color="#168759" />
                  <Text style={[s.updatedText, { color: colors.text }]}>{updatedText}</Text>
                </View>
              ) : showLiveMap && locationLoading && trackingActive ? (
                <View style={[s.updatedPill, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="none"><ActivityIndicator size="small" color="#168759" /></View>
              ) : null}

              {showLiveMap && routeSummary ? (
                <View style={[s.metricsCard, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="deal-route-metrics" pointerEvents="none">
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

            <TouchableOpacity style={[s.chatDock, { backgroundColor: colors.bg, borderColor: colors.border }]} onPress={closeMap} testID="deal-chat-dock">
              <View style={[s.chatIconBox]}><Feather name="message-circle" size={18} color="#168759" /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.sheetTitleRow}>
                  <Text style={[s.sheetTitle, { color: colors.text }]}>{ui.messages}</Text>
                  {unreadCount > 0 ? <Text style={s.newCount}>{unreadCount}</Text> : null}
                </View>
                <Text style={[s.preview, { color: colors.textMuted }]} numberOfLines={1}>{latestPreview}</Text>
              </View>
              <Feather name="chevron-up" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Photo full-screen viewer — explicit close button, not a reliance on
            the platform's own long-press "save image" menu (section 4). */}
        <Modal visible={!!fullImage} transparent animationType="fade" onRequestClose={() => setFullImage(null)}>
          <Pressable style={s.fullBackdrop} onPress={() => setFullImage(null)} testID="deal-chat-photo-fullscreen">
            {fullImage ? <Image source={{ uri: fullImage }} style={s.fullImage} resizeMode="contain" /> : null}
            <TouchableOpacity style={s.fullClose} onPress={() => setFullImage(null)} testID="deal-chat-photo-close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Feather name="x" size={26} color="#fff" />
            </TouchableOpacity>
          </Pressable>
        </Modal>

        {/* Call menu — only "send call link" is real. Audio/video/schedule are
            explicitly disabled with a "coming soon" label rather than looking
            active (section 9: WebRTC calling does not exist yet). */}
        <Modal visible={callMenuOpen} transparent animationType="fade" onRequestClose={() => setCallMenuOpen(false)}>
          <Pressable style={s.modalBackdrop} onPress={() => setCallMenuOpen(false)}>
            <Pressable style={[s.callMenuCard, { backgroundColor: colors.bg }]} onPress={() => {}} testID="deal-call-menu">
              {[
                { key: 'audio', icon: 'phone', label: ui.callAudio, disabled: true },
                { key: 'video', icon: 'video', label: ui.callVideo, disabled: true },
                { key: 'link', icon: 'link', label: ui.callSendLink, disabled: false, onPress: sendCallLink, testID: 'deal-call-send-link' },
                { key: 'schedule', icon: 'calendar', label: ui.callSchedule, disabled: true },
              ].map((item) => (
                <TouchableOpacity
                  key={item.key}
                  onPress={item.onPress}
                  disabled={item.disabled}
                  style={[s.callMenuRow, { borderBottomColor: colors.border }]}
                  testID={item.testID}
                >
                  <Feather name={item.icon} size={18} color={item.disabled ? colors.textMuted : '#168759'} />
                  <Text style={[s.callMenuLabel, { color: item.disabled ? colors.textMuted : colors.text }]}>{item.label}</Text>
                  {item.disabled ? (
                    <View style={s.comingSoonPill}><Text style={s.comingSoonText}>{ui.comingSoon}</Text></View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Status/history — a single icon-triggered modal instead of a
            permanent second tab (section 12: no redundant tabs when chat is
            already fullscreen). */}
        <Modal visible={statusModalOpen} transparent animationType="slide" onRequestClose={() => setStatusModalOpen(false)}>
          <Pressable style={s.modalBackdrop} onPress={() => setStatusModalOpen(false)}>
            <Pressable style={[s.statusModalCard, { backgroundColor: colors.bg, maxHeight: window.height * 0.75 }]} onPress={() => {}} testID="deal-status-panel">
              <View style={s.statusModalHeader}>
                <Text style={[s.sheetTitle, { color: colors.text }]}>{ui.statuses}</Text>
                <TouchableOpacity onPress={() => setStatusModalOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="x" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={[{ id: 'timeline' }]}
                keyExtractor={(item) => item.id}
                renderItem={() => <DealStatusTimeline events={timeline} fallbackStatus={statusLabel} />}
                contentContainerStyle={{ paddingBottom: 12 }}
              />
              {deal?.status === 'accepted' ? (
                <TouchableOpacity style={s.cancelLink} onPress={cancelDeal} testID="deal-cancel-link"><Text style={s.cancelLinkText}>{ui.cancelDeal}</Text></TouchableOpacity>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  compactHeader: { minHeight: 118, flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 9, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 20 },
  backButton: { width: 42, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  headerText: { flex: 1, minWidth: 0, paddingRight: 8 },
  headerActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  routeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  routeTitle: { flex: 1, fontSize: 19, fontWeight: '900', letterSpacing: -0.35 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#E9F6EF' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#168759' },
  statusPillText: { color: '#168759', fontSize: 11.5, fontWeight: '800', maxWidth: 104 },
  metaPrimary: { fontSize: 12.7, fontWeight: '800', marginTop: 1 },
  metaSecondary: { fontSize: 11.5, fontWeight: '650', marginTop: 3 },
  partnerText: { fontSize: 11.5, fontWeight: '650', marginTop: 3 },

  chatFullscreen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { fontSize: 13, fontWeight: '700' },

  actionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, marginHorizontal: 12, marginTop: 10, borderRadius: 14 },
  actionBarText: { fontSize: 13.5, fontWeight: '900', flexShrink: 1 },

  mapCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 10, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  mapCardIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#E9F6EF', alignItems: 'center', justifyContent: 'center' },
  mapCardTitle: { fontSize: 13.5, fontWeight: '850' },
  mapCardStatus: { fontSize: 11.5, fontWeight: '650', marginTop: 2 },
  mapCardOpenPill: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  mapCardOpenText: { color: '#168759', fontSize: 12.5, fontWeight: '850' },

  chatBody: { flex: 1, position: 'relative' },
  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
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
  photo: { width: 210, height: 150, borderRadius: 11, marginBottom: 4 },
  voiceRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8 },
  translateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  translateText: { fontSize: 11, fontWeight: '700' },
  emptyText: { textAlign: 'center', marginTop: 24, fontSize: 13 },
  jumpLatest: { position: 'absolute', right: 14, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#168759', paddingHorizontal: 11, height: 34, borderRadius: 17, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  jumpLatestText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, maxWidth: '84%' },
  errorText: { color: '#EF4444', fontSize: 11, fontWeight: '700', flexShrink: 1 },

  docBubble: { maxWidth: '84%', minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 9 },
  docIconBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  docName: { fontSize: 13, fontWeight: '800' },
  docMeta: { fontSize: 11, fontWeight: '650', marginTop: 2 },
  docRetryBtn: { padding: 4 },

  recordBar: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 10, marginBottom: 7, paddingHorizontal: 12, minHeight: 44, borderRadius: 22, backgroundColor: '#F4F7F5', borderWidth: 1, borderColor: '#DDE8E2' },
  recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#168759' },
  recordWave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 22 },
  recordWaveBar: { width: 2.5, borderRadius: 2, backgroundColor: '#168759', opacity: 0.58 },
  recordText: { color: '#15392B', fontSize: 12.5, fontWeight: '800', flex: 1 },
  recordCancelBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  recordStopBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center' },

  attachMenu: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  attachItem: { width: '25%', alignItems: 'center', gap: 5, paddingVertical: 6 },
  attachIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  attachLabel: { fontSize: 10.5, fontWeight: '700', textAlign: 'center' },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, paddingHorizontal: 10, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth },
  composerIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 112, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 10, fontSize: 14.5, lineHeight: 19 },
  sendButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#168759' },
  recordingButton: { backgroundColor: '#168759' },

  mapFullscreen: { flex: 1 },
  mapArea: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#EAF1ED' },
  updatedPill: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  updatedText: { fontSize: 11.5, fontWeight: '800' },
  mapCollapse: { position: 'absolute', right: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 13, borderRadius: 20, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3, zIndex: 8 },
  mapCollapseText: { fontSize: 12.5, fontWeight: '800' },
  metricsCard: { position: 'absolute', left: 12, right: 12, bottom: 12, minHeight: 68, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
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

  chatDock: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 66, paddingHorizontal: 14, borderTopWidth: 1 },
  chatIconBox: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#E9F6EF', alignItems: 'center', justifyContent: 'center' },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '900' },
  newCount: { color: '#168759', fontSize: 12, fontWeight: '800' },
  preview: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },

  fullBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '80%' },
  fullClose: { position: 'absolute', top: 44, right: 20, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  callMenuCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 24 },
  callMenuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  callMenuLabel: { flex: 1, fontSize: 14.5, fontWeight: '750' },
  comingSoonPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(124,139,130,0.14)' },
  comingSoonText: { fontSize: 10, fontWeight: '800', color: '#7C8B82' },

  statusModalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 14, paddingTop: 14 },
  statusModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cancelLink: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 10, marginTop: 4, marginBottom: 8 },
  cancelLinkText: { color: '#EF4444', fontSize: 12.5, fontWeight: '750' },
});
