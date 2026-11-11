import React from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import { chatAPI } from '../../utils/chatAPI';
import { useAuth } from '../../utils/AuthContext';

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
    let objectUrl = '';
    chatAPI.getPrivateFile('media', roomId, messageId, { signal: controller.signal }).then(({ bytes, mime }) => {
      if (controller.signal.aborted) return;
      if (!['image/png', 'image/jpeg'].includes(String(mime).split(';')[0].toLowerCase())) throw new Error('invalid_image_type');
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      if (controller.signal.aborted) { URL.revokeObjectURL(objectUrl); objectUrl = ''; return; }
      setResource({ scope, uri: objectUrl });
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [scope, owner, roomId, messageId, optimistic, attempt]);
  const resolved = optimistic ? uri : (resource?.scope === scope ? resource.uri : '');
  if (!resolved) {
    return <View style={style}>{failed ? <TouchableOpacity onPress={() => setAttempt(value => value + 1)} accessibilityRole="button"><Text style={{ color: textColor || '#fff' }}>{unavailableText} · {retryText}</Text></TouchableOpacity> : <ActivityIndicator />}</View>;
  }
  const image = <Image source={{ uri: resolved }} style={style} resizeMode={fullscreen ? 'contain' : 'cover'} />;
  if (fullscreen) return image;
  return <TouchableOpacity onPress={() => onOpen?.(optimistic ? { uri, optimistic: true } : { roomId, messageId })} testID={testID}>{image}</TouchableOpacity>;
}
