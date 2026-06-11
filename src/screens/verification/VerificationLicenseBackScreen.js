// VerificationLicenseBackScreen — driver license BACK step.
//
// Design ref: license back — reference draft не предоставлен дизайном,
// используем ту же layout-структуру что и license-front.
// camera + gallery.
//
// BACKEND GAP (P2): `regAPI.uploadLicense(uri)` сейчас принимает один
// файл; на /register/documents/license backend сохраняет в
// drivers_registration.license_url (один URL без разделения front/back).
// Этот экран отправляет файл по тому же endpoint'у — на текущей backend
// схеме это значит: license_back перезапишет license_front. Это
// неприемлемо для production, но безопасно для текущего sandbox'а где
// модератор смотрит drivers_registration вручную.
//
// TODO backend: добавить либо параметр `side` в endpoint, либо отдельное
// поле `license_back_url`. Frontend готов: достаточно передать `side`
// в uploader. См. comment в src/utils/registration.js:315 (uploadLicense).
import React from 'react';
import VerificationUploadStepScreen from './VerificationUploadStepScreen';
import { ASSET_GROUPS } from '../../assets/onboarding/verification';
import { regAPI } from '../../utils/registration';

// Когда backend добавит поддержку `side='back'`, заменить эту обёртку
// на `(uri) => regAPI.uploadLicense(uri, { side: 'back' })`.
const uploader = (uri) => regAPI.uploadLicense(uri);

export default function VerificationLicenseBackScreen({ navigation, route }) {
  return (
    <VerificationUploadStepScreen
      navigation={navigation}
      route={route}
      config={{
        key: 'license-back',
        titleKey: 'verification_item_licenseBack_title',
        subtitleKey: 'verification_licenseBack_subtitle_long',
        bulletKeys: [
          'verification_licenseBack_bullet_1',
          'verification_licenseBack_bullet_2',
          'verification_licenseBack_bullet_3',
        ],
        assetGroup: ASSET_GROUPS.licenseBack,
        uploader,
        mode: 'camera+gallery',
      }}
    />
  );
}
