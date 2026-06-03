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
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { chatAPI } from '../../utils/chatAPI';
import { compressImage } from '../../utils/imageCompress';
import { accentFor } from './DealRoom';

const STATUS_META = {
  queued:    { icon: 'clock',        color: '#94A3B8', key: 'chat_attach_status_queued' },
  uploading: { icon: 'upload-cloud', color: '#F59E0B', key: 'chat_attach_status_uploading' },
  uploaded:  { icon: 'check-circle', color: '#22C55E', key: 'chat_attach_status_uploaded' },
  failed:    { icon: 'alert-circle', color: '#EF4444', key: 'chat_attach_status_failed' },
  retrying:  { icon: 'refresh-cw',   color: '#F59E0B', key: 'chat_attach_status_retrying' },
};

let _localSeq = 0;

// Человекочитаемый label вложения (PR3.1): не показываем технический hash.
// PDF/document → «Документ»; image/photo → «Фото». Полный url/hash остаётся
// в данных (a.url), просто не выводится в UI.
function attachmentLabel(t, a) {
  const isDoc = a.kind === 'document' || a.mime_type === 'application/pdf';
  return isDoc ? t('attachment_document') : t('attachment_photo');
}

export default function DealAttachments({ conversationId, role = 'driver' }) {
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
    const { localId, uri, name } = item;
    const setStatus = (status) =>
      setLocal((prev) => prev.map((x) => (x.localId === localId ? { ...x, status } : x)));
    try {
      setStatus('uploading');
      const compressed = await compressImage(uri, { preset: 'document' });
      await chatAPI.uploadAttachment(conversationId, {
        uri: compressed, kind: 'document', name, type: 'image/jpeg',
      });
      // успех: убираем из local, перечитываем server-список (без fake-строк)
      setLocal((prev) => prev.filter((x) => x.localId !== localId));
      await load();
    } catch {
      setStatus('failed');   // сообщение не теряется — остаётся с retry
    }
  }, [conversationId, load]);

  const onAttach = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') { setBusy(false); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1,
      });
      if (res.canceled || !res.assets?.[0]?.uri) { setBusy(false); return; }
      const uri = res.assets[0].uri;
      const localId = `att_${Date.now()}_${_localSeq++}`;
      const name = `doc_${localId}.jpg`;
      setLocal((prev) => [...prev, { localId, uri, name, status: 'queued' }]);
      runUpload({ localId, uri, name });
    } finally {
      setBusy(false);
    }
  };

  const onRetry = (item) => {
    setLocal((prev) => prev.map((x) => (x.localId === item.localId ? { ...x, status: 'retrying' } : x)));
    runUpload(item);   // тот же localId → без дубля
  };

  const isEmpty = server.length === 0 && local.length === 0;

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
  attachTxt: { fontSize: 10, fontWeight: '800' },
  empty: { fontSize: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 11, flex: 1 },
  status: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  retryTxt: { fontSize: 9, fontWeight: '800' },
});
