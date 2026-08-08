import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Image, AppState, Linking, Alert, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import { useI18n } from '../utils/useI18n';
import { getLanguage, formatStatus } from '../utils/i18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { compressImage } from '../utils/imageCompress';
import { prettifyPartnerName, partnerInitial } from '../utils/displayName';
import { chatAPI } from '../utils/chatAPI';
import { marketAPI } from '../utils/marketAPI';
import { formatPrice } from '../utils/normalizers';
import { localizePlace } from '../utils/places';
import { SERVER_URL } from '../config/env';
import { notifyChatRead } from '../utils/unreadEvents';
import { refreshAppIconBadge } from '../utils/appBadge';
import { useMountedRef } from '../hooks/useMountedRef';
import { enqueueOutbox, flushOutbox } from '../utils/outbox';
import { setActiveRoom } from '../utils/activeRoom';  // QA-аудит P2-2
import { useAuth } from '../utils/AuthContext';
import { voice } from '../utils/voiceRecorder';
import QuickPhrases from '../components/QuickPhrases';
import {v1Colors, useV1Colors, v1Radius, v1AccentFor} from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import { DealRoomCard, SystemEventRow, DealQuickActions } from '../components/deal/DealRoom';
import BargainCard from '../components/deal/BargainCard';
import BidModal from '../components/BidModal';
import DealAttachments from '../components/deal/DealAttachments';
import { pickDealStatus, userFacingDealStatus } from '../utils/dealStatusOrder';
import { openContactPartner } from '../utils/contactPartner';

// HOT-006: реальная запись/воспроизведение для web (PWA deploy).
// На нативе (Expo Go) expo-av не установлен — тост "скоро".
const IS_WEB = Platform.OS === 'web';

// Вложения (фото/голос) сервер отдаёт как ХОСТ-ОТНОСИТЕЛЬНЫЙ подписанный путь
// (`/security/storage/...?exp=&sig=`). В вебе браузер сам достраивает адрес от
// origin, а на нативе <Image>/аудио требуют абсолютный URL со схемой — иначе
// картинка не грузится и виден только зелёный фон пузыря (баг «зелёные квадраты»).
// SERVER_URL === '' на вебе (сохраняем относительный путь), 'https://urtruck.kz'
// на нативе. Та же причина ломала воспроизведение голосовых на iOS.
const resolveAttachment = (u) =>
  (u && typeof u === 'string' && u.startsWith('/')) ? `${SERVER_URL}${u}` : u;

// Stage 52: photo и voice upload в Support Chat не реализованы end-to-end (P0-1, Bug-B).
// Скрываем кнопки до отдельного PR с multipart upload endpoint.
// 4.3: включено — фото грузится в storage и шлётся ключом (см. sendPhoto).
// Финальная проверка загрузки/рендера на устройстве — Level 5.
const CHAT_PHOTO_ENABLED = true;
// Голосовые включены: аудио выгружается на сервер (POST /chat/voice → ключ →
// send с photoUrl=ключ), получатель играет по подписанному URL. Финальная
// проверка записи/воспроизведения — на реальном устройстве.
const CHAT_VOICE_ENABLED = true;

