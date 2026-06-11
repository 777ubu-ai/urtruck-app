// VerificationPersonalPhotoScreen — Personal photo step.
//
// Design ref: docs/design/onboarding-flow/01-personal-photo-screen.png
// camera-only. Backend: regAPI.uploadSelfie(iin, fullName, uri).
// Поскольку этот wrapper отдельно (не часть IdentityStep), IIN/имя
// у нас обычно не под рукой; uploader работает без них, backend
// валидирует только URI как «личная фотография» (uploadSelfie с
// пустыми iin/name backend принимает — поле опционально).
import React from 'react';
import VerificationUploadStepScreen from './VerificationUploadStepScreen';
import { ASSET_GROUPS } from '../../assets/onboarding/verification';
import { regAPI } from '../../utils/registration';

const uploader = (uri) => regAPI.uploadSelfie('', '', uri);

export default function VerificationPersonalPhotoScreen({ navigation, route }) {
  return (
    <VerificationUploadStepScreen
      navigation={navigation}
      route={route}
      config={{
        key: 'personal-photo',
        titleKey: 'verification_item_personalPhoto_title',
        subtitleKey: 'verification_personalPhoto_subtitle_long',
        bulletKeys: [
          'verification_personalPhoto_bullet_1',
          'verification_personalPhoto_bullet_2',
        ],
        assetGroup: ASSET_GROUPS.personalPhoto,
        uploader,
        mode: 'camera-only',
      }}
    />
  );
}
