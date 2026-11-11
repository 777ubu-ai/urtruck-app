import React from 'react';
import { Image, TouchableOpacity } from 'react-native';

// Нативный путь пока сохраняет существующее поведение до отдельного перехода.
export default function ProtectedChatPhoto({ uri, style, onOpen, fullscreen, testID }) {
  if (!uri) return null;
  const image = <Image source={{ uri }} style={style} resizeMode={fullscreen ? 'contain' : 'cover'} />;
  if (fullscreen) return image;
  return <TouchableOpacity onPress={() => onOpen?.({ uri, optimistic: true })} testID={testID}>{image}</TouchableOpacity>;
}
