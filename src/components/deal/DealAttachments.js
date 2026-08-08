// DealAttachments — рабочая секция вложений Deal Chat (PR3 media foundation).
// Заменяет DealDocumentsPlaceholder. Industrial Luxury, dark premium.
//
// Foundation:
//   - список вложений (GET /chat/conversations/{id}/attachments);
//   - кнопка «Прикрепить» → expo-image-picker → compressImage (document preset
//     1600/0.8 по §5 мастер-ТЗ) → POST attachments;
//   - upload-статусы: queued/uploading/uploaded/failed/retrying (локальный
//     state до подтверждения сервером, без потери при ошибке);
//   - retry для failed (без дублей: переиспользуем тот же optimistic id);
//   - НЕТ fake-uploaded: запись появляется в списке только после ответа сервера.
//
// Доступ к файлам закрыт на бэке (только участники) — фронт лишь рендерит.

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { chatAPI } from '../../utils/chatAPI';
import { compressImage } from '../../utils/imageCompress';
import { accentFor } from './DealRoom';

const STATUS_META = {
  queued:    { icon: 'clock',        color: '#7C8B82', key: 'chat_attach_status_queued' },
  uploading: { icon: 'upload-cloud', color: '#E06D00', key: 'chat_attach_status_uploading' },
  uploaded:  { icon: 'check-circle', color: '#168759', key: 'chat_attach_status_uploaded' },
  failed:    { icon: 'alert-circle', color: '#EF4444', key: 'chat_attach_status_failed' },
  retrying:  { icon: 'refresh-cw',   color: '#E06D00', key: 'chat_attach_status_retrying' },
};

let _localSeq = 0;

// Человекочитаемый label вложения (PR3.1): не показываем технический hash.
// PDF/document → «Документ»; image/photo → «Фото». Полный url/hash остаётся
// в данных (a.url), просто не выводится в UI.
function attachmentLabel(t, a) {
  const isDoc = a.kind === 'document' || a.mime_type === 'application/pdf';
  return isDoc ? t('attachment_document') : t('attachment_photo');
}

