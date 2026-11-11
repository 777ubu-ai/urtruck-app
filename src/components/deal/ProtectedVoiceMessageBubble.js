import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import VoiceMessageBubble from '../VoiceMessageBubble';
import { chatAPI } from '../../utils/chatAPI';
import { useAuth } from '../../utils/AuthContext';
import { protectedVoicePool } from '../../utils/protectedVoicePoolInstance';
import { stageProtectedVoice } from '../../utils/protectedVoiceStage';

export default function ProtectedVoiceMessageBubble({ roomId, messageId, uri, optimistic, unavailableText, retryText, textColor, ...props }) {
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
    let acquired = false;
    const existing = protectedVoicePool.acquire(scope);
    if (existing) {
      acquired = true;
      setResource({ scope, uri: existing.uri });
    } else {
      chatAPI.getPrivateFile('media', roomId, messageId, { signal: controller.signal }).then(({ bytes, mime }) => {
        if (controller.signal.aborted) return;
        const staged = stageProtectedVoice(bytes, mime);
        if (controller.signal.aborted) { staged.dispose(); return; }
        const stored = protectedVoicePool.install(scope, staged);
        acquired = true;
        setResource({ scope, uri: stored.uri });
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    }
    return () => { controller.abort(); if (acquired) protectedVoicePool.release(scope); };
  }, [scope, owner, roomId, messageId, optimistic, attempt]);
  const resolved = optimistic ? uri : (resource?.scope === scope ? resource.uri : '');
  const onPending = React.useCallback(active => protectedVoicePool.pending(scope, active), [scope]);
  return <View testID="protected-voice-bubble-container">
    <VoiceMessageBubble {...props} uri={resolved} sending={props.sending || (!optimistic && !resolved && !failed)}
      onPlaybackPendingChange={optimistic ? undefined : onPending} />
    {failed ? <TouchableOpacity onPress={() => setAttempt(value => value + 1)} accessibilityRole="button"><Text style={{ color: textColor || '#fff' }}>{unavailableText} · {retryText}</Text></TouchableOpacity> : null}
  </View>;
}
