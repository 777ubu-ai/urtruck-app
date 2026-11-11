import React from 'react';
import VoiceMessageBubble from '../VoiceMessageBubble';

// Нативная аудиозагрузка сохраняет прежнее поведение до отдельной проверки.
export default function ProtectedVoiceMessageBubble({ uri, ...props }) {
  return <VoiceMessageBubble {...props} uri={uri} />;
}
