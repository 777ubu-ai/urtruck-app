// UploadActionButtons — пара кнопок «Сделать фото» / «Выбрать из галереи».
//
// Modes:
//   'camera-only' — одна большая зелёная кнопка «Сделать фото»
//                   (personal photo, selfie with license)
//   'camera+gallery' — две кнопки: primary «Сделать фото» + outline
//                      «Выбрать из галереи» (documents, vehicle photos)
//
// Caller передаёт обработчики onCamera / onGallery. Permission errors
// показываются caller'ом через toast — этот компонент только UI.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors } from '../../theme/designV1';
import { useTheme } from '../../utils/ThemeContext';
import { useI18n } from '../../utils/useI18n';

export default function UploadActionButtons({
  mode = 'camera+gallery',
  onCamera,
  onGallery,
  busy = false,
  testIDPrefix = 'upload',
}) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  return (
    <View style={s.wrap}>
      <TouchableOpacity
        onPress={onCamera}
        disabled={busy}
        activeOpacity={0.85}
        style={[s.primary, { backgroundColor: '#00A86B', opacity: busy ? 0.5 : 1 }]}
        testID={`${testIDPrefix}-camera`}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="camera" size={15} color="#FFF" />
          <Text style={s.primaryText}>{t('verification_action_take_photo')}</Text>
        </View>
      </TouchableOpacity>
      {mode === 'camera+gallery' ? (
        <TouchableOpacity
          onPress={onGallery}
          disabled={busy}
          activeOpacity={0.85}
          style={[s.secondary, { borderColor: v1.border, backgroundColor: theme.card, opacity: busy ? 0.5 : 1 }]}
          testID={`${testIDPrefix}-gallery`}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="image" size={15} color={theme.text} />
            <Text style={[s.secondaryText, { color: theme.text }]}>{t('verification_action_choose_gallery')}</Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10, marginTop: 20 },
  primary: {
    height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  secondary: {
    height: 52, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '700' },
});
