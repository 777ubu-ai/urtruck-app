// VerificationUploadStepScreen — generic photo upload step.
//
// Все 7 upload-шагов верификации (personal photo, selfie with license,
// driver license front/back, SRTS, truck exterior, truck interior)
// идут по одной структуре (см. docs/design/onboarding-flow/0[1-5]*):
//
//   ┌─────────────────────────────┐
//   │ ← progress  Шаг N из M  ✕   │  ← VerificationStepLayout chrome
//   ├─────────────────────────────┤
//   │ <Title>                     │  ← из i18n
//   │ <Subtitle>                  │
//   │                             │
//   │ ✓ <bullet 1>                │  ← InstructionBulletList
//   │ ✓ <bullet 2>                │
//   │ ✓ <bullet 3>                │
//   │                             │
//   │ ▢ Good example  ▢ Bad ex.   │  ← GoodBadExampleSection
//   │ ▢ Bad example   ▢ Bad ex.   │
//   ├─────────────────────────────┤
//   │ [📷 Сделать фото]            │  ← UploadActionButtons
//   │ [🖼 Выбрать из галереи]       │  (только если mode='camera+gallery')
//   └─────────────────────────────┘
//
// Поведение upload'а:
//   - openCamera/openGallery → expo-image-picker → uri → uploader(uri)
//   - uploader — любая из regAPI-функций (см. useVerificationUpload)
//   - На успехе → navigation.goBack() (возвращаемся в Dashboard;
//     `useFocusEffect` в DashboardScreen дотягивает свежий `/register/status`
//     и обновляет карточку до 'uploaded' / 'pending_review').
//
// Конкретные screens — это тонкие конфиги в src/screens/verification/
// (VerificationPersonalPhotoScreen, VerificationLicenseFrontScreen, etc.).
import React from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import VerificationStepLayout from '../../components/verification/VerificationStepLayout';
import InstructionBulletList from '../../components/verification/InstructionBulletList';
import GoodBadExampleSection from '../../components/verification/GoodBadExampleSection';
import UploadActionButtons from '../../components/verification/UploadActionButtons';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { useV1Colors } from '../../theme/designV1';
import { useVerificationUpload } from '../../utils/useVerificationUpload';
import { ASSET_GROUPS } from '../../assets/onboarding/verification';

export default function VerificationUploadStepScreen({ navigation, route, config }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const v1 = useV1Colors();

  // config:
  //   key                  — стрингу id (например 'personalPhoto'), для testID
  //   titleKey, subtitleKey — i18n
  //   bulletKeys           — array of i18n-ключей
  //   assetGroup           — ASSET_GROUPS[group] (например ASSET_GROUPS.personalPhoto)
  //   uploader             — async (uri) => any (regAPI-метод)
  //   mode                 — 'camera-only' | 'camera+gallery'
  //   step, totalSteps     — для progress bar (опционально)
  const {
    key,
    titleKey,
    subtitleKey,
    bulletKeys = [],
    assetGroup,
    uploader,
    mode = 'camera+gallery',
    step,
    totalSteps,
  } = config;

  const { busy, localUri, openCamera, openGallery, error } = useVerificationUpload(uploader, { mode });

  const onCamera = async () => {
    await openCamera();
    if (!error) {
      // На успехе закрываем экран; Dashboard перечитает status.
      // Если upload в полёте, навигация подождёт следующего тика.
      setTimeout(() => navigation.goBack(), 250);
    }
  };
  const onGallery = async () => {
    await openGallery();
    if (!error) setTimeout(() => navigation.goBack(), 250);
  };

  return (
    <VerificationStepLayout
      step={step}
      total={totalSteps}
      title={t(titleKey)}
      subtitle={subtitleKey ? t(subtitleKey) : null}
      onBack={() => navigation.goBack()}
      onClose={() => navigation.popToTop()}
      footer={
        <UploadActionButtons
          mode={mode}
          onCamera={onCamera}
          onGallery={onGallery}
          busy={busy}
          testIDPrefix={`verification-upload-${key}`}
        />
      }
      testID={`verification-upload-step-${key}`}
    >
      <InstructionBulletList items={bulletKeys.map((k) => t(k))} />
      {localUri ? (
        <View style={[s.previewWrap, { borderColor: v1.border, backgroundColor: theme.card }]}>
          <Image source={{ uri: localUri }} style={s.preview} resizeMode="cover" />
          <Text style={[s.previewCaption, { color: v1.textMuted }]}>
            {t('verification_upload_preview_caption')}
          </Text>
        </View>
      ) : null}
      <GoodBadExampleSection group={assetGroup} />
    </VerificationStepLayout>
  );
}

const s = StyleSheet.create({
  previewWrap: {
    marginTop: 18,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  preview: { width: '100%', aspectRatio: 4 / 3 },
  previewCaption: { fontSize: 11, padding: 8, textAlign: 'center' },
});
