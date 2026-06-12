// VerificationSelfieWithLicenseScreen — selfie with driver license step.
//
// Design ref: docs/design/onboarding-flow/02-selfie-with-license-screen.png
// camera-only. Backend: regAPI.uploadLicenseSelfie(uri).
import React from 'react';
import VerificationUploadStepScreen from './VerificationUploadStepScreen';
import { ASSET_GROUPS } from '../../assets/onboarding/verification';
import { regAPI } from '../../utils/registration';

const uploader = (uri) => regAPI.uploadLicenseSelfie(uri);

export default function VerificationSelfieWithLicenseScreen({ navigation, route }) {
  return (
    <VerificationUploadStepScreen
      navigation={navigation}
      route={route}
      config={{
        key: 'selfie-with-license',
        titleKey: 'verification_item_selfieWithLicense_title',
        subtitleKey: 'verification_selfieWithLicense_subtitle_long',
        bulletKeys: [
          'verification_selfieWithLicense_bullet_1',
          'verification_selfieWithLicense_bullet_2',
          'verification_selfieWithLicense_bullet_3',
        ],
        assetGroup: ASSET_GROUPS.selfieWithLicense,
        guideImage: require('../../assets/onboarding/verification/guides/selfie_license_guide.png'),
        uploader,
        mode: 'camera-only',
      }}
    />
  );
}
