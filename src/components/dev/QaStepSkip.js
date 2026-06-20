// QaStepSkip — DEV/QA-only хук перехода на следующий шаг регистрации.
//
// Зачем: реальные шаги регистрации (Identity → Selfie → VehicleDocs →
// VehiclePhotos) гейтятся загрузкой фото через НАТИВНЫЙ iOS фото-пикер +
// серверными проверками (uploadSelfie → face_verified, OCR техпаспорта/прав,
// ИИН-госреестр). На симуляторе камера недоступна, а PHPicker/serverные
// проверки не дают Maestro дойти до образцов (PhotoGuide) на шагах 2–6.
//
// Этот хук позволяет Maestro перепрыгнуть на следующий экран регистрации,
// чтобы проверить правило «образец-вперёд» (образец ✅/❌ виден ДО контрола
// загрузки, тап = крупно) на КАЖДОМ шаге вживую. Сам PhotoGuide рендерится
// настоящий — обходится только пикер/серверный гейт, не образец.
//
// Безопасность: строго __DEV__. В production-бандле компонент возвращает null
// (кнопка не существует, мёртвый код вырезается минификатором) — в прод не
// течёт и UX не меняет.

import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

export default function QaStepSkip({ onPress, testID = 'qa-skip-step', label = 'QA: следующий шаг →' }) {
  if (!__DEV__) return null;
  return (
    <Pressable onPress={onPress} style={s.btn} testID={testID} accessibilityLabel={testID}>
      <Text style={s.txt}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#A855F7',
    alignItems: 'center',
  },
  txt: { color: '#A855F7', fontSize: 12, fontWeight: '800' },
});
