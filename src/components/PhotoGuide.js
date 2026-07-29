// PhotoGuide — образец «как правильно/неправильно фотографировать» (✅/❌).
//
// Картинки-образцы лежат в src/assets/onboarding/verification/guides/ и уже
// использовались в verification-флоу. Но реальный флоу регистрации
// (registration/*) их не показывал — водитель не видел образцов. Этот компонент
// выводит образец компактно (ограниченная высота) прямо на шаге фотографии и по
// тапу открывает полноразмерный просмотр. Текста нет (только 🔍-эмодзи) — поэтому
// i18n не требуется и компонент безопасно вставлять в любой шаг.

import React, { useState } from 'react';
import { View, Image, Pressable, Modal, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

export default function PhotoGuide({ source, testID, height = 240 }) {
  const [zoom, setZoom] = useState(false);
  if (!source) return null;
  return (
    <View style={s.wrap}>
      <Pressable onPress={() => setZoom(true)} style={[s.thumbWrap, { height }]} testID={testID || 'photo-guide'}>
        <Image source={source} style={s.thumb} resizeMode="contain" />
        <View style={s.zoomBadge}><Feather name="search" size={14} color="#fff" /></View>
      </Pressable>
      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)}>
        <Pressable style={s.backdrop} onPress={() => setZoom(false)} testID="photo-guide-zoom">
          <Image source={source} style={s.full} resizeMode="contain" />
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 12 },
  // №13: фон был серым (rgba 0.04) — при resizeMode:contain у узкого образца
  // по бокам виднелись серые «поля» (некрасиво). Прозрачный фон → поля
  // сливаются с экраном, рамки-боксов больше нет.
  thumbWrap: { width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: 'transparent' },
  thumb: { width: '100%', height: '100%' },
  zoomBadge: {
    position: 'absolute', right: 8, bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  full: { width: '100%', height: '100%' },
});
