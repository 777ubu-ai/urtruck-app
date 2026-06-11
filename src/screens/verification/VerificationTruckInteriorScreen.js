// VerificationTruckInteriorScreen — фото салона/кабины тягача.
//
// Design ref: docs/design/onboarding-flow/05-truck-interior-screen.png
// camera + gallery. Backend: regAPI.uploadCabinPhoto(uri).
//
// Этот шаг отделён от truck-exterior (PR #105 specification). Существующий
// VehiclePhotosScreen совмещает оба шага; здесь — раздельный экран,
// который мы открываем из VerificationDashboard.
import React from 'react';
import VerificationUploadStepScreen from './VerificationUploadStepScreen';
import { ASSET_GROUPS } from '../../assets/onboarding/verification';
import { regAPI } from '../../utils/registration';

const uploader = (uri) => regAPI.uploadCabinPhoto(uri);

export default function VerificationTruckInteriorScreen({ navigation, route }) {
  return (
    <VerificationUploadStepScreen
      navigation={navigation}
      route={route}
      config={{
        key: 'truck-interior',
        titleKey: 'verification_item_truckInterior_title',
        subtitleKey: 'verification_truckInterior_subtitle_long',
        bulletKeys: [
          'verification_truckInterior_bullet_1',
          'verification_truckInterior_bullet_2',
          'verification_truckInterior_bullet_3',
        ],
        assetGroup: ASSET_GROUPS.truckInterior,
        uploader,
        mode: 'camera+gallery',
      }}
    />
  );
}