export default function ChatScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  container: { flex: 1 },
  // Partner strip below the brand bar (avatar + name + online dot)
  partnerStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: v1.border,
    backgroundColor: v1.bgDeep,
  },
  partnerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  partnerAvatarIcon: { color: v1.text, fontSize: 16, fontWeight: '900' },
  partnerName: { color: v1.text, fontSize: 15, fontWeight: '800' },
  online: { fontSize: 11, fontWeight: '700' },
  // System banner above the first message
  msgList: { padding: 14, paddingBottom: 20 },
  // PR4 Accept bid confirm-бар (inline, без модалки — работает и на web)
  acceptConfirm: { backgroundColor: v1.surface, borderWidth: 1, borderColor: v1Colors.driver, borderRadius: 12, padding: 12, marginBottom: 8, gap: 6 },
  acceptConfirmTitle: { color: v1.text, fontSize: 14, fontWeight: '900' },
  acceptConfirmText: { color: v1.textMuted, fontSize: 12 },
  acceptConfirmRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  acceptCancelBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: v1.border, alignItems: 'center' },
  acceptCancelTxt: { color: v1.textMuted, fontSize: 12, fontWeight: '800' },
  acceptOkBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: v1Colors.driver, alignItems: 'center' },
  acceptOkTxt: { color: '#0C0A09', fontSize: 12, fontWeight: '900' },
  // Компактный статус перевозки (05.08.2026) — заменяет горизонтальную шкалу.
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  statusRowLabel: { color: v1.textMuted, fontSize: 12, fontWeight: '600' },
  statusRowValue: { fontSize: 13, fontWeight: '800' },
  dealNextBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 48, marginBottom: 8 },
  dealNextBtnText: { color: '#0C0A09', fontSize: 15, fontWeight: '800' },
  dealCancelBtn: { borderRadius: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: 'rgba(239,68,68,0.10)' },
  dealCancelBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  dealTrackBtn: { borderRadius: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: v1.border, backgroundColor: v1.surface },
  dealTrackBtnText: { color: v1.text, fontSize: 13, fontWeight: '700' },
  msgRow: { marginBottom: 10 },
  msgRowMe: { alignItems: 'flex-end' },
  senderLabel: { fontSize: 11, marginBottom: 3, marginLeft: 6, color: v1.textMuted },
  // B2B deal chat: компактнее и спокойнее (не consumer/WhatsApp). Меньше
  // padding/radius/maxWidth; outgoing — спокойный изумруд (не ядовитый #168A5B).
  bubble: { maxWidth: '72%', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12 },
  bubbleMe: { backgroundColor: '#15512F', borderBottomRightRadius: 4 },
  bubbleThem: {
    borderBottomLeftRadius: 4,
    backgroundColor: v1.surface,
    borderWidth: 1, borderColor: v1.border,
  },
  msgText: { fontSize: 14, lineHeight: 19 },
  msgTextMe: { color: '#EAFBF1' },
  translated: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  translatedText: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontStyle: 'italic' },
  msgTime: { color: v1.textMuted, fontSize: 11, textAlign: 'right', marginTop: 3 },
  msgTimeMe: { color: 'rgba(234,251,241,0.55)' },
  systemMsgRow: { alignItems: 'center', marginVertical: 6 },
  systemMsgPill: {
    backgroundColor: 'rgba(148,163,184,0.18)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 6, maxWidth: '80%',
  },
  systemMsgText: { color: '#94A3B8', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  // Плашка «идёт запись» над инпутом: красная точка + таймер + подсказка.
  recBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderTopWidth: 1, borderTopColor: '#EF4444',
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  recText: { color: '#EF4444', fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  recHint: { color: v1.textMuted, fontSize: 12, flex: 1, textAlign: 'right' },
  // Input bar
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 10, gap: 6,
    borderTopWidth: 1, borderTopColor: v1.border,
    backgroundColor: v1.bgDeep,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 1, borderColor: v1.border,
    backgroundColor: v1.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { fontSize: 16, color: v1.text },
  input: {
    flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, borderWidth: 1, borderColor: v1.border,
    backgroundColor: v1.surface, color: v1.text,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // WeChat-панель вложений: сетка плиток под строкой ввода.
  attachPanel: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 12, paddingTop: 14, paddingBottom: 20,
    borderTopWidth: 1, borderTopColor: v1.border, backgroundColor: v1.bgDeep,
  },
  attachTile: { width: '25%', alignItems: 'center', gap: 7, marginBottom: 8 },
  attachIconBox: {
    width: 54, height: 54, borderRadius: 16,
    backgroundColor: v1.surface, borderWidth: 1, borderColor: v1.border,
    alignItems: 'center', justifyContent: 'center',
  },
  attachLabel: { fontSize: 11, color: v1.textMuted, fontWeight: '600' },
  photoMsg: { width: 200, height: 150, borderRadius: 12 },
  // C2: fullscreen-viewer вложения
  fullBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '100%' },
  fullClose: { position: 'absolute', top: 48, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  fullSave: { position: 'absolute', bottom: 44, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
  fullSaveTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  wavebar: { width: 2, borderRadius: 1 },
  voiceTime: { fontSize: 11, minWidth: 30 },

  }), [v1]);
  const { partner, role, cargoId, tripId, roomId: initialRoomId, dealId: dealIdParam, bidId } = route.params || {};
  // dealId — состояние: если чат открыт из «Чаты»/ставки (только roomId, без
  // dealId), достаём deal_id из комнаты, чтобы подгрузить сделку → появляются
  // кнопка звонка, маршрут в шапке и карточка сделки при ЛЮБОМ входе.
  const [dealId, setDealId] = useState(dealIdParam || null);
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const mounted = useMountedRef();  // QA-аудит P1-8
  const [messages, setMessages] = useState([]);
  const [roomId, setRoomId] = useState(initialRoomId || null);
  const [input, setInput] = useState('');
  const [showPhrases, setShowPhrases] = useState(false);
  // WeChat-стиль: панель вложений снизу, открывается по «+». Главная строка
  // ввода остаётся чистой ([+] · поле · 🎤 · отправить).
  const [showAttach, setShowAttach] = useState(false);
  const [recording, setRecording] = useState(false);
  // C2 (device-баг): вложение-фото не открывалось на весь экран. Тап по
  // фото-пузырю кладёт сюда абсолютный URL → показываем fullscreen-viewer.
  const [fullImage, setFullImage] = useState(null);
  // Сохранить открытое фото. Web: новая вкладка (там «Сохранить в фото» долгим
  // тапом — программно из PWA в Галерею нельзя). Native: системный Share-лист.
  const saveFullImage = async () => {
    if (!fullImage) return;
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.open(fullImage, '_blank');
        else await Linking.openURL(fullImage);
      } else {
        const { Share } = require('react-native');
        await Share.share({ url: fullImage, message: fullImage });
      }
    } catch {
      Linking.openURL(fullImage).catch(() => toast(t('send_error'), 'error'));
    }
  };
  // Часть 2 (торг в чате): BidModal + refreshKey для BargainCard. Кнопка 💰 в
  // инпут-баре и чипы в карточке торга шлют действия через существующие
  // эндпоинты; bargainRefresh инкрементим, чтобы карточка перечитала статус.
  const [bidModal, setBidModal] = useState({ visible: false, mode: 'create', bidId: null, amount: null });
  const [bargainRefresh, setBargainRefresh] = useState(0);
  // UX 26.07: тик-триггер «Документ» из «+»-меню → DealAttachments.onAttach().
  const [attachDocTick, setAttachDocTick] = useState(0);
  // Индикатор записи голоса: секунды тикают, пока recording=true — иначе
  // непонятно, идёт запись или нет (жалоба владельца).
  const [recordSecs, setRecordSecs] = useState(0);
  useEffect(() => {
    if (!recording) { setRecordSecs(0); return; }
    const iv = setInterval(() => setRecordSecs((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [recording]);
  // «Печатает…»: индикатор партнёра (из poll) + троттл своего пинга.
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const lastTypingPing = useRef(0);
  const onInputChange = (v) => {
    setInput(v);
    const now = Date.now();
    if (roomId && v && now - lastTypingPing.current > 2500) {
      lastTypingPing.current = now;
      chatAPI.typing(roomId);   // fire-and-forget
    }
  };
  const [translations, setTranslations] = useState({});
  const [translating, setTranslating] = useState(null);
  // Авто-перевод всей ленты (ключевая фича Китай↔СНГ): при включении все
  // входящие сообщения переводятся на язык интерфейса автоматически.
  const [autoTranslate, setAutoTranslate] = useState(false);
  // Deal Room (PR2): карточка сделки + immutable timeline. Показываются только
  // при dealId — иначе старый чат выглядит как раньше.
  const [deal, setDeal] = useState(null);
  const [dealEvents, setDealEvents] = useState([]);
  // issue #4: когда в Chat пришёл только roomId (из карточки заказа/ставки),
  // partner в route может быть пустым → заголовок показывал «Собеседник».
  // Подтягиваем реального собеседника из enriched /chat/rooms по roomId.
  const [resolvedPartner, setResolvedPartner] = useState(partner || null);
  // Часть 2: при входе из «Чаты» в route приходит только roomId — cargoId/
  // tripId пусты, и карточка торга (BargainCard) не знала, по какому листингу
  // грузить ставку. Дорезолвим их из комнаты (enriched /chat/rooms отдаёт
  // cargo_id/trip_id) и отдаём в BargainCard/BidModal.
  const [resolvedCargoId, setResolvedCargoId] = useState(cargoId || null);
  const [resolvedTripId, setResolvedTripId] = useState(tripId || null);
  const bargainCargoId = cargoId || resolvedCargoId;
  const bargainTripId = tripId || resolvedTripId;
  // Ревизия 26.07: BidModal открывался без currency → торг в чате по грузу в
  // KZT/RUB рисовал «$». Валюта: из сделки (get_deal отдаёт currency груза),
  // иначе дотягиваем с самого груза.
  const [listingCurrency, setListingCurrency] = useState(null);
  useEffect(() => {
    if (deal?.currency) { setListingCurrency(deal.currency); return; }
    if (!bargainCargoId) return;
    let alive = true;
    marketAPI.getCargo(bargainCargoId)
      .then((c) => { if (alive && c?.currency) setListingCurrency(c.currency); })
      .catch(() => {});
    return () => { alive = false; };
  }, [deal?.currency, bargainCargoId]);
  const flatListRef = useRef(null);
  // HOT-006: refs для MediaRecorder (web)
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const recordStartRef = useRef(0);

  // G-1: время серверных сообщений приходит как naive-UTC (SQLite/FastAPI без
  // таймзоны). Раньше пузырь показывал сырой UTC-срез без сдвига → не совпадало
  // с локальным временем. Помечаем как UTC и форматируем в локальное HH:MM,
  // фолбэк на старый срез при невалидной дате.
  const fmtMsgTime = (raw) => {
    if (!raw) return '';
    let s = String(raw);
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(raw).slice(11, 16);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Загрузка истории чата
  const loadMessages = async (rid) => {
    if (!rid) return;
    try {
      const md = await chatAPI.messages(rid);
      if (!mounted.current) return;  // QA-аудит P1-8: чат закрыт во время poll
      // «Печатает…»: сервер отдаёт живость typing-пинга партнёра.
      setPartnerTyping(!!md.partner_typing);
      setPartnerOnline(!!md.partner_online);
      const mapped = (md.messages || []).map(m => {
        // Источник истины — серверный признак m.mine (сравнение sender_id с uid
        // на бэке). Локальный myId может быть фейковым ('u_<ts>') до синка
        // AuthContext → раньше своё сообщение показывалось как чужое
        // («отправляю — копируется мне»). Серверный mine этот баг убирает.
        // Фолбэк на старую эвристику — только если mine не пришёл (старый бэк).
        const fromMe =
          (typeof m.mine === 'boolean')
            ? m.mine
            : ((myId && m.sender_id === myId) ||
               (partner?.id && m.sender_id !== partner.id));
        const isSystemMsg = m.sender_id === 'system';
        return {
          id: String(m.id), from: isSystemMsg ? 'system' : (fromMe ? 'me' : 'them'),
          // Голосовое хранит аудио-ключ в том же поле photo_url (подписанном
          // сервером) — не путать с фото: isPhoto только когда НЕ voice.
          text: m.text, isPhoto: !!m.photo_url && !m.is_voice, photoUri: resolveAttachment(m.photo_url),
          isVoice: !!m.is_voice, voiceUrl: m.is_voice ? resolveAttachment(m.photo_url) : undefined,
          duration: m.voice_duration || 0,
          time: fmtMsgTime(m.created_at),
          is_read: !!m.is_read,
          // P3/merge: серверный client_msg_id для точного сопоставления
          // optimistic-пузыря (его локальный id === clientMsgId).
          clientMsgId: m.client_msg_id || null,
        };
      });
      // PR-C2 (P0-4 disappearing messages): defensive merge.
      // Раньше:
      //   setMessages(prev => mapped.length !== prev.length ? mapped : prev)
      // ломалось двумя путями:
      //   1) Polling приходит ПОСЛЕ optimistic insert но ДО того как
      //      server вставил отправленное → mapped.length < prev.length
      //      → setMessages = mapped → наше сообщение исчезает на 3 сек
      //      до следующего poll.
      //   2) Polling приходит когда server уже вставил → mapped и prev
      //      одинаковой длины, guard видит equality → optimistic id
      //      ('1731...') остаётся вместо server id, при последующем
      //      reload получается дубликат.
      // Решение: optimistic-помеченные местные сообщения сохраняем
      // пока не появятся в server response. Дедуп по тексту+времени
      // для миграции старых optimistic к серверному ID.
      setMessages(prev => {
        if (!Array.isArray(mapped) || mapped.length === 0) {
          return prev; // не сбрасываем на пустой server response
        }
        const serverIds = new Set(mapped.map(m => m.id));
        // Локальные сообщения которых нет в server — сохраняем (только
        // optimistic, отмечены _optimistic=true в sendMessage).
        const localOnly = prev.filter(m => {
          if (!m._optimistic) return false;
          if (serverIds.has(m.id)) return false;
          // Сопоставление optimistic → server: сначала по client_msg_id
          // (устойчиво; локальный id пузыря === clientMsgId), иначе фолбэк
          // по тексту. Это чинит схлопывание двух одинаковых сообщений
          // («ок»/«ок») в одно между поллами.
          const ackedByServer = mapped.some(srv =>
            (srv.clientMsgId && srv.clientMsgId === m.id) ||
            // фолбэк по тексту — ТОЛЬКО когда у серверного сообщения нет
            // clientMsgId (старый бэк) и текст непустой. Иначе два одинаковых
            // «ок» ложно схлопываются, а фото/голос (text='') матчатся зря.
            (!srv.clientMsgId && srv.from === 'me' && m.text && m.text.trim() !== '' && srv.text === m.text)
          );
          return !ackedByServer;
        });
        return [...mapped, ...localOnly];
      });
    } catch {}
  };

  useEffect(() => {
    if (initialRoomId) {
      loadMessages(initialRoomId);
      return;
    }
    if (!partner?.id && !cargoId && !tripId) return;
    let alive = true;
    chatAPI.rooms().then(d => {
      const rooms = d.rooms || [];
      let room = null;
      if (partner?.id) {
        room = rooms.find(r => r.participant_1 === partner.id || r.participant_2 === partner.id);
      }
      // Фолбэк: вход из карточки заказа/ставки БЕЗ roomId и БЕЗ partner —
      // резолвим комнату по cargo_id/trip_id. Без этого первое сообщение и
      // история не грузились (roomId оставался null, поллинг не стартовал).
      if (!room && (cargoId || tripId)) {
        room = rooms.find(r => (cargoId && r.cargo_id === cargoId) || (tripId && r.trip_id === tripId));
      }
      if (alive && room) {
        setRoomId(room.id);
        loadMessages(room.id);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [partner?.id, initialRoomId, cargoId, tripId]);

  // Авто-перевод: когда включён, переводим все входящие сообщения без
  // перевода на язык интерфейса. Кэш (наш стейт + серверный) не даёт
  // переводить одно и то же дважды; при новом сообщении переводится только оно.
  useEffect(() => {
    if (!autoTranslate) return;
    const lng = getLanguage().toLowerCase();
    const pending = messages.filter(m => m && m.id && m.from !== 'me' && m.text && !translations[m.id]);
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const m of pending) {
        if (cancelled) break;
        try {
          const r = await chatAPI.translate(m.id, lng);
          if (!cancelled && r?.translated_text) {
            setTranslations(prev => prev[m.id] ? prev : ({ ...prev, [m.id]: { text: r.translated_text, provider: r.provider, showOriginal: false } }));
          }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [autoTranslate, messages]);

  // Polling каждые 3 сек — подтягиваем ответы (Support/Володя/живые).
  // Пауза в фоне: на трассе свёрнутый чат не должен жечь трафик/батарею
  // каждые 3 сек. При возврате в foreground сразу перечитываем и возобновляем.
  useEffect(() => {
    if (!roomId) return;
    let iv = null;
    const start = () => { if (!iv) iv = setInterval(() => loadMessages(roomId), 3000); };
    const stop = () => { if (iv) { clearInterval(iv); iv = null; } };
    start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { loadMessages(roomId); start(); } else { stop(); }
    });
    return () => { stop(); sub?.remove?.(); };
  }, [roomId]);

  // QA-аудит P2-2: помечаем комнату активной, пока экран в фокусе — чтобы
  // foreground-push о новом сообщении этой комнаты не дублировал баннер.
  // Снимаем на blur и unmount (другие комнаты/типы push не затрагиваются).
  useEffect(() => {
    setActiveRoom(roomId);
    // Variant B: при возврате на экран — перезагружаем историю (свежие
    // сообщения собеседника видны сразу, не дожидаясь 3-сек поллинга).
    const unsubF = navigation.addListener('focus', () => { setActiveRoom(roomId); if (roomId) loadMessages(roomId); });
    const unsubB = navigation.addListener('blur', () => setActiveRoom(null));
    return () => { unsubF(); unsubB(); setActiveRoom(null); };
  }, [navigation, roomId]);

  // QA-аудит P1-3: прогон офлайн-очереди — при входе в чат и при возврате
  // приложения в active (сеть могла восстановиться). Backend идемпотентен
  // по client_msg_id, поэтому повторная доставка не плодит дубли.
  useEffect(() => {
    const doFlush = async () => {
      try {
        // Блок 2 (P1-5): отправляем только очередь ТЕКУЩЕГО юзера.
        const sent = await flushOutbox((p) => chatAPI.send(p), session?.user?.id);
        if (sent > 0 && mounted.current && roomId) loadMessages(roomId);
      } catch {}
    };
    doFlush();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') doFlush(); });
    return () => sub?.remove?.();
  }, [roomId, session?.user?.id]);

  // issue #4: разрешаем реального собеседника для заголовка из enriched
  // rooms по roomId, если из route пришёл пустой/технический partner.
  useEffect(() => {
    if (!roomId) return;
    chatAPI.rooms().then((d) => {
      const room = (d.rooms || []).find((r) => r.id === roomId);
      if (!room) return;
      // Variant B: берём ТОЛЬКО partner_id (другой участник из бэка). Не
      // падаем на participant_1/2 вслепую — это мог быть сам пользователь.
      setResolvedPartner((prev) => ({
        id: prev?.id || room.partner_id || null,
        name: (prev?.name && String(prev.name).trim()) ? prev.name : room.partner_name,
        role: prev?.role || room.partner_role,
      }));
      // Часть 2: дорезолвить листинг для карточки торга (если пришли из «Чаты»).
      if (room.cargo_id) setResolvedCargoId((prev) => prev || room.cargo_id);
      if (room.trip_id) setResolvedTripId((prev) => prev || room.trip_id);
    }).catch(() => {});
  }, [roomId]);

  // PR-C2 (Task 2 unified badge): notify BottomNav когда чат открылся
  // (backend GET /messages автоматически делает is_read=1; нам нужно
  // только сказать BottomNav поллить unread заново) и когда экран
  // закрывается. Без этого badge висит до следующего 30-сек poll.
  useEffect(() => {
    if (!roomId) return;
    notifyChatRead();
    // BUG-003: пересчитываем app-icon badge прямо отсюда — BottomNav
    // размонтирован (мы поверх табов), его syncAppIconBadge не сработает.
    refreshAppIconBadge();
    return () => { notifyChatRead(); refreshAppIconBadge(); };
  }, [roomId]);

  // Deal Room: загрузка карточки сделки + immutable timeline по dealId.
  // D2 (Maestro P1): раньше карточка сделки наполнялась ТОЛЬКО из
  // route.params. Когда юзер открывал сделку с экрана «Чаты» / «Сделки»
  // (`ChatsListScreen.navigate('Chat', { partner, roomId, dealId, role })`)
  // — params содержали roomId/dealId, но не fromCity/toCity/cargoDesc/
  // amount/plate. В итоге `DealRoomCard` рендерил «Груз —» / «Ставка —».
  // Fix: дополнительно тянем deal с backend (`GET /market/deals/{id}` уже
  // существует и проверяет, что caller — участник сделки) и сливаем
  // пустые поля с серверным ответом. Никаких подделок: если backend
  // вернул `null`, остаётся текущая «—» в UI.
  //
  // 05.08.2026 (п.13 ТЗ, баги 1/2/4): раньше мёрдж был `prev?.status ||
  // srv.status` — свежий ответ сервера НИКОГДА не мог перезаписать уже
  // выставленный статус (даже устаревший из route-параметров). Теперь —
  // тот же монотонный guard, что в CargoDetail/TripDetail (pickDealStatus:
  // не откатывается назад, completed/delivered/cancelled не «отменяются
  // задним числом»), плюс seq-guard от гонок параллельных запросов.
  const dealFetchSeq = useRef(0);
  const refreshDeal = () => {
    if (!dealId) return;
    const seq = ++dealFetchSeq.current;
    marketAPI.getDeal(dealId)
      .then((srv) => {
        if (!srv || typeof srv !== 'object') return;
        if (seq !== dealFetchSeq.current) return; // ответ устарел
        setDeal((prev) => ({
          status: pickDealStatus(prev?.status, srv.status || 'accepted'),
          from_city: prev?.from_city || srv.from_city,
          to_city: prev?.to_city || srv.to_city,
          from_country: prev?.from_country || srv.from_country,
          to_country: prev?.to_country || srv.to_country,
          cargo_desc: prev?.cargo_desc || srv.cargo_desc,
          cargo_id: prev?.cargo_id || srv.cargo_id,
          amount: prev?.amount != null ? prev.amount : srv.amount,
          currency: prev?.currency || srv.currency,
          plate: prev?.plate || srv.plate,
          counterparty_phone: srv.counterparty_phone || prev?.counterparty_phone,
          counterparty_name: srv.counterparty_name || prev?.counterparty_name,
        }));
      })
      .catch(() => {});
  };
  useEffect(() => {
    if (!dealId) return;
    const p = route.params || {};
    setDeal({
      status: p.dealStatus, from_city: p.fromCity, to_city: p.toCity,
      cargo_desc: p.cargoDesc, cargo_id: p.cargoId, amount: p.amount, plate: p.plate,
    });
    refreshDeal();
    chatAPI.dealTimeline(dealId)
      .then(r => setDealEvents(Array.isArray(r?.events) ? r.events : []))
      .catch(() => {});
    // Периодический refetch (как в CargoDetail/TripDetail) — вторая сторона
    // могла продвинуть статус (Начать/На границе/Доставлено), пока этот
    // экран открыт; без поллинга статус тут не обновится сам.
    const iv = setInterval(refreshDeal, 15000);
    return () => clearInterval(iv);
  }, [dealId]);

  // Пуш о сделке ведёт в Chat только с dealId (без roomId). Чтобы
  // подгрузились и сообщения, а не только карточка сделки, — находим
  // комнату этой сделки в /chat/rooms и подставляем roomId.
  useEffect(() => {
    if (roomId || !dealId) return;
    let cancelled = false;
    chatAPI.rooms().then((d) => {
      if (cancelled) return;
      const room = (d?.rooms || []).find((r) => r.deal_id === dealId);
      if (room?.id) setRoomId(room.id);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [dealId, roomId]);

  // Обратный резолв: пришли только с roomId (вход из «Чаты»/ставки) — находим
  // deal_id этой комнаты, чтобы подгрузить сделку (телефон → кнопка звонка,
  // маршрут в шапке, карточка сделки). Без этого в реальном чате звонка не
  // было, хотя сделка есть.
  useEffect(() => {
    if (!roomId || dealId) return;
    let cancelled = false;
    chatAPI.rooms().then((d) => {
      if (cancelled) return;
      const room = (d?.rooms || []).find((r) => r.id === roomId);
      if (room?.deal_id) setDealId(room.deal_id);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [roomId, dealId]);

  const onCallSupport = async () => {
    try {
      await chatAPI.supportEscalate({ conversationId: roomId || null, reason: 'chat_cta' });
      toast(t('chat_support_pending'), 'success');
    } catch { /* без фейков — просто не падаем */ }
  };

  // Часть 2 — открытие BidModal из инпут-бара (💰) или чипа «Своя цена».
  // mode: 'create' — новая ставка (из инпута); 'counter'/'edit' — из чипа.
  const openBidModal = (mode = 'create', targetBidId = null, amount = null) => {
    setBidModal({ visible: true, mode, bidId: targetBidId || bidId || null, amount });
  };
  // Момент сделки — компактное серое системное сообщение (WhatsApp-упрощение
  // 04.08.2026: раньше был отдельный крупный зелёный баннер, дублирующий
  // статус/цену, уже видные в закреплённой карточке сделки сверху).
  const onBargainDeal = (amount) => {
    const amountText = amount != null ? formatPrice(amount, deal?.currency || 'USD', t) : '';
    setMessages((prev) => [...prev, {
      id: 'deal_' + Date.now().toString(36),
      from: 'system', text: `🤝 ${t('deal_done')}${amountText ? ' ' + amountText : ''}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
    setBargainRefresh((n) => n + 1);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
  };

  // PR4 — Accept bid. Кнопка активна только если есть bidId и сделка ещё не
  // принята. Confirm → реальный вызов /market/bids/{id}/accept (пишет immutable
  // deal.bid_accepted). После успеха — обновляем deal-статус и timeline.
  const [acceptConfirm, setAcceptConfirm] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const canAcceptBid = !!bidId && deal && deal.status !== 'accepted' && deal.status !== 'confirmed';
  const doAcceptBid = async () => {
    setAccepting(true);
    try {
      await chatAPI.acceptBid(bidId);
      toast(t('accept_bid_success'), 'success');
      setDeal((d) => (d ? { ...d, status: 'accepted' } : d));
      setAcceptConfirm(false);
      if (dealId) {
        chatAPI.dealTimeline(dealId)
          .then((r) => setDealEvents(Array.isArray(r?.events) ? r.events : []))
          .catch(() => {});
      }
    } catch (e) {
      toast(t('accept_bid_failed'), 'error');
    } finally {
      setAccepting(false);
    }
  };

  // Статус перевозки (05.08.2026, п.4/9 ТЗ): раньше «Начать перевозку»/«На
  // границе»/«Груз доставлен»/«Подтвердить получение» жили в CargoDetail/
  // TripDetail/MyTripsScreen — три места с независимыми кнопками на одну и
  // ту же сделку. Теперь единственное место действия — разговор (здесь).
  // CargoDetail/TripDetail показывают тот же статус только текстом (см.
  // компактный «Текущий статус / Следующий шаг» там), без своей кнопки.
  const [statusLoading, setStatusLoading] = useState(false);
  const changeDealStatus = async (newStatus) => {
    if (!dealId || statusLoading) return;
    setStatusLoading(true);
    try {
      const r = await marketAPI.updateDealStatus(dealId, newStatus);
      if (r.ok) {
        // «Статус обновлён» больше не показываем (05.08.2026, п.10 ТЗ):
        // компактная строка статуса и кнопка следующего действия меняются
        // тут же на экране — отдельный тост тому же самому событию только
        // перекрывал шапку/карточку, не добавляя новой информации. Отмену
        // сделки (более редкое, необратимое действие) по-прежнему
        // подтверждаем явно.
        if (newStatus === 'cancelled') toast(t('deal_cancelled_toast'), 'success');
      } else {
        // 409 и другие отказы: сервер уже знает реальный статус — не
        // оставляем устаревшую кнопку, сразу перечитываем сделку.
        toast(r.detail || t('update_failed'), 'error');
      }
    } catch {
      toast(t('no_connection'), 'error');
    }
    // И на успехе, и на отказе — единственная правда приходит с сервера.
    refreshDeal();
    if (dealId) {
      chatAPI.dealTimeline(dealId)
        .then((r2) => setDealEvents(Array.isArray(r2?.events) ? r2.events : []))
        .catch(() => {});
    }
    setStatusLoading(false);
  };
  const isShipperSide = role === 'client' || role === 'shipper';

  // QA-аудит P0 (silent message loss): раньше все три send-пути были под
  // `if (partner?.id)` с route.params.partner — при входе в чат только по
  // roomId (карточка заказа/уведомление) partner пуст → optimistic-пузырь
  // рисовался, но на сервер НЕ уходил и исчезал после рестарта. Теперь
  // получатель берётся из resolvedPartner (дотянут из /chat/rooms), а
  // ошибки отправки показываются тостом, а не глотаются.
  const recipientId = () => resolvedPartner?.id || partner?.id || null;

  const sendMessage = async (text) => {
    const msg = text || input;
    if (!msg.trim()) return;
    const toId = recipientId();
    // Variant B: достаточно roomId (бэк возьмёт получателя из участников).
    // Без roomId нужен хотя бы собеседник (поддержка/общий чат).
    if (!roomId && !toId) { toast(t('chat_send_failed'), 'error'); return; }
    // QA-аудит P1-3: clientId = идемпотентный ключ (backend дедупит по
    // client_msg_id) и id optimistic-пузыря. PR-C2 (P0-4): optimistic
    // insert с `_optimistic: true` — defensive merge в loadMessages
    // сохраняет его пока сервер не подтвердит.
    const clientId = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const payload = { roomId, toUserId: toId, text: msg, cargoId, tripId, clientMsgId: clientId };
    setMessages(prev => [...prev, {
      id: clientId, from: 'me', text: msg,
      time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
      _optimistic: true,
    }]);
    setInput('');
    setShowPhrases(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    // Сохраняем на сервере. C3: «Нет сети» показываем ТОЛЬКО при реальном
    // сетевом сбое (e.isNetwork) — тогда кладём в офлайн-очередь на ретрай.
    // При HTTP-ошибке (сервер ответил 4xx/5xx) сеть в порядке — показываем
    // честную ошибку отправки, без ложного «нет сети» и без гонки outbox.
    try {
      const r = await chatAPI.send(payload);
      if (r.room_id) setRoomId(r.room_id);
    } catch (e) {
      if (e?.isNetwork) {
        await enqueueOutbox({ clientId, payload }, session?.user?.id);
        toast(t('chat_queued'), 'info', 2500);
      } else {
        toast(t('chat_send_failed'), 'error');
      }
    }
  };

  // WhatsApp-style: тап по 📷 предлагает Камеру или Галерею (на native).
  // На web камера ненадёжна — сразу галерея.
  // Связь с партнёром: выбор WhatsApp/Telegram/звонок — вынесено в
  // src/utils/contactPartner.js (05.08.2026, п.6/17 ТЗ), т.к. теперь нужна
  // тем же способом и на CargoDetail/TripDetail (secondary-кнопка «Позвонить»).
  const contactPartner = (rawPhone) => openContactPartner(rawPhone, t);

  // Отправить свою геопозицию как сообщение со ссылкой на карту (открывается в
  // Яндекс/Google Картах у собеседника). expo-location уже в проекте — работает
  // и в текущей сборке. Для веба используем navigator.geolocation.
  const sendLocation = async () => {
    try {
      let latitude, longitude;
      if (Platform.OS === 'web') {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 }));
        ({ latitude, longitude } = pos.coords);
      } else {
        const Location = require('expo-location');
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') { toast(t('location_denied'), 'error'); return; }
        const pos = await Location.getCurrentPositionAsync({});
        ({ latitude, longitude } = pos.coords);
      }
      const link = `https://yandex.ru/maps/?pt=${longitude},${latitude}&z=15&l=map`;
      sendMessage(`📍 ${t('chat_location_msg')}: ${link}`);
    } catch { toast(t('location_denied'), 'error'); }
  };

  const sendPhoto = () => {
    if (Platform.OS === 'web') { pickAndSend(false); return; }
    Alert.alert(t('add_photo'), '', [
      { text: '📷 ' + t('camera'), onPress: () => pickAndSend(true) },
      { text: '🖼 ' + t('gallery'), onPress: () => pickAndSend(false) },
      { text: '📍 ' + t('attach_location'), onPress: () => sendLocation() },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const pickAndSend = async (fromCamera) => {
    try {
      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { toast(t('photo_permission'), 'warn'); return; }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { toast(t('photo_permission'), 'warn'); return; }
      }
      const r = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (r.canceled || !r.assets?.[0]) return;
      const uri = r.assets[0].uri;
      let photoUri = uri;
      try { photoUri = await compressImage(uri, { maxSide: 800, quality: 0.7 }); } catch { /* fallback: оригинал */ }
      const toId = recipientId();
      // P1-1 fix: как и текст — достаточно roomId (бэк возьмёт получателя из
      // участников). Без roomId нужен собеседник.
      if (!roomId && !toId) { toast(t('chat_send_failed'), 'error'); return; }
      // P1-1 fix: помечаем пузырь _optimistic + clientId, чтобы loadMessages
      // не выкинул фото до подтверждения сервером (раньше без флага исчезало
      // через 3 c). client_msg_id → идемпотентность (нет дублей при ретапе).
      const clientId = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      setMessages(prev => [...prev, {
        id: clientId, from: 'me',
        text: '', isPhoto: true, photoUri,
        time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
        _optimistic: true,
      }]);
      // 4.3: сначала грузим фото в storage → ключ, затем шлём сообщение с
      // ключом (раньше слали локальный uri устройства — не резолвился у
      // получателя). Сервер подпишет ключ на чтении, фото видно обеим сторонам.
      // P1-1 fix: передаём roomId → фото уходит в ТУ ЖЕ комнату сделки,
      // а не в новую «p:»-комнату.
      try {
        const up = await chatAPI.uploadChatPhoto(photoUri);
        const key = up?.photo_key;
        if (!key) throw new Error('no_key');
        const r = await chatAPI.send({ roomId, toUserId: toId, photoUrl: key, cargoId, tripId, clientMsgId: clientId });
        if (r.room_id) setRoomId(r.room_id);
        toast('📷 ' + t('photo_sent'), 'success', 1500);
      } catch {
        toast(t('chat_send_failed'), 'error');
      }
    } catch (e) {
      toast(t('photo_failed'), 'error');
    }
  };

  // HOT-006: единая запись/воспроизведение через voiceRecorder.
  // Web — MediaRecorder API; Native — expo-av (установлен ^16.0.8).
  const appendVoiceMessage = async (uri, duration) => {
    const mm = String(Math.floor(duration / 60)).padStart(1, '0');
    const ss = String(duration % 60).padStart(2, '0');
    const toId = recipientId();
    if (!roomId && !toId) { toast(t('chat_send_failed'), 'error'); return; }
    // P1-1 fix: _optimistic + clientId + roomId (как у текста/фото).
    const clientId = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    setMessages(prev => [...prev, {
      id: clientId, from: 'me',
      text: `🎤 ${mm}:${ss}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isVoice: true, playing: false, voiceUrl: uri, duration, _optimistic: true,
    }]);
    // Аудио сначала грузим в storage (как фото) → ключ → сообщение с ключом.
    // Раньше файл вообще не выгружался и получатель звук не получал.
    try {
      const up = await chatAPI.uploadChatVoice(uri);
      const key = up?.voice_key;
      if (!key) throw new Error('no_key');
      const r = await chatAPI.send({
        roomId, toUserId: toId,
        text: `🎤 ${t('chat_voice_message')} (${duration}${t('unit_sec_short')})`,
        photoUrl: key,                     // аудио-ключ в общем поле вложения
        isVoice: true, voiceDuration: duration,
        cargoId, tripId, clientMsgId: clientId,
      });
      if (r?.room_id) setRoomId(r.room_id);
    } catch {
      toast(t('chat_send_failed'), 'error');
    }
  };

  const startRecording = async () => {
    try {
      const ok = await voice.startRecording();
      if (!ok) {
        toast(t('voice_permission'), 'warn');
        return;
      }
      recordStartRef.current = Date.now();
      setRecording(true);
      // Тост убран (26.07): индикатор записи один — красная плашка с
      // таймером над строкой ввода. Два индикатора путали.
    } catch (e) {
      console.warn('[voice] start failed:', e);
      toast(t('voice_permission'), 'warn');
      setRecording(false);
    }
  };

  const stopRecording = async () => {
    setRecording(false);
    try {
      const result = await voice.stopRecording();
      if (!result?.uri) {
        toast(t('voice_record_fail'), 'warn');
        return;
      }
      const duration = result.duration ||
        Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
      appendVoiceMessage(result.uri, duration);
    } catch (e) {
      console.warn('[voice] stop failed:', e);
      toast(t('voice_record_fail'), 'warn');
    }
  };

  const toggleVoice = async () => {
    if (!recording) await startRecording();
    else await stopRecording();
  };

  const playVoice = async (id) => {
    const msg = messages.find(m => m.id === id);
    if (!msg?.voiceUrl) return;
    setMessages(prev => prev.map(m => m.id === id ? { ...m, playing: true } : m));
    try {
      const ok = await voice.play(msg.voiceUrl);
      if (!ok) toast(t('voice_play_fail'), 'warn');
    } catch (e) {
      console.warn('[voice] play failed:', e);
      toast(t('voice_play_fail'), 'warn');
    } finally {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, playing: false } : m));
    }
  };

  // Cleanup при размонтировании — отпускаем микрофон / звук
  useEffect(() => () => {
    try { voice.stop?.(); } catch {}
  }, []);

  const renderMessage = ({ item }) => {
    const isMe = item.from === 'me';
    if (item.from === 'system') {
      return (
        <View style={s.systemMsgRow}>
          <View style={s.systemMsgPill}>
            <Text style={s.systemMsgText}>{item.text}</Text>
          </View>
        </View>
      );
    }
    if (item.isPhoto) {
      return (
        <View style={[s.msgRow, isMe && s.msgRowMe]}>
          {!isMe && partner?.name ? (
            <Text style={[s.senderLabel, { color: theme.textMuted }]}>{partner.name}</Text>
          ) : null}
          <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem, { padding: 4 }]}>
            {/* C2: тап открывает фото на весь экран (fullscreen-viewer ниже). */}
            <Pressable onPress={() => item.photoUri && setFullImage(item.photoUri)} testID="chat-photo-msg">
              <Image source={{ uri: item.photoUri }} style={s.photoMsg} />
            </Pressable>
            <Text style={[s.msgTime, isMe ? s.msgTimeMe : { color: v1.textMuted }, { marginTop: 4, marginRight: 4 }]}>{item.time}</Text>
          </View>
        </View>
      );
    }
    if (item.isVoice) {
      return (
        <View style={[s.msgRow, isMe && s.msgRowMe]}>
          {!isMe && partner?.name ? (
            <Text style={[s.senderLabel, { color: theme.textMuted }]}>{partner.name}</Text>
          ) : null}
          <TouchableOpacity
            style={[s.bubble, s.voiceBubble, isMe ? s.bubbleMe : s.bubbleThem]}
            onPress={() => playVoice(item.id)}
          >
            <Feather name={item.playing ? 'pause' : 'play'} size={20} color={isMe ? '#fff' : theme.text} />
            <View style={s.waveform}>
              {[...Array(15)].map((_, i) => (
                <View key={i} style={[s.wavebar, { height: 4 + (i % 4) * 4, backgroundColor: isMe ? '#fff' : (theme.textMuted) }]} />
              ))}
            </View>
            <Text style={[s.voiceTime, isMe && { color: '#fff' }, !isMe && { color: theme.text }]}>
              {item.playing
                ? t('voicePlaying')
                : `${Math.floor((item.duration || 0) / 60)}:${String((item.duration || 0) % 60).padStart(2, '0')}`}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    // P1-12: одна галочка = sent на сервер, две = прочитано партнёром.
    // Без push-receipt у нас нет промежуточного «delivered», поэтому
    // не имитируем WhatsApp. Read — emerald (бренд), sent — приглушённый.
    const statusIcon = isMe ? (item.is_read ? '✓✓' : '✓') : '';
    const statusColor = isMe ? (item.is_read ? '#168A5B' : 'rgba(255,255,255,0.4)') : '';

    const tr = translations[item.id];
    const showingTranslation = tr && !tr.showOriginal;

    return (
      <View style={[s.msgRow, isMe && s.msgRowMe]}>
        {!isMe && partner?.name ? (
          <Text style={[s.senderLabel, { color: theme.textMuted }]}>{partner.name}</Text>
        ) : null}
        <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
          <Text style={[s.msgText, isMe ? s.msgTextMe : { color: v1.text }]}>
            {showingTranslation ? tr.text : item.text}
          </Text>
          {!isMe && item.id && (
            <TouchableOpacity
              style={{ marginTop: 4 }}
              onPress={async () => {
                if (tr) {
                  setTranslations(prev => ({ ...prev, [item.id]: { ...tr, showOriginal: !tr.showOriginal } }));
                  return;
                }
                setTranslating(item.id);
                try {
                  const r = await chatAPI.translate(item.id, getLanguage().toLowerCase());
                  if (r.translated_text) {
                    setTranslations(prev => ({ ...prev, [item.id]: { text: r.translated_text, provider: r.provider, showOriginal: false } }));
                  } else {
                    toast(t('translation_unavailable'), 'info');
                  }
                } catch {
                  toast(t('translation_unavailable'), 'info');
                }
                setTranslating(null);
              }}
              disabled={translating === item.id}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {!tr && translating !== item.id ? (
                  <Feather name="globe" size={12} color={isMe ? 'rgba(255,255,255,0.5)' : theme.textMuted} />
                ) : null}
                <Text style={{ color: isMe ? 'rgba(255,255,255,0.5)' : theme.textMuted, fontSize: 11 }}>
                  {translating === item.id ? '...' : tr ? (tr.showOriginal ? t('hide_original') : t('show_original')) : t('translate')}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Text style={[s.msgTime, isMe ? s.msgTimeMe : { color: v1.textMuted }]}>{item.time}</Text>
            {statusIcon ? <Text style={{ fontSize: 11, color: statusColor }}>{statusIcon}</Text> : null}
          </View>
        </View>
      </View>
    );
  };

  // v1: emerald accent regardless of role for the chat header (it's a
  // 1:1 conversation, no role-driven asymmetry to encode visually).
  const v1Accent = v1AccentFor(role === 'client' || role === 'shipper' ? 'client' : 'driver');

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top', 'bottom']}>
      {/* PR-C2 (chat keyboard P0): раньше KeyboardAvoidingView оборачивал
          ТОЛЬКО inputRow → на iOS клавиатура поднималась поверх FlatList
          и закрывала последние сообщения вместе с input'ом. Юзер не видел
          что вводит. Теперь весь экран (header + messages + input) живёт
          внутри KeyboardAvoidingView; behavior='padding' на iOS, 'height'
          на Android. flex:1 на корневом контейнере обязательно — иначе
          padding не считается. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      {/* WhatsApp-упрощение (04.08.2026): справа в шапке — только телефон,
          когда он есть у сделки. Глобус автоперевода переехал в меню «+»
          (реже нужен, чем звонок, и не должен жить в шапке рядом с именем). */}
      <BrandBarWithShare
        onBack={() => navigation.goBack()}
        accent={v1Accent.main}
        rightSlot={deal?.counterparty_phone ? (
          <TouchableOpacity
            onPress={() => contactPartner(deal.counterparty_phone)}
            style={s.iconBtn}
            testID="chat-header-call-btn"
            accessibilityLabel={t('call_partner')}
          >
            <Feather name="phone" size={18} color={v1Accent.main} />
          </TouchableOpacity>
        ) : undefined}
      />
      <View style={s.partnerStrip}>
        <View style={[s.partnerAvatar, { backgroundColor: v1Accent.soft, borderColor: v1Accent.main }]}>
          {/* Stage DS-1: первая буква от prettified имени, "?" для tech-leak. */}
          <Text style={s.partnerAvatarIcon}>{partnerInitial(prettifyPartnerName(resolvedPartner?.name, resolvedPartner?.id, t))}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {/* Stage DS-1: prettifyPartnerName подменяет guest_/d3/d4 на "Собеседник". */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.partnerName} numberOfLines={1} testID="chat-partner-name">{prettifyPartnerName(resolvedPartner?.name, resolvedPartner?.id, t)}</Text>
            {partnerOnline ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#168A5B' }} />
                <Text style={{ color: '#168A5B', fontSize: 11, fontWeight: '700' }}>{t('chat_online')}</Text>
              </View>
            ) : null}
          </View>
          {/* Маршрут/груз сделки теперь показывает только закреплённая
              карточка (DealRoomCard) ниже — вторая строка шапки не дублирует
              её, а несёт то, чего там нет: «печатает…» или роль собеседника
              (WhatsApp-упрощение 04.08.2026). */}
          {partnerTyping
            ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="edit-3" size={12} color="#168A5B" />
                <Text style={[s.online, { color: '#168A5B' }]}>{t('chat_typing')}</Text>
              </View>
            : ((resolvedPartner?.role === 'driver' || resolvedPartner?.role === 'client')
                ? <Text style={[s.online, { color: '#A8A29E' }]}>{t(resolvedPartner.role)}</Text>
                : null)}
        </View>
      </View>

      {/* Персистентный баннер сделки — всегда виден над списком сообщений */}
      {(bargainCargoId || bargainTripId) ? (
        <BargainCard
          cargoId={bargainCargoId}
          tripId={bargainTripId}
          myUserId={myId}
          refreshKey={bargainRefresh}
          onOpenModal={openBidModal}
          onDeal={onBargainDeal}
        />
      ) : null}
      {dealId ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
          <DealRoomCard deal={deal} role={role} />
          {/* Кнопка звонка переехала в шапку (chat-header-call-btn) —
              WhatsApp-упрощение 04.08.2026, отдельная во весь экран убрана. */}
          {/* Статус перевозки (05.08.2026, п.9 ТЗ): вместо горизонтальной
              шкалы Принят/В работе/На границе/Завершён — компактный текст
              «Текущий статус / Следующий шаг» + ОДНА кнопка следующего
              действия. Кнопки — единственное место действия теперь здесь
              (не в CargoDetail/TripDetail/Мои рейсы). */}
          {deal?.status && deal.status !== 'cancelled' ? (
            <View style={s.statusRow} testID="chat-deal-status-compact">
              <Text style={s.statusRowLabel}>{t('trip_current_status')}</Text>
              <Text style={[s.statusRowValue, { color: v1Accent.main }]}>{formatStatus(userFacingDealStatus(deal.status))}</Text>
            </View>
          ) : null}
          {(() => {
            // RC1: строгая ролевая FSM. Водитель начинает рейс и отмечает
            // фактическую доставку; грузоотправитель может только подтвердить
            // получение ПОСЛЕ статуса delivered. Никаких переходов
            // in_progress -> delivered со стороны грузоотправителя.
            if (!deal?.status || deal.status === 'cancelled' || deal.status === 'completed') return null;
            let action = null;
            if (role === 'driver') {
              if (deal.status === 'accepted') {
                action = { key: 'in_progress', icon: 'truck', label: t('start_delivery') };
              } else if (deal.status === 'in_progress' || deal.status === 'at_border') {
                action = { key: 'delivered', icon: 'package', label: t('mark_arrived') };
              }
            } else if (isShipperSide && deal.status === 'delivered') {
              action = { key: 'completed', icon: 'check-circle', label: t('confirm_delivery') };
            }
            if (!action) return null;
            return (
              <TouchableOpacity
                testID={
                  action.key === 'in_progress'
                    ? 'deal-action-start-delivery'
                    : action.key === 'delivered'
                      ? 'deal-action-mark-arrived'
                      : 'deal-action-confirm-receipt'
                }
                style={[s.dealNextBtn, { backgroundColor: v1Accent.main, opacity: statusLoading ? 0.6 : 1 }]}
                disabled={statusLoading}
                onPress={async () => {
                  let ok = true;
                  if (action.key === 'delivered' || action.key === 'completed') {
                    const message = action.key === 'delivered'
                      ? (t('confirm_mark_delivered') || 'Подтвердите, что груз действительно доставлен и передан получателю.')
                      : (t('confirm_receipt') || 'Подтвердите, что груз получен. После этого сделка будет завершена.');
                    ok = Platform.OS === 'web'
                      ? (typeof window !== 'undefined' && window.confirm(message))
                      : await new Promise((res) => Alert.alert(
                          action.label,
                          message,
                          [
                            { text: t('cancel'), style: 'cancel', onPress: () => res(false) },
                            { text: action.label, onPress: () => res(true) },
                          ],
                        ));
                  }
                  if (ok) changeDealStatus(action.key);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name={action.icon} size={16} color="#0C0A09" />
                  <Text style={s.dealNextBtnText}>{statusLoading ? '…' : action.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })()}
          {deal?.status === 'accepted' ? (
            <TouchableOpacity
              testID="deal-cancel-btn"
              style={[s.dealCancelBtn, { opacity: statusLoading ? 0.6 : 1 }]}
              disabled={statusLoading}
              onPress={async () => {
                const ok = Platform.OS === 'web'
                  ? (typeof window !== 'undefined' && window.confirm(t('cancel_deal_confirm')))
                  : await new Promise((res) => Alert.alert(t('cancel_deal_confirm'), '', [
                      { text: t('cancel'), style: 'cancel', onPress: () => res(false) },
                      { text: 'OK', onPress: () => res(true) },
                    ]));
                if (ok) changeDealStatus('cancelled');
              }}
            >
              <Text style={s.dealCancelBtnText}>⊘ {t('cancel_deal')}</Text>
            </TouchableOpacity>
          ) : null}
          {isShipperSide && dealId && ['accepted', 'in_progress'].includes(deal?.status) ? (
            <TouchableOpacity
              testID="deal-track-truck"
              style={s.dealTrackBtn}
              onPress={() => navigation.navigate('TrackTruck', {
                dealId, from: deal?.from_city, to: deal?.to_city,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="map-pin" size={14} color={v1.text} />
                <Text style={s.dealTrackBtnText}>{t('track_truck_btn')}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
          {dealEvents.length > 0 ? (
            <View testID="deal-timeline">
              {/* «На границе» временно убрана из пользовательского словаря
                  (05.08.2026, п.8 ТЗ) — событие о пересечении границы не
                  несёт действия для пользователя (следующая кнопка всё
                  равно «Доставлен»), поэтому не показываем его отдельной
                  строкой в ленте событий сделки. deal.status на бэкенде
                  при этом остаётся настоящим at_border. */}
              {dealEvents
                .filter((ev) => ev?.payload?.status !== 'at_border')
                .slice(-4)
                .map((ev) => (
                  <SystemEventRow key={ev.id || ev.event_type} ev={ev} />
                ))}
            </View>
          ) : null}
          <DealAttachments conversationId={roomId} role={role} compact attachTrigger={attachDocTick} />
          {acceptConfirm ? (
            <View style={s.acceptConfirm} testID="accept-bid-confirm">
              <Text style={s.acceptConfirmTitle}>{t('accept_bid_confirm_title')}</Text>
              <Text style={s.acceptConfirmText}>
                {t('accept_bid_confirm_text')} {deal?.amount != null ? formatPrice(deal.amount, deal.currency || 'USD', t) : ''}
              </Text>
              <View style={s.acceptConfirmRow}>
                <TouchableOpacity onPress={() => setAcceptConfirm(false)} style={s.acceptCancelBtn} disabled={accepting}>
                  <Text style={s.acceptCancelTxt}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={doAcceptBid} style={s.acceptOkBtn} disabled={accepting} testID="accept-bid-ok">
                  <Text style={s.acceptOkTxt}>{accepting ? '…' : t('action_accept_bid')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          {canAcceptBid ? (
            <DealQuickActions
              role={role}
              onAcceptBid={() => setAcceptConfirm(true)}
            />
          ) : null}
        </View>
      ) : null}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={i => i.id}
        renderItem={renderMessage}
        contentContainerStyle={s.msgList}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />
      {showPhrases && <QuickPhrases onSelect={(m) => { setShowPhrases(false); sendMessage(m); }} role={role} dealStatus={deal?.status} />}
      {/* Плашка записи: пульсирующая точка + таймер + подсказка. Без неё
          не видно, что запись идёт (жалоба владельца 26.07). */}
      {recording ? (
        <View style={s.recBanner} testID="voice-rec-banner">
          <View style={s.recDot} />
          <Text style={s.recText}>
            {t('voice_recording_live')} 0:{String(recordSecs % 60).padStart(2, '0')}
          </Text>
          <Text style={s.recHint}>{t('voice_recording_stop_hint')}</Text>
        </View>
      ) : null}
      {/* Чистая строка ввода (WeChat-стиль): [+] · поле · 🎤 · отправить.
          Все вложения — под «+» в панели ниже, чтобы главный экран был чистым. */}
      <View style={s.inputRow}>
        <TouchableOpacity
          onPress={() => { setShowPhrases(false); setShowAttach((v) => !v); }}
          style={[s.iconBtn, showAttach && { borderColor: v1Accent.main, transform: [{ rotate: '45deg' }] }]}
          testID="chat-attach-btn"
          accessibilityLabel={t('chat_attach')}
        >
          <Feather name="plus" size={20} color={showAttach ? v1Accent.main : v1.text} />
        </TouchableOpacity>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={onInputChange}
          onFocus={() => setShowAttach(false)}
          placeholder={t('message')}
          placeholderTextColor={v1.placeholder}
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
          testID="chat-input"
        />
        {/* WhatsApp-style: одна кнопка справа, а не две рядом — микрофон,
            пока поле пустое, отправка, как только появился текст
            (04.08.2026, п.5 ТЗ). Во время записи всегда виден стоп. */}
        {CHAT_VOICE_ENABLED && (!input.trim() || recording) ? (
          <TouchableOpacity
            onPress={toggleVoice}
            style={[s.sendBtn, { backgroundColor: recording ? v1Colors.error : v1Accent.main }]}
            testID="chat-voice-btn"
          >
            <Feather name={recording ? 'square' : 'mic'} size={18} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => sendMessage()}
            style={[s.sendBtn, { backgroundColor: v1Accent.main }]}
            testID="chat-send-btn"
            accessibilityLabel="Send"
          >
            <FontAwesome5 name="paper-plane" size={16} color="#FFFFFF" solid />
          </TouchableOpacity>
        )}
      </View>

      {/* Панель вложений (WeChat-сетка): открывается по «+». Тап по плитке
          закрывает панель и запускает действие. */}
      {showAttach && (
        <View style={s.attachPanel} testID="chat-attach-panel">
          {[
            CHAT_PHOTO_ENABLED ? { key: 'gallery', icon: 'image', label: t('gallery'), on: () => pickAndSend(false) } : null,
            CHAT_PHOTO_ENABLED ? { key: 'camera', icon: 'camera', label: t('camera'), on: () => pickAndSend(true) } : null,
            { key: 'loc', icon: 'map-pin', label: t('attach_location'), on: () => sendLocation() },
            { key: 'price', icon: 'dollar-sign', label: t('propose_price'), on: () => openBidModal('create') },
            // UX 26.07: «Документ» и «Поддержка» переехали сюда из шапки комнаты.
            dealId ? { key: 'doc', icon: 'file-text', label: t('chat_quick_action_send_document'), on: () => setAttachDocTick((n) => n + 1) } : null,
            { key: 'support', icon: 'life-buoy', label: t('chat_quick_action_call_support'), on: () => onCallSupport() },
            { key: 'phrases', icon: 'zap', label: t('quick_phrases'), on: () => setShowPhrases(true) },
            // Автоперевод переехал сюда из шапки (там остался только телефон).
            { key: 'translate', icon: 'globe', label: autoTranslate ? t('autotranslate_on') : t('translate'), on: () => {
              const next = !autoTranslate;
              setAutoTranslate(next);
              toast(next ? '🌐 ' + t('autotranslate_on') : t('autotranslate_off'), 'info', 1800);
            } },
          ].filter(Boolean).map((it) => (
            <TouchableOpacity
              key={it.key}
              style={s.attachTile}
              testID={`chat-attach-${it.key}`}
              onPress={() => { setShowAttach(false); it.on(); }}
            >
              <View style={s.attachIconBox}><Feather name={it.icon} size={22} color={v1.text} /></View>
              <Text style={s.attachLabel} numberOfLines={1}>{it.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      </KeyboardAvoidingView>

      {/* C2: fullscreen-просмотр вложения-фото. Тап по фото открывает; тап по
          фону или крестику — закрывает. Подписанный URL уже абсолютный
          (resolveAttachment применён при маппинге сообщений). */}
      <Modal visible={!!fullImage} transparent animationType="fade" onRequestClose={() => setFullImage(null)}>
        <Pressable style={s.fullBackdrop} onPress={() => setFullImage(null)} testID="chat-photo-fullscreen">
          {fullImage ? (
            <Image source={{ uri: fullImage }} style={s.fullImage} resizeMode="contain" />
          ) : null}
          <TouchableOpacity style={s.fullClose} onPress={() => setFullImage(null)} testID="chat-photo-close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="x" size={26} color="#fff" />
          </TouchableOpacity>
          {/* Сохранить/поделиться фото (жалоба владельца: некуда сохранить).
              На web открываем картинку в новой вкладке — там долгим тапом
              «Сохранить в фото»; на нативе — системный Share-лист. */}
          <TouchableOpacity
            style={s.fullSave}
            testID="chat-photo-save"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={(e) => { e.stopPropagation && e.stopPropagation(); saveFullImage(); }}
          >
            <Feather name="download" size={18} color="#fff" />
            <Text style={s.fullSaveTxt}>{t('save')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Modal>

      {/* Часть 2 — BidModal торга в чате. После успеха инкрементим
          bargainRefresh, чтобы карточка торга перечитала статус со сервера. */}
      <BidModal
        visible={bidModal.visible}
        onClose={() => setBidModal((m) => ({ ...m, visible: false }))}
        onSubmit={() => {
          setBidModal((m) => ({ ...m, visible: false }));
          setBargainRefresh((n) => n + 1);
        }}
        mode={bidModal.mode}
        cargoId={bargainCargoId}
        tripId={bargainTripId}
        bidId={bidModal.bidId}
        initialAmount={bidModal.amount}
        currency={listingCurrency || 'USD'}
      />
    </SafeAreaView>
  );
}