// compact (UX 26.07): кнопка «Прикрепить» скрыта (действие живёт в «+»-меню
// чата, см. attachTrigger), а при пустом списке блок не рендерится вовсе.
// attachTrigger: внешний тик — инкремент запускает onAttach() (пикер файла).
export default function DealAttachments({ conversationId, role = 'driver', compact = false, attachTrigger = 0 }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const accent = accentFor(role);
  // server-вложения + локальные (в процессе/failed) — локальные хранятся по
  // localId, чтобы retry не плодил дубли.
  const [server, setServer] = useState([]);
  const [local, setLocal] = useState([]);   // { localId, name, status }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId) return;
    try {
      const r = await chatAPI.listAttachments(conversationId);
      setServer(Array.isArray(r?.attachments) ? r.attachments : []);
    } catch { /* нет доступа/сети — список пуст, не падаем */ }
  }, [conversationId]);

  useEffect(() => { load(); }, [load]);

  // Полный путь загрузки одного вложения с прохождением статусов.
  const runUpload = useCallback(async (item) => {
    const { localId, uri, name, isPdf, mime } = item;
    const setStatus = (status) =>
      setLocal((prev) => prev.map((x) => (x.localId === localId ? { ...x, status } : x)));
    try {
      setStatus('uploading');
      // PDF/файл грузим как есть (без сжатия в JPEG — иначе документ ломался).
      // Фото — сжимаем пресетом document.
      const payload = isPdf
        ? { uri, kind: 'document', name, type: mime || 'application/pdf' }
        : { uri: await compressImage(uri, { preset: 'document' }), kind: 'document', name, type: 'image/jpeg' };
      await chatAPI.uploadAttachment(conversationId, payload);
      setLocal((prev) => prev.filter((x) => x.localId !== localId));
      await load();
    } catch {
      setStatus('failed');   // сообщение не теряется — остаётся с retry
    }
  }, [conversationId, load]);

  const queueUpload = (item) => {
    setLocal((prev) => [...prev, { ...item, status: 'queued' }]);
    runUpload(item);
  };

  // Фото из галереи (сжимаем).
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    const localId = `att_${Date.now()}_${_localSeq++}`;
    queueUpload({ localId, uri: res.assets[0].uri, name: `doc_${localId}.jpg`, isPdf: false });
  };

  // Файл-документ (PDF и пр.) через системный файловый менеджер.
  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    const file = res?.assets?.[0];
    if (!file?.uri) return;
    const localId = `att_${Date.now()}_${_localSeq++}`;
    const isPdf = (file.mimeType || '').includes('pdf') || /\.pdf$/i.test(file.name || '');
    queueUpload({ localId, uri: file.uri, name: file.name || `doc_${localId}.pdf`, isPdf, mime: file.mimeType });
  };

  const onAttach = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (Platform.OS === 'web') { await pickDocument(); return; }
      Alert.alert(t('chat_documents_title'), '', [
        { text: '📄 ' + t('attachment_document'), onPress: pickDocument },
        { text: '🖼 ' + t('gallery'), onPress: pickImage },
        { text: t('cancel'), style: 'cancel' },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const onRetry = (item) => {
    setLocal((prev) => prev.map((x) => (x.localId === item.localId ? { ...x, status: 'retrying' } : x)));
    runUpload(item);   // тот же localId → без дубля
  };

  // Внешний запуск пикера из «+»-меню чата (первый рендер не триггерит).
  const prevTrigger = React.useRef(attachTrigger);
  useEffect(() => {
    if (attachTrigger > prevTrigger.current) onAttach();
    prevTrigger.current = attachTrigger;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachTrigger]);

  const isEmpty = server.length === 0 && local.length === 0;
  if (compact && isEmpty) return null;

  const Row = ({ icon, label, statusKey, statusColor, onRetryPress }) => (
    <View style={s.row}>
      <Feather name={icon} size={14} color={theme.textMuted} />
      <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{label}</Text>
      {statusKey ? (
        <Text style={[s.status, { color: statusColor }]}>{t(statusKey)}</Text>
      ) : null}
      {onRetryPress ? (
        <TouchableOpacity onPress={onRetryPress} testID="attach-retry" style={s.retryBtn}>
          <Feather name="refresh-cw" size={13} color={accent} />
          <Text style={[s.retryTxt, { color: accent }]}>{t('chat_attach_retry')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={[s.box, { borderColor: theme.border }]} testID="deal-attachments">
      <View style={s.head}>
        <Feather name="folder" size={14} color={theme.textMuted} />
        <Text style={[s.title, { color: theme.text }]}>{t('chat_documents_title')}</Text>
        {!compact ? (
          <TouchableOpacity
            onPress={onAttach}
            disabled={busy}
            style={[s.attachBtn, { borderColor: accent, opacity: busy ? 0.5 : 1 }]}
            testID="attach-add"
          >
            {busy ? <ActivityIndicator size="small" color={accent} />
                  : <Feather name="paperclip" size={13} color={accent} />}
            <Text style={[s.attachTxt, { color: accent }]}>{t('chat_attach_add')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isEmpty ? (
        <Text style={[s.empty, { color: theme.textMuted }]}>{t('chat_attach_empty')}</Text>
      ) : (
        <View style={{ gap: 4 }}>
          {server.map((a) => {
            const meta = STATUS_META[a.upload_status] || STATUS_META.uploaded;
            return (
              <Row key={a.id}
                icon={a.kind === 'document' ? 'file-text' : 'image'}
                label={attachmentLabel(t, a)}
                statusKey={meta.key} statusColor={meta.color} />
            );
          })}
          {local.map((l) => {
            const meta = STATUS_META[l.status] || STATUS_META.queued;
            return (
              <Row key={l.localId}
                icon="file-text"
                label={t('attachment_document')}
                statusKey={meta.key} statusColor={meta.color}
                onRetryPress={l.status === 'failed' ? () => onRetry(l) : null} />
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, padding: 10, marginBottom: 8, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 12, fontWeight: '800', flex: 1 },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  attachTxt: { fontSize: 11, fontWeight: '800' },
  empty: { fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 11, flex: 1 },
  status: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  retryTxt: { fontSize: 11, fontWeight: '800' },
});
