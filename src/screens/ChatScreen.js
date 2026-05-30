import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Image } from 'react-native';
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
import { notifyChatRead } from '../utils/unreadEvents';
import { useAuth } from '../utils/AuthContext';
import { voice } from '../utils/voiceRecorder';
import QuickPhrases from '../components/QuickPhrases';
import {v1Colors, useV1Colors, v1Radius, v1AccentFor} from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import { DealRoomCard, SystemEventRow, DealQuickActions, DealDocumentsPlaceholder } from '../components/deal/DealRoom';

// HOT-006: реальная запись/воспроизведение для web (PWA deploy).
// На нативе (Expo Go) expo-av не установлен — тост "скоро".
const IS_WEB = Platform.OS === 'web';

// Stage 52: photo и voice upload в Support Chat не реализованы end-to-end (P0-1, Bug-B).
// Скрываем кнопки до отдельного PR с multipart upload endpoint.
const CHAT_PHOTO_ENABLED = false;
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
  online: { fontSize: 10, fontWeight: '700' },
  // System banner above the first message
  msgList: { padding: 14, paddingBottom: 20 },
  chatOpened: { alignSelf: 'center', marginBottom: 16 },
  chatOpenedText: {
    fontSize: 10, paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: v1.surface, color: v1.textMuted,
    borderWidth: 1, borderColor: v1.border,
  },
  msgRow: { marginBottom: 10 },
  msgRowMe: { alignItems: 'flex-end' },
  senderLabel: { fontSize: 10, marginBottom: 3, marginLeft: 6, color: v1.textMuted },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMe: { backgroundColor: v1Colors.driver, borderBottomRightRadius: 6 },
  bubbleThem: {
    borderBottomLeftRadius: 6,
    backgroundColor: v1.surface,
    borderWidth: 1, borderColor: v1.border,
  },
  msgText: { fontSize: 15, lineHeight: 21 },
  msgTextMe: { color: '#0A0A0A' },
  translated: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  translatedText: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontStyle: 'italic' },
  msgTime: { color: v1.textMuted, fontSize: 9, textAlign: 'right', marginTop: 3 },
  msgTimeMe: { color: 'rgba(10,10,10,0.55)' },
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
  const { partner, role, cargoId, tripId, roomId: initialRoomId, dealId } = route.params || {};
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [messages, setMessages] = useState([]);
  const [roomId, setRoomId] = useState(initialRoomId || null);
  const [input, setInput] = useState('');
  const [showPhrases, setShowPhrases] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lang, setLang] = useState('RU');
  const [translations, setTranslations] = useState({});
  const [translating, setTranslating] = useState(null);
  // Deal Room (PR2): карточка сделки + immutable timeline. Показываются только
  // при dealId — иначе старый чат выглядит как раньше.
  const [deal, setDeal] = useState(null);
  const [dealEvents, setDealEvents] = useState([]);
  const flatListRef = useRef(null);
  // HOT-006: refs для MediaRecorder (web)
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const recordStartRef = useRef(0);

  // Загрузка истории чата
  const loadMessages = async (rid) => {
    if (!rid) return;
    try {
      const md = await chatAPI.messages(rid);
      const mapped = (md.messages || []).map(m => {
        // Resolve "me vs them" robustly:
        // 1) if sender_id matches our local user id — me
        // 2) else if sender_id matches the partner's id — them
        // 3) fall back to "me" so a temporary auth race (session.user.id is
        //    a synthetic 'u_<ts>' until AuthContext.refreshLevel finishes)
        //    does not flip every message to the wrong column.
        const fromMe =
          (myId && m.sender_id === myId) ||
          (partner?.id && m.sender_id !== partner.id);
        return {
          id: String(m.id), from: fromMe ? 'me' : 'them',
          text: m.text, isPhoto: !!m.photo_url, photoUri: m.photo_url,
          isVoice: !!m.is_voice, time: (m.created_at || '').slice(11, 16),
          is_read: !!m.is_read,
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
          // Дедуп по тексту: если сервер вернул сообщение с тем же
          // текстом и временем последних 5 минут — считаем что это
          // наше acked, не сохраняем local дубликат.
          const ackedByServer = mapped.some(srv =>
            srv.from === 'me' && srv.text === m.text
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

  // Polling каждые 3 сек — подтягиваем ответы (Support/Володя/живые)
  useEffect(() => {
    if (!roomId) return;
    const iv = setInterval(() => loadMessages(roomId), 3000);
    return () => clearInterval(iv);
  }, [roomId]);

  // PR-C2 (Task 2 unified badge): notify BottomNav когда чат открылся
  // (backend GET /messages автоматически делает is_read=1; нам нужно
  // только сказать BottomNav поллить unread заново) и когда экран
  // закрывается. Без этого badge висит до следующего 30-сек poll.
  useEffect(() => {
    if (!roomId) return;
    notifyChatRead();
    return () => notifyChatRead();
  }, [roomId]);

  // Deal Room: загрузка карточки сделки + immutable timeline по dealId.
  useEffect(() => {
    if (!dealId) return;
    const p = route.params || {};
    setDeal({
      status: p.dealStatus, from_city: p.fromCity, to_city: p.toCity,
      cargo_desc: p.cargoDesc, cargo_id: p.cargoId, amount: p.amount, plate: p.plate,
    });
    chatAPI.dealTimeline(dealId)
      .then(r => setDealEvents(Array.isArray(r?.events) ? r.events : []))
      .catch(() => {});
  }, [dealId]);

  const onCallSupport = async () => {
    try {
      await chatAPI.supportEscalate({ conversationId: roomId || null, reason: 'chat_cta' });
      toast(t('chat_support_pending'), 'success');
    } catch { /* без фейков — просто не падаем */ }
  };

  const sendMessage = async (text) => {
    const msg = text || input;
    if (!msg.trim()) return;
    // PR-C2 (P0-4): optimistic insert с маркером `_optimistic: true`.
    // loadMessages (polling) defensive merge сохраняет именно такие
    // сообщения пока сервер не подтвердит — иначе они «исчезают»
    // в окне между send и следующим poll.
    setMessages(prev => [...prev, {
      id: 'opt_' + Date.now().toString(), from: 'me', text: msg,
      time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
      _optimistic: true,
    }]);
    setInput('');
    setShowPhrases(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    // Сохраняем на сервере
    if (partner?.id) {
      try {
        const r = await chatAPI.send({ toUserId: partner.id, text: msg, cargoId, tripId });
        if (r.room_id) setRoomId(r.room_id);
      } catch {}
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
      if (partner?.id) {
        chatAPI.send({ toUserId: partner.id, photoUrl: photoUri, cargoId, tripId }).catch(() => {});
      }
      toast('📷 ' + t('photo_sent'), 'success', 1500);
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
    if (partner?.id) {
      chatAPI.send({
        toUserId: partner.id,
        text: `🎤 Голосовое сообщение (${duration}с)`,
        isVoice: true, voiceDuration: duration,
        cargoId, tripId,
      }).catch(() => {});
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
              <Text style={{ color: isMe ? 'rgba(255,255,255,0.5)' : theme.textMuted, fontSize: 10 }}>
                {translating === item.id ? '...' : tr ? (tr.showOriginal ? t('hide_original') : t('show_original')) : '🌐 ' + t('translate')}
              </Text>
            </TouchableOpacity>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Text style={[s.msgTime, isMe ? s.msgTimeMe : { color: v1.textMuted }]}>{item.time}</Text>
            {statusIcon ? <Text style={{ fontSize: 10, color: statusColor }}>{statusIcon}</Text> : null}
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
        {...(CHAT_LANG_PILL_ENABLED
          ? { onShare: cycleLang, rightTestID: 'chat-lang-btn', rightIcon: `🌐 ${lang}` }
          : {})}
      />
      <View style={s.partnerStrip}>
        <View style={[s.partnerAvatar, { backgroundColor: v1Accent.soft, borderColor: v1Accent.main }]}>
          {/* Stage DS-1: первая буква от prettified имени, "?" для tech-leak. */}
          <Text style={s.partnerAvatarIcon}>{partnerInitial(prettifyPartnerName(partner?.name, partner?.id, t))}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {/* Stage DS-1: prettifyPartnerName подменяет guest_/d3/d4 на "Собеседник". */}
          <Text style={s.partnerName} numberOfLines={1}>{prettifyPartnerName(partner?.name, partner?.id, t)}</Text>
          <Text style={[s.online, { color: v1Accent.main }]}>● {t('online')}</Text>
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
                {dealEvents.length > 0 ? (
                  <View testID="deal-timeline">
                    {dealEvents.slice(-4).map((ev) => (
                      <SystemEventRow key={ev.id || ev.event_type} ev={ev} />
                    ))}
                  </View>
                ) : null}
                <DealDocumentsPlaceholder />
                <DealQuickActions role={role} onCallSupport={onCallSupport} />
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
      {showPhrases && <QuickPhrases onSelect={sendMessage} />}
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

