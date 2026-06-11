// VerificationTruckExteriorScreen — фото тягача (внешний вид).
//
// Design ref: docs/design/onboarding-flow/04-truck-exterior-screen.png
// camera + gallery. Backend: regAPI.uploadVehiclePhoto(uri).
import React from 'react';
import VerificationUploadStepScreen from './VerificationUploadStepScreen';
import { ASSET_GROUPS } from '../../assets/onboarding/verification';
import { regAPI } from '../../utils/registration';

const uploader = (uri) => regAPI.uploadVehiclePhoto(uri);

export default function VerificationTruckExteriorScreen({ navigation, route }) {
  return (
    <VerificationUploadStepScreen
      navigation={navigation}
      route={route}
      config={{
        key: 'truck-exterior',
        titleKey: 'verification_item_truckExterior_title',
        subtitleKey: 'verification_truckExterior_subtitle_long',
        bulletKeys: [
          'verification_truckExterior_bullet_1',
          'verification_truckExterior_bullet_2',
          'verification_truckExterior_bullet_3',
        ],
        assetGroup: ASSET_GROUPS.truckExterior,
        uploader,
        mode: 'camera+gallery',
      }}
    />
  );
}
