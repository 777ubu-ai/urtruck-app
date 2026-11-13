import React from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { chatAPI } from '../../utils/chatAPI';
import { useAuth } from '../../utils/AuthContext';
import { stagePrivateImage, sweepPrivateImageEntries } from '../../utils/privateImageCache';
import { deletePrivatePdfCachePath } from './privatePdfCache';

let swept = false;
function sweepPrivateImages() {
  if (swept) return;
  swept = true;
  try {
    sweepPrivateImageEntries(new Directory(Paths.cache).list(), value =>
      deletePrivatePdfCachePath(value, { cacheUri: Paths.cache.uri, createFile: path => new File(path) }));
  } catch { /* cache недоступен; повторное создание покажет ошибку */ }
}

export default function ProtectedChatPhoto({ roomId, messageId, uri, optimistic, style, textColor, onOpen, fullscreen, unavailableText, retryText, testID }) {
  const { session } = useAuth();
  const owner = session?.user?.id || null;
  const scope = JSON.stringify([owner, roomId, messageId]);
  const [resource, setResource] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    setResource(null);
    setFailed(false);
    if (optimistic || !owner || !roomId || !messageId) return undefined;
    const controller = new AbortController();
    let staged;
    chatAPI.getPrivateFile('media', roomId, messageId, { signal: controller.signal }).then(({ bytes, mime }) => {
      if (controller.signal.aborted) return;
      sweepPrivateImages();
      staged = stagePrivateImage({ FileClass: File, cacheRoot: Paths.cache, bytes, mime,
        nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
      if (controller.signal.aborted) { staged.dispose(); return; }
      setResource({ scope, uri: staged.uri });
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); staged?.dispose(); };
  }, [scope, owner, roomId, messageId, optimistic, attempt]);
  const resolved = optimistic ? uri : (resource?.scope === scope ? resource.uri : '');
  if (!resolved) {
    return <View style={style}>{failed ? <TouchableOpacity onPress={() => setAttempt(value => value + 1)} accessibilityRole="button"><Text style={{ color: textColor || '#fff' }}>{unavailableText} · {retryText}</Text></TouchableOpacity> : <ActivityIndicator />}</View>;
  }
  const image = <Image source={{ uri: resolved }} style={style} resizeMode={fullscreen ? 'contain' : 'cover'} />;
  if (fullscreen) return image;
  return <TouchableOpacity onPress={() => onOpen?.(optimistic ? { uri, optimistic: true } : { roomId, messageId })} testID={testID}>{image}</TouchableOpacity>;
}
