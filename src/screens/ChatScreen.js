import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { compressImage } from '../utils/imageCompress';
import { chatAPI } from '../utils/chatAPI';
import { useAuth } from '../utils/AuthContext';
import { voice } from '../utils/voiceRecorder';
import QuickPhrases from '../components/QuickPhrases';

// HOT-006: реальная запись/воспроизведение для web (PWA deploy).
// На нативе (Expo Go) expo-av не установлен — тост "скоро".
const IS_WEB = Platform.OS === 'web';

const LANGS = { RU: 'Русский', UZ: 'Ўзбекча', KZ: 'Қазақша', CN: '中文' };
const LANG_KEYS = Object.keys(LANGS);

export default function ChatScreen({ navigation, route }) {
  const { partner, role, cargoId, tripId } = route.params || {};
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [messages, setMessages] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [input, setInput] = useState('');
  const [showPhrases, setShowPhrases] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lang, setLang] = useState('RU');
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
      const mapped = (md.messages || []).map(m => ({
        id: String(m.id), from: m.sender_id === myId ? 'me' : 'them',
        text: m.text, isPhoto: !!m.photo_url, photoUri: m.photo_url,
        isVoice: !!m.is_voice, time: (m.created_at || '').slice(11, 16),
        is_read: !!m.is_read,
      }));
      // Обновляем только если количество изменилось (не мерцаем)
      setMessages(prev => mapped.length !== prev.length ? mapped : prev);
    } catch {}
  };

  useEffect(() => {
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
  }, [partner?.id]);

  // Polling каждые 3 сек — подтягиваем ответы (Support/Володя/живые)
  useEffect(() => {
    if (!roomId) return;
    const iv = setInterval(() => loadMessages(roomId), 3000);
    return () => clearInterval(iv);
  }, [roomId]);

  const sendMessage = async (text) => {
    const msg = text || input;
    if (!msg.trim()) return;
    setMessages(prev => [...prev, {
      id: Date.now().toString(), from: 'me', text: msg,
      time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
    }]);
    setInput('');
    setShowPhrases(false);

    // Сохраняем на сервере
    if (partner?.id) {
      try {
        const r = await chatAPI.send({ toUserId: partner.id, text: msg, cargoId, tripId });
        if (r.room_id) setRoomId(r.room_id);
      } catch {}
    }
  };

  const sendPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { toast('Нужен доступ к фото', 'warn'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (r.canceled || !r.assets?.[0]) return;
    const compressed = await compressImage(r.assets[0].uri, { maxSide: 800, quality: 0.7 });
    setMessages(prev => [...prev, {
      id: Date.now().toString(), from: 'me',
      text: '', isPhoto: true, photoUri: compressed,
      time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
    }]);
    // Сохраняем на сервере
    if (partner?.id) {
      chatAPI.send({ toUserId: partner.id, photoUrl: compressed, cargoId, tripId }).catch(() => {});
    }
    toast('📷 Фото отправлено', 'success', 1500);
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
          <View style={[s.bubble, isMe ? s.bubbleMe : [s.bubbleThem, { backgroundColor: theme.card }], { padding: 4 }]}>
            <Image source={{ uri: item.photoUri }} style={s.photoMsg} />
            <Text style={[s.msgTime, isMe && s.msgTimeMe, { marginTop: 4, marginRight: 4 }]}>{item.time}</Text>
          </View>
        </View>
      );
    }
    if (item.isVoice) {
      return (
        <View style={[s.msgRow, isMe && s.msgRowMe]}>
          <TouchableOpacity
            style={[s.bubble, s.voiceBubble, isMe ? s.bubbleMe : [s.bubbleThem, { backgroundColor: theme.card }]]}
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
    // Статус: ✓ отправлено, ✓✓ доставлено/прочитано
    const statusIcon = isMe ? (item.is_read ? '✓✓' : '✓') : '';
    const statusColor = isMe ? (item.is_read ? '#60A5FA' : 'rgba(255,255,255,0.4)') : '';

    return (
      <View style={[s.msgRow, isMe && s.msgRowMe]}>
        <View style={[s.bubble, isMe ? s.bubbleMe : [s.bubbleThem, { backgroundColor: theme.card }]]}>
          <Text style={[s.msgText, isMe ? s.msgTextMe : { color: theme.text }]}>{item.text}</Text>
          {item.translated && <View style={s.translated}><Text style={s.translatedText}>🌐 {item.translated}</Text></View>}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Text style={[s.msgTime, isMe && s.msgTimeMe]}>{item.time}</Text>
            {statusIcon ? <Text style={{ fontSize: 10, color: statusColor }}>{statusIcon}</Text> : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[s.backText, { color: theme.text }]}>‹</Text></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={[s.partnerName, { color: theme.text }]}>{partner?.name || '—'}</Text><Text style={s.online}>● {t('online')}</Text></View>
        <TouchableOpacity onPress={cycleLang} style={[s.langBtn, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[s.langText, { color: theme.textMuted }]}>🌐 {lang}</Text></TouchableOpacity>
      </View>
      <FlatList ref={flatListRef} data={messages} keyExtractor={i => i.id} renderItem={renderMessage} contentContainerStyle={s.msgList}
        ListHeaderComponent={<View style={s.chatOpened}><Text style={[s.chatOpenedText, { backgroundColor: theme.card, color: theme.textMuted }]}>{t('chatOpened')} · {t('translation')}: {LANGS[lang]}</Text></View>}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })} />
      {showPhrases && <QuickPhrases onSelect={sendMessage} />}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.inputRow, { borderTopColor: theme.border }]}>
          <TouchableOpacity onPress={() => setShowPhrases(!showPhrases)} style={[s.iconBtn, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={{ fontSize: 16 }}>⚡</Text></TouchableOpacity>
          <TouchableOpacity onPress={sendPhoto} style={[s.iconBtn, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={{ fontSize: 16 }}>📷</Text></TouchableOpacity>
          <TextInput style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]} value={input} onChangeText={setInput} placeholder={t('message')} placeholderTextColor={theme.textMuted} onSubmitEditing={() => sendMessage()} returnKeyType="send" />
          <TouchableOpacity onPress={toggleVoice} style={[s.iconBtn, { backgroundColor: theme.card, borderColor: theme.border }, recording && { backgroundColor: '#EF4444', borderColor: '#EF4444' }]}><Text style={{ fontSize: 16 }}>{recording ? '⏹' : '🎤'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => sendMessage()} style={s.sendBtn}><Text style={{ fontSize: 16, color: '#fff' }}>➤</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, borderBottomWidth: 1 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  partnerName: { fontSize: 15, fontWeight: '700' },
  online: { color: '#22C55E', fontSize: 10 },
  langBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  langText: { fontSize: 11 },
  msgList: { padding: 14, paddingBottom: 8 },
  chatOpened: { alignSelf: 'center', marginBottom: 16 },
  chatOpenedText: { fontSize: 10, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16, overflow: 'hidden' },
  msgRow: { marginBottom: 8 },
  msgRowMe: { alignItems: 'flex-end' },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  bubbleMe: { backgroundColor: '#2563EB', borderBottomRightRadius: 4 },
  bubbleThem: { borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14 },
  msgTextMe: { color: '#fff' },
  translated: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  translatedText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontStyle: 'italic' },
  msgTime: { color: 'rgba(255,255,255,0.3)', fontSize: 9, textAlign: 'right', marginTop: 3 },
  msgTimeMe: { color: 'rgba(255,255,255,0.4)' },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 6, borderTopWidth: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1 },
  sendBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  photoMsg: { width: 200, height: 150, borderRadius: 12 },
  voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  wavebar: { width: 2, borderRadius: 1 },
  voiceTime: { fontSize: 11, minWidth: 30 },
});
