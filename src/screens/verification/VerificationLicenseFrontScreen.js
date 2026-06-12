// VerificationLicenseFrontScreen — driver license FRONT step.
//
// Design ref: docs/design/onboarding-flow/03-driver-license-front-screen.png
// camera + gallery. Backend: regAPI.uploadLicense(uri).
//
// Backend gap: текущий /register/documents/license принимает только один
// файл — фронт. Для обратной стороны (см. VerificationLicenseBackScreen)
// нужен отдельный backend slot или поле `side`. Документировано в
// PR #105 description.
import React from 'react';
import VerificationUploadStepScreen from './VerificationUploadStepScreen';
import { ASSET_GROUPS } from '../../assets/onboarding/verification';
import { regAPI } from '../../utils/registration';

const uploader = (uri) => regAPI.uploadLicense(uri);

export default function VerificationLicenseFrontScreen({ navigation, route }) {
  return (
    <VerificationUploadStepScreen
      navigation={navigation}
      route={route}
      config={{
        key: 'license-front',
        titleKey: 'verification_item_licenseFront_title',
        subtitleKey: 'verification_licenseFront_subtitle_long',
        bulletKeys: [
          'verification_licenseFront_bullet_1',
          'verification_licenseFront_bullet_2',
          'verification_licenseFront_bullet_3',
        ],
        assetGroup: ASSET_GROUPS.licenseFront,
        guideImage: require('../../assets/onboarding/verification/guides/license_front_guide.png'),
        uploader,
        mode: 'camera+gallery',
      }}
    />
  );
}
