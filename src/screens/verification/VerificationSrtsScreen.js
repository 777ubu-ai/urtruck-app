// VerificationSrtsScreen — Свидетельство о регистрации ТС (СРТС).
//
// Design ref: SRTS — отдельный reference не предоставлен; используется
// general document layout (та же структура что license-front: 3 буллета +
// good + bad examples). camera + gallery.
//
// BACKEND GAP (P2): отдельного `/register/srts` endpoint'а нет. Текущий
// `regAPI.uploadPassport(uri)` пишет в drivers_registration.passport_url —
// семантически «удостоверение личности», что близко (СРТС — тоже
// удостоверяющий документ). Используем его как pragmatic placeholder
// до появления отдельного backend slot'а.
//
// TODO backend:
//   - добавить либо отдельный `/register/srts` + `srts_url` колонку, либо
//     параметр `kind='srts'` в `/register/documents/passport`
//   - после этого заменить uploader на `regAPI.uploadSrts(uri)` (плюс
//     новый метод в regAPI).
import React from 'react';
import VerificationUploadStepScreen from './VerificationUploadStepScreen';
import { ASSET_GROUPS } from '../../assets/onboarding/verification';
import { regAPI } from '../../utils/registration';

const uploader = (uri) => regAPI.uploadPassport(uri);

export default function VerificationSrtsScreen({ navigation, route }) {
  return (
    <VerificationUploadStepScreen
      navigation={navigation}
      route={route}
      config={{
        key: 'vehicle-registration',
        titleKey: 'verification_item_vehicleRegistration_title',
        subtitleKey: 'verification_srts_subtitle_long',
        bulletKeys: [
          'verification_srts_bullet_1',
          'verification_srts_bullet_2',
          'verification_srts_bullet_3',
        ],
        assetGroup: ASSET_GROUPS.vehicleRegistration,
        uploader,
        mode: 'camera+gallery',
      }}
    />
  );
}
