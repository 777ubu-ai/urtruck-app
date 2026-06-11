// Centralized registry of verification-onboarding example assets.
//
// IMPORTANT
// ─────────
// These images are EXAMPLES shown next to instructions ("look how a good
// selfie should be / how a bad one looks"). They are NOT app screens.
// Do not render them full-screen. Do not embed fake OS chrome (status
// bar, time, battery) inside any of them.
//
// Real runtime assets that get exported must be locally bundled — never
// fetched from the internet. Anything full-screen mockup ('design ref')
// goes under docs/design/onboarding-flow/ and is consumed only by humans
// reviewing UX.
//
// HOW TO ADD AN ASSET WHEN DESIGN SHIPS IT
// ────────────────────────────────────────
// 1. Drop the PNG into the matching subfolder (person/, license/,
//    vehicle/, success/) using the EXACT canonical filename listed
//    below.
// 2. Uncomment the `require()` for that key in the assetMap object.
// 3. Run the app — VerificationCard/ExampleImageCard picks it up;
//    no screen-level wiring change needed.
//
// We do NOT use try/require fallback because Metro static-resolves at
// bundle time and a missing file would crash the whole build. So each
// asset is opt-in via uncomment.

// Each value is either a static require() (asset is in repo) or null
// (asset still pending from design). `null` is rendered as a neutral
// placeholder card by <ExampleImageCard/>.
const assetMap = {
  // ─── Person ── canonical filenames (design team queue):
  'person/selfie_good':            null /* require('./person/selfie_good.png') */,
  'person/selfie_bad_profile':     null /* require('./person/selfie_bad_profile.png') */,
  'person/selfie_bad_sunglasses':  null /* require('./person/selfie_bad_sunglasses.png') */,
  'person/selfie_bad_group':       null /* require('./person/selfie_bad_group.png') */,
  'person/selfie_license_good':    null /* require('./person/selfie_license_good.png') */,
  'person/selfie_license_bad':     null /* require('./person/selfie_license_bad.png') */,

  // ─── License ──
  'license/license_front_good':           null /* require('./license/license_front_good.png') */,
  'license/license_front_bad_glare':      null /* require('./license/license_front_bad_glare.png') */,
  'license/license_front_bad_bw':         null /* require('./license/license_front_bad_bw.png') */,
  'license/license_front_bad_screenshot': null /* require('./license/license_front_bad_screenshot.png') */,
  'license/license_back_good':            null /* require('./license/license_back_good.png') */,
  'license/license_back_bad':             null /* require('./license/license_back_bad.png') */,
  'license/srts_good':                    null /* require('./license/srts_good.png') */,
  'license/srts_bad':                     null /* require('./license/srts_bad.png') */,

  // ─── Vehicle ──
  'vehicle/truck_exterior_good': null /* require('./vehicle/truck_exterior_good.png') */,
  'vehicle/truck_exterior_bad':  null /* require('./vehicle/truck_exterior_bad.png') */,
  'vehicle/truck_interior_good': null /* require('./vehicle/truck_interior_good.png') */,
  'vehicle/truck_interior_bad':  null /* require('./vehicle/truck_interior_bad.png') */,

  // ─── Success ── (illustration, NOT a screen)
  'success/success_illustration': null /* require('./success/success_illustration.png') */,
};

export const getVerificationAsset = (key) => assetMap[key] || null;

export const verificationAssetKeys = Object.keys(assetMap);

// Audit helper: which assets are NOT yet in the repo. Used by the
// dashboard's «design assets status» footer (developer-only) and by
// the asset-status static gate.
export const missingVerificationAssets = () =>
  Object.entries(assetMap).filter(([, v]) => v == null).map(([k]) => k);

// Symbolic groupings for use by screens — they iterate these instead of
// hard-coding paths.
export const ASSET_GROUPS = {
  personalPhoto: {
    good: ['person/selfie_good'],
    bad: [
      'person/selfie_bad_profile',
      'person/selfie_bad_sunglasses',
      'person/selfie_bad_group',
    ],
  },
  selfieWithLicense: {
    good: ['person/selfie_license_good'],
    bad: ['person/selfie_license_bad'],
  },
  licenseFront: {
    good: ['license/license_front_good'],
    bad: [
      'license/license_front_bad_glare',
      'license/license_front_bad_bw',
      'license/license_front_bad_screenshot',
    ],
  },
  licenseBack: {
    good: ['license/license_back_good'],
    bad: ['license/license_back_bad'],
  },
  vehicleRegistration: {
    good: ['license/srts_good'],
    bad: ['license/srts_bad'],
  },
  truckExterior: {
    good: ['vehicle/truck_exterior_good'],
    bad: ['vehicle/truck_exterior_bad'],
  },
  truckInterior: {
    good: ['vehicle/truck_interior_good'],
    bad: ['vehicle/truck_interior_bad'],
  },
  success: {
    illustration: 'success/success_illustration',
  },
};
