import { Directory, File, Paths } from 'expo-file-system';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Platform } from 'react-native';
import { chatAPI } from './chatAPI';
import { openPrivateAttachment } from './privateAttachmentOpen';

const CACHE_PREFIX = 'urtruck-private-attachment-';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function sweepExpiredCache(now = Date.now()) {
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      const name = String(entry?.name || '');
      const match = name.match(/^urtruck-private-attachment-(\d+)-[a-z0-9_-]+\.(pdf|xls|xlsx|csv|jpe?g|png)$/i);
      if (!match || now - Number(match[1]) < CACHE_TTL_MS) continue;
      const file = new File(entry.uri);
      if (file.exists) file.delete();
    }
  } catch { /* temporary private files remain isolated in the app cache */ }
}

function extensionFor(name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  if (!['pdf', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png'].includes(ext)) throw new Error('unsupported_private_document');
  return ext;
}

export async function openPrivateChatAttachment(roomId, fileId, name) {
  const extension = extensionFor(name);
  return openPrivateAttachment({
    roomId,
    fileId,
    name,
    platform: Platform.OS,
    getPrivateFile: (room, file) => chatAPI.getPrivateFile('attachment', room, file),
    createTempFile: (filename, bytes) => {
      sweepExpiredCache();
      const safeExtension = extensionFor(filename);
      const nonce = Math.random().toString(36).slice(2, 12);
      const file = new File(Paths.cache, `${CACHE_PREFIX}${Date.now()}-${nonce}.${safeExtension}`);
      file.create({ overwrite: false, intermediates: true });
      file.write(bytes);
      return { path: file.uri };
    },
    openWithViewer: (platform, fileUri, mime) => {
      const path = String(fileUri).replace(/^file:\/\//, '');
      if (platform === 'android') {
        return ReactNativeBlobUtil.android.actionViewIntent(path, mime, 'Открыть документ');
      }
      return ReactNativeBlobUtil.ios.presentPreview(path);
    },
  });
}
