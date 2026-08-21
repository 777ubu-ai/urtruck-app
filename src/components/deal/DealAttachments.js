// DealAttachments — private deal files rendered inline with the chat.
// Documents are sent from the chat "+" menu, messenger-style.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { chatAPI, documentKindFromFile } from '../../utils/chatAPI';
import { compressImage } from '../../utils/imageCompress';
import { accentFor } from './DealRoom';

const STATUS_META = {
  queued:    { icon: 'clock',        color: '#7C8B82', key: 'chat_attach_status_queued' },
  uploading: { icon: 'upload-cloud', color: '#168759', key: 'chat_attach_status_uploading' },
  uploaded:  { icon: 'check-circle', color: '#168759', key: 'chat_attach_status_uploaded' },
  failed:    { icon: 'alert-circle', color: '#EF4444', key: 'chat_attach_status_failed' },
  retrying:  { icon: 'refresh-cw',   color: '#168759', key: 'chat_attach_status_retrying' },
};

let _localSeq = 0;

function attachmentLabel(t, a) {
  const readable = a?.original_name || a?.filename || a?.file_name || a?.name;
  if (readable && !/^[a-f0-9]{24,}$/i.test(String(readable))) return String(readable);
  const isDoc = a?.kind === 'document' || !String(a?.mime_type || '').startsWith('image/');
  return isDoc ? t('attachment_document') : t('attachment_photo');
}

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function normalizeUploadError(error) {
  if (error?.isNetwork) return { code: 'network', status: null };
  const status = Number(error?.status) || null;
  if (status === 413) return { code: 'too_large', status };
  if (status === 415) return { code: 'unsupported', status };
  if (status === 401 || status === 403) return { code: 'forbidden', status };
  if (status === 409) return { code: 'already_uploading', status };
  if (status >= 500) return { code: 'server', status };
  return { code: 'failed', status };
}

function isImageAttachment(a) {
  return a?.kind === 'photo' || String(a?.mime_type || '').startsWith('image/');
}

function documentPickerTypes() {
  return [
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Some pickers report CSV under a different declared MIME than
    // text/csv — list every alias so the OS file picker doesn't grey it out.
    'text/csv', 'text/comma-separated-values', 'application/csv',
    'image/*',
  ];
}

