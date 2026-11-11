import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import VoiceMessageBubble from '../VoiceMessageBubble';
import { chatAPI } from '../../utils/chatAPI';
import { useAuth } from '../../utils/AuthContext';
import { voice } from '../../utils/voiceRecorder';
import { releaseProtectedVoice } from '../../utils/protectedVoiceRelease';

export default function ProtectedVoiceMessageBubble({ roomId, messageId, uri, optimistic, unavailableText, retryText, textColor, ...props }) {
  const { session } = useAuth();
  const owner = session?.user?.id || null;
  const currentOwner = React.useRef(owner);
  currentOwner.current = owner;
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
      const contentType = String(mime).split(';')[0].toLowerCase();
      if (!contentType.startsWith('audio/') && contentType !== 'application/octet-stream') throw new Error('invalid_audio_type');
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: contentType }));
      if (controller.signal.aborted) { URL.revokeObjectURL(objectUrl); objectUrl = ''; return; }
      setResource({ scope, uri: objectUrl });
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => {
      controller.abort();
      releaseProtectedVoice({ uri: objectUrl, voice, accountChanged: currentOwner.current !== owner, revoke: value => URL.revokeObjectURL(value) });
    };
  }, [scope, owner, roomId, messageId, optimistic, attempt]);
  const resolved = optimistic ? uri : (resource?.scope === scope ? resource.uri : '');
  return <View>
    <VoiceMessageBubble {...props} uri={resolved} sending={!optimistic && !resolved && !failed} />
    {failed ? <TouchableOpacity onPress={() => setAttempt(value => value + 1)} accessibilityRole="button"><Text style={{ color: textColor || '#fff' }}>{unavailableText} · {retryText}</Text></TouchableOpacity> : null}
  </View>;
}
