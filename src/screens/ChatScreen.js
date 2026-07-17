import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Image, AppState, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import * as ImagePicker from 'expo-image-picker';
import { useI18n } from '../utils/useI18n';
import { getLanguage } from '../utils/i18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { compressImage } from '../utils/imageCompress';
import { prettifyPartnerName, partnerInitial } from '../utils/displayName';
import { chatAPI } from '../utils/chatAPI';
import { marketAPI } from '../utils/marketAPI';
import { formatPrice } from '../utils/normalizers';
import { localizePlace } from '../utils/places';
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
import DealAttachments from '../components/deal/DealAttachments';

// HOT-006: реальная запись/воспроизведение для web (PWA deploy).
// На нативе (Expo Go) expo-av не установлен — тост "скоро".
const IS_WEB = Platform.OS === 'web';

// Stage 52: photo и voice upload в Support Chat не реализованы end-to-end (P0-1, Bug-B).
// Скрываем кнопки до отдельного PR с multipart upload endpoint.
// 4.3: включено — фото грузится в storage и шлётся ключом (см. sendPhoto).
// Финальная проверка загрузки/рендера на устройстве — Level 5.
const CHAT_PHOTO_ENABLED = true;
const CHAT_VOICE_ENABLED = false;

// Stage 52: локальный chat language pill не переводил содержимое чата (P0-3, P0-5),
// и среди опций оставался UZ (P0-4). Pill скрыт до реальной интеграции с chatAPI.translate.
const CHAT_LANG_PILL_ENABLED = false;
const LANGS = { RU: 'Русский', KK: 'Қазақша', EN: 'English', ZH: '中文' };
const LANG_KEYS = Object.keys(LANGS);

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
  chatOpened: { alignSelf: 'center', marginBottom: 16 },
  chatOpenedText: {
    fontSize: 11, paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: v1.surface, color: v1.textMuted,
    borderWidth: 1, borderColor: v1.border,
  },
  msgRow: { marginBottom: 10 },
  msgRowMe: { alignItems: 'flex-end' },
  senderLabel: { fontSize: 11, marginBottom: 3, marginLeft: 6, color: v1.textMuted },
  // B2B deal chat: компактнее и спокойнее (не consumer/WhatsApp). Меньше
  // padding/radius/maxWidth; outgoing — спокойный изумруд (не ядовитый #00E676).
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
  callBtn: { marginTop: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  callBtnText: { fontSize: 14, fontWeight: '800' },
  msgTime: { color: v1.textMuted, fontSize: 11, textAlign: 'right', marginTop: 3 },
  msgTimeMe: { color: 'rgba(234,251,241,0.55)' },
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
  photoMsg: { width: 200, height: 150, borderRadius: 12 },
  voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  wavebar: { width: 2, borderRadius: 1 },
  voiceTime: { fontSize: 11, minWidth: 30 },

  }), [v1]);
  const { partner, role, cargoId, tripId, roomId: initialRoomId, dealId, bidId } = route.params || {};
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
  const [recording, setRecording] = useState(false);
  const [lang, setLang] = useState('RU');
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
        return {
          id: String(m.id), from: fromMe ? 'me' : 'them',
          text: m.text, isPhoto: !!m.photo_url, photoUri: m.photo_url,
          isVoice: !!m.is_voice, time: fmtMsgTime(m.created_at),
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
            (srv.from === 'me' && srv.text === m.text)
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
    if (!partner?.id) return;
    chatAPI.rooms().then(d => {
      const room = (d.rooms || []).find(r =>
        r.participant_1 === partner.id || r.participant_2 === partner.id
      );
      if (room) {
        setRoomId(room.id);
        loadMessages(room.id);
      }
    }).catch(() => {});
  }, [partner?.id, initialRoomId]);

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
        const sent = await flushOutbox((p) => chatAPI.send(p));
        if (sent > 0 && mounted.current && roomId) loadMessages(roomId);
      } catch {}
    };
    doFlush();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') doFlush(); });
    return () => sub?.remove?.();
  }, [roomId]);

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
  useEffect(() => {
    if (!dealId) return;
    const p = route.params || {};
    setDeal({
      status: p.dealStatus, from_city: p.fromCity, to_city: p.toCity,
      cargo_desc: p.cargoDesc, cargo_id: p.cargoId, amount: p.amount, plate: p.plate,
    });
    marketAPI.getDeal(dealId)
      .then((srv) => {
        if (!srv || typeof srv !== 'object') return;
        setDeal((prev) => ({
          status: prev?.status || srv.status,
          from_city: prev?.from_city || srv.from_city,
          to_city: prev?.to_city || srv.to_city,
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
    chatAPI.dealTimeline(dealId)
      .then(r => setDealEvents(Array.isArray(r?.events) ? r.events : []))
      .catch(() => {});
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

  const onCallSupport = async () => {
    try {
      await chatAPI.supportEscalate({ conversationId: roomId || null, reason: 'chat_cta' });
      toast(t('chat_support_pending'), 'success');
    } catch { /* без фейков — просто не падаем */ }
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

    // Сохраняем на сервере; при сбое — в офлайн-очередь (ретрай позже).
    try {
      const r = await chatAPI.send(payload);
      if (r.room_id) setRoomId(r.room_id);
    } catch {
      await enqueueOutbox({ clientId, payload });
      toast(t('chat_queued'), 'info', 2500);
    }
  };

  const sendPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { toast(t('photo_permission'), 'warn'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (r.canceled || !r.assets?.[0]) return;
      const uri = r.assets[0].uri;
      let photoUri = uri;
      try { photoUri = await compressImage(uri, { maxSide: 800, quality: 0.7 }); } catch { /* fallback: оригинал */ }
      setMessages(prev => [...prev, {
        id: Date.now().toString(), from: 'me',
        text: '', isPhoto: true, photoUri,
        time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
      }]);
      const toId = recipientId();
      if (!toId) { toast(t('chat_send_failed'), 'error'); return; }
      // 4.3: сначала грузим фото в storage → ключ, затем шлём сообщение с
      // ключом (раньше слали локальный uri устройства — не резолвился у
      // получателя). Сервер подпишет ключ на чтении, фото видно обеим сторонам.
      try {
        const up = await chatAPI.uploadChatPhoto(photoUri);
        const key = up?.photo_key;
        if (!key) throw new Error('no_key');
        await chatAPI.send({ toUserId: toId, photoUrl: key, cargoId, tripId });
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
  const appendVoiceMessage = (uri, duration) => {
    const mm = String(Math.floor(duration / 60)).padStart(1, '0');
    const ss = String(duration % 60).padStart(2, '0');
    setMessages(prev => [...prev, {
      id: Date.now().toString(), from: 'me',
      text: `🎤 ${mm}:${ss}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isVoice: true, playing: false, voiceUrl: uri, duration,
    }]);
    const toId = recipientId();
    if (toId) {
      chatAPI.send({
        toUserId: toId,
        text: `🎤 ${t('chat_voice_message')} (${duration}${t('unit_sec_short')})`,
        isVoice: true, voiceDuration: duration,
        cargoId, tripId,
      }).catch(() => toast(t('chat_send_failed'), 'error'));
    } else {
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
      toast(t('voice_recording'), 'info', 3000);
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

  const cycleLang = () => {
    const next = LANG_KEYS[(LANG_KEYS.indexOf(lang) + 1) % LANG_KEYS.length];
    setLang(next);
    toast(`🌐 ${LANGS[next]}`, 'info', 1500);
  };

  const renderMessage = ({ item }) => {
    const isMe = item.from === 'me';
    if (item.isPhoto) {
      return (
        <View style={[s.msgRow, isMe && s.msgRowMe]}>
          {!isMe && partner?.name ? (
            <Text style={[s.senderLabel, { color: theme.textMuted }]}>{partner.name}</Text>
          ) : null}
          <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem, { padding: 4 }]}>
            <Image source={{ uri: item.photoUri }} style={s.photoMsg} />
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
            <Text style={{ fontSize: 20 }}>{item.playing ? '⏸' : '▶️'}</Text>
            <View style={s.waveform}>
              {[...Array(15)].map((_, i) => (
                <View key={i} style={[s.wavebar, { height: 4 + (i % 4) * 4, backgroundColor: isMe ? '#fff' : (theme.textMuted) }]} />
              ))}
            </View>
            <Text style={[s.voiceTime, isMe && { color: '#fff' }, !isMe && { color: theme.text }]}>{item.playing ? t('voicePlaying') : '0:04'}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // P1-12: одна галочка = sent на сервер, две = прочитано партнёром.
    // Без push-receipt у нас нет промежуточного «delivered», поэтому
    // не имитируем WhatsApp. Read — emerald (бренд), sent — приглушённый.
    const statusIcon = isMe ? (item.is_read ? '✓✓' : '✓') : '';
    const statusColor = isMe ? (item.is_read ? '#22C55E' : 'rgba(255,255,255,0.4)') : '';

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
              <Text style={{ color: isMe ? 'rgba(255,255,255,0.5)' : theme.textMuted, fontSize: 11 }}>
                {translating === item.id ? '...' : tr ? (tr.showOriginal ? t('hide_original') : t('show_original')) : '🌐 ' + t('translate')}
              </Text>
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
      <BrandBarWithShare
        onBack={() => navigation.goBack()}
        accent={v1Accent.main}
        onShare={() => {
          const next = !autoTranslate;
          setAutoTranslate(next);
          toast(next ? '🌐 ' + t('autotranslate_on') : t('autotranslate_off'), 'info', 1800);
        }}
        rightTestID="chat-autotranslate-btn"
        rightIcon={autoTranslate ? '🌐 ✓' : '🌐'}
      />
      <View style={s.partnerStrip}>
        <View style={[s.partnerAvatar, { backgroundColor: v1Accent.soft, borderColor: v1Accent.main }]}>
          {/* Stage DS-1: первая буква от prettified имени, "?" для tech-leak. */}
          <Text style={s.partnerAvatarIcon}>{partnerInitial(prettifyPartnerName(resolvedPartner?.name, resolvedPartner?.id, t))}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {/* Stage DS-1: prettifyPartnerName подменяет guest_/d3/d4 на "Собеседник". */}
          <Text style={s.partnerName} numberOfLines={1} testID="chat-partner-name">{prettifyPartnerName(resolvedPartner?.name, resolvedPartner?.id, t)}</Text>
          {/* Маршрут груза в шапке — сразу видно, по какому заказу чат.
              Если маршрут известен (есть сделка) — показываем его; иначе
              честную роль собеседника (Водитель/Грузовладелец). */}
          {deal && (deal.from_city || deal.to_city || deal.cargo_desc)
            ? <Text style={[s.online, { color: v1Accent.main }]} numberOfLines={1}>
                {deal.cargo_desc ? `📦 ${deal.cargo_desc} · ` : '📍 '}
                {localizePlace(deal.from_city || '—', getLanguage())} → {localizePlace(deal.to_city || '—', getLanguage())}
              </Text>
            : ((resolvedPartner?.role === 'driver' || resolvedPartner?.role === 'client')
                ? <Text style={[s.online, { color: '#A8A29E' }]}>{t(resolvedPartner.role)}</Text>
                : null)}
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={i => i.id}
        renderItem={renderMessage}
        contentContainerStyle={s.msgList}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {dealId ? (
              <View style={{ marginBottom: 10 }}>
                <DealRoomCard deal={deal} role={role} />
                {/* Позвонить контрагенту — телефон доступен только участнику
                    сделки (backend get_deal отдаёт его строго участнику). */}
                {deal?.counterparty_phone ? (
                  <TouchableOpacity
                    style={[s.callBtn, { borderColor: v1Accent.main }]}
                    onPress={() => Linking.openURL(`tel:${String(deal.counterparty_phone).replace(/[^\d+]/g, '')}`).catch(() => {})}
                    testID="deal-call-btn"
                  >
                    <Text style={[s.callBtnText, { color: v1Accent.main }]}>📞 {t('call_partner')}</Text>
                  </TouchableOpacity>
                ) : null}
                {dealEvents.length > 0 ? (
                  <View testID="deal-timeline">
                    {dealEvents.slice(-4).map((ev) => (
                      <SystemEventRow key={ev.id || ev.event_type} ev={ev} />
                    ))}
                  </View>
                ) : null}
                <DealAttachments conversationId={roomId} role={role} />
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
                <DealQuickActions
                  role={role}
                  onCallSupport={onCallSupport}
                  onAcceptBid={canAcceptBid ? () => setAcceptConfirm(true) : undefined}
                />
              </View>
            ) : null}
            <View style={s.chatOpened}>
              <Text style={s.chatOpenedText}>
                {t('chatOpened')}
                {CHAT_LANG_PILL_ENABLED ? ` · ${t('translation')}: ${LANGS[lang]}` : ''}
              </Text>
            </View>
          </View>
        }
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />
      {showPhrases && <QuickPhrases onSelect={sendMessage} role={role} />}
      <View style={s.inputRow}>
        <TouchableOpacity onPress={() => setShowPhrases(!showPhrases)} style={s.iconBtn}>
          <Text style={s.iconBtnText}>⚡</Text>
        </TouchableOpacity>
        {CHAT_PHOTO_ENABLED && (
          <TouchableOpacity onPress={sendPhoto} style={s.iconBtn}>
            <Text style={s.iconBtnText}>📷</Text>
          </TouchableOpacity>
        )}
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder={t('message')}
          placeholderTextColor={v1.placeholder}
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
          testID="chat-input"
        />
        {CHAT_VOICE_ENABLED && (
          <TouchableOpacity
            onPress={toggleVoice}
            style={[s.iconBtn, recording && { backgroundColor: v1Colors.error, borderColor: v1Colors.error }]}
          >
            <Text style={s.iconBtnText}>{recording ? '⏹' : '🎤'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => sendMessage()}
          style={[s.sendBtn, { backgroundColor: v1Accent.main }]}
          testID="chat-send-btn"
          accessibilityLabel="Send"
        >
          <FontAwesome5 name="paper-plane" size={16} color="#FFFFFF" solid />
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