export default function DealAttachments({
  conversationId,
  role = 'driver',
  compact = false,
  inline = false,
  attachTrigger = 0,
  documentTrigger = 0,
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const accent = accentFor(role);
  const [server, setServer] = useState([]);
  const [local, setLocal] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId) return;
    try {
      const r = await chatAPI.listAttachments(conversationId);
      setServer(Array.isArray(r?.attachments) ? r.attachments : []);
    } catch { /* private list remains unchanged on a transient error */ }
  }, [conversationId]);

  useEffect(() => { load(); }, [load]);

  const runUpload = useCallback(async (item) => {
    const { localId, uri, name, isImage, mime } = item;
    const patchLocal = (patch) =>
      setLocal((prev) => prev.map((x) => (x.localId === localId ? { ...x, ...patch } : x)));
    try {
      patchLocal({ status: item.status === 'retrying' ? 'retrying' : 'uploading', error: null });
      const uploadUri = isImage ? await compressImage(uri, { preset: 'document' }) : uri;
      const payload = {
        uri: uploadUri,
        kind: 'document',
        name,
        type: mime || 'application/octet-stream',
        // Stable across Retry. Backend uses it as an idempotency key.
        clientUploadId: localId,
      };
      await chatAPI.uploadAttachment(conversationId, payload);
      setLocal((prev) => prev.filter((x) => x.localId !== localId));
      await load();
    } catch (error) {
      patchLocal({ status: 'failed', error: normalizeUploadError(error) });
    }
  }, [conversationId, load]);

  const queueUpload = useCallback((item) => {
    setLocal((prev) => [...prev, { ...item, status: 'queued', error: null }]);
    runUpload({ ...item, status: 'queued' });
  }, [runUpload]);

  const pickImage = useCallback(async () => {
    if (!conversationId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    const asset = res.assets[0];
    const localId = `att_${Date.now()}_${_localSeq++}`;
    queueUpload({
      localId,
      uri: asset.uri,
      name: asset.fileName || `photo_${localId}.jpg`,
      isImage: true,
      mime: asset.mimeType || 'image/jpeg',
      size: asset.fileSize || null,
    });
  }, [conversationId, queueUpload]);

  const pickDocument = useCallback(async () => {
    if (!conversationId) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: documentPickerTypes(),
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res?.canceled) return;
    const file = res?.assets?.[0];
    if (!file?.uri) return;
    const localId = `att_${Date.now()}_${_localSeq++}`;
    const kind = documentKindFromFile(file.mimeType, file.name);
    // isImage (not isPdf) drives the compress-vs-passthrough branch in
    // runUpload below — an XLSX/XLS/CSV routed through compressImage() would
    // corrupt the file, so the gate must cover "is this a photo", not just
    // "is this specifically a PDF".
    queueUpload({
      localId,
      uri: file.uri,
      name: file.name || `document_${localId}.${kind.ext}`,
      isImage: kind.icon === 'image',
      // Safari may report application/octet-stream. Backend validates magic
      // bytes; chatAPI re-wraps the picked type for multipart.
      mime: kind.mime,
      size: file.size || null,
    });
  }, [conversationId, queueUpload]);

  const onAttach = useCallback(async () => {
    if (busy || !conversationId) return;
    setBusy(true);
    try {
      if (Platform.OS === 'web') {
        await pickDocument();
      } else {
        Alert.alert(t('chat_documents_title'), '', [
          { text: '📄 ' + t('attachment_document'), onPress: pickDocument },
          { text: '🖼 ' + t('gallery'), onPress: pickImage },
          { text: t('cancel'), style: 'cancel' },
        ]);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, conversationId, pickDocument, pickImage, t]);

  const onRetry = useCallback((item) => {
    if (item.status === 'uploading' || item.status === 'retrying') return;
    const retryItem = { ...item, status: 'retrying', error: null };
    setLocal((prev) => prev.map((x) => (x.localId === item.localId ? retryItem : x)));
    runUpload(retryItem);
  }, [runUpload]);

  const openAttachment = useCallback(async (item) => {
    const url = item?.url || item?.signed_url || item?.download_url;
    if (!url) return;
    try { await Linking.openURL(url); } catch { /* next load refreshes signed URL */ }
  }, []);

  const prevTrigger = React.useRef(attachTrigger);
  useEffect(() => {
    if (attachTrigger > prevTrigger.current) onAttach();
    prevTrigger.current = attachTrigger;
  }, [attachTrigger, onAttach]);

  const prevDocumentTrigger = React.useRef(documentTrigger);
  useEffect(() => {
    if (documentTrigger > prevDocumentTrigger.current) pickDocument();
    prevDocumentTrigger.current = documentTrigger;
  }, [documentTrigger, pickDocument]);

  const isEmpty = server.length === 0 && local.length === 0;
  if ((compact || inline) && isEmpty) return null;

  const Row = ({ icon, label, sublabel, statusKey, statusColor, spinning, onRetryPress, onOpen }) => {
    const Wrapper = onOpen ? TouchableOpacity : View;
    return (
      <Wrapper
        onPress={onOpen}
        activeOpacity={onOpen ? 0.72 : 1}
        style={[s.row, inline && [s.inlineRow, { backgroundColor: theme.card, borderColor: theme.border }]]}
        testID={onOpen ? 'deal-attachment-open' : undefined}
      >
        <View style={[s.fileIcon, { backgroundColor: '#E9F6EF' }]}>
          <Feather name={icon} size={16} color="#168759" />
        </View>
        <View style={s.fileText}>
          <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{label}</Text>
          {sublabel ? <Text style={[s.size, { color: theme.textMuted }]}>{sublabel}</Text> : null}
          {statusKey ? <Text style={[s.status, { color: statusColor }]}>{t(statusKey)}</Text> : null}
        </View>
        {spinning ? <ActivityIndicator size="small" color="#168759" /> : null}
        {onRetryPress ? (
          <TouchableOpacity onPress={onRetryPress} testID="attach-retry" style={s.retryBtn}>
            <Feather name="refresh-cw" size={14} color={accent} />
            <Text style={[s.retryTxt, { color: accent }]}>{t('chat_attach_retry')}</Text>
          </TouchableOpacity>
        ) : onOpen ? <Feather name="chevron-right" size={17} color={theme.textMuted} /> : null}
      </Wrapper>
    );
  };

  return (
    <View
      style={inline ? s.inlineBox : [s.box, { borderColor: theme.border }]}
      testID={inline ? 'deal-inline-attachments' : 'deal-attachments'}
    >
      {!inline ? (
        <View style={s.head}>
          <Feather name="paperclip" size={14} color={theme.textMuted} />
          <Text style={[s.title, { color: theme.text }]}>{t('chat_documents_title')}</Text>
          {!compact ? (
            <TouchableOpacity
              onPress={onAttach}
              disabled={busy}
              style={[s.attachBtn, { borderColor: accent, opacity: busy ? 0.5 : 1 }]}
              testID="attach-add"
            >
              {busy ? <ActivityIndicator size="small" color={accent} /> : <Feather name="plus" size={14} color={accent} />}
              <Text style={[s.attachTxt, { color: accent }]}>{t('chat_attach_add')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {isEmpty ? (
        <Text style={[s.empty, { color: theme.textMuted }]}>{t('chat_attach_empty')}</Text>
      ) : (
        <View style={{ gap: 6 }}>
          {server.map((a) => {
            const meta = STATUS_META[a.upload_status] || STATUS_META.uploaded;
            return (
              <Row
                key={a.id}
                icon={isImageAttachment(a) ? 'image' : 'file-text'}
                label={attachmentLabel(t, a)}
                sublabel={formatBytes(a.size_bytes)}
                statusKey={meta.key}
                statusColor={meta.color}
                onOpen={a.url ? () => openAttachment(a) : null}
              />
            );
          })}
          {local.map((item) => {
            const meta = STATUS_META[item.status] || STATUS_META.queued;
            return (
              <Row
                key={item.localId}
                icon={item.isImage ? 'image' : 'file-text'}
                label={item.name || attachmentLabel(t, item)}
                sublabel={formatBytes(item.size)}
                statusKey={meta.key}
                statusColor={meta.color}
                spinning={item.status === 'uploading' || item.status === 'retrying'}
                onRetryPress={item.status === 'failed' ? () => onRetry(item) : null}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8, gap: 7 },
  inlineBox: { paddingHorizontal: 12, paddingVertical: 7, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 12, fontWeight: '800', flex: 1 },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  attachTxt: { fontSize: 11, fontWeight: '800' },
  empty: { fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  inlineRow: { minHeight: 54, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
  fileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileText: { flex: 1, minWidth: 0 },
  name: { fontSize: 12.5, fontWeight: '750' },
  size: { fontSize: 10.5, fontWeight: '650', marginTop: 1 },
  status: { fontSize: 10.5, fontWeight: '800', marginTop: 2 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  retryTxt: { fontSize: 11, fontWeight: '800' },
});
