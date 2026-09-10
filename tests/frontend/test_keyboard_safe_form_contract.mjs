import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const primitive = readFileSync('src/components/ui/v1/KeyboardSafeLayout.js', 'utf8');
const screen = readFileSync('src/components/ui/v1/Screen.js', 'utf8');
const identity = readFileSync('src/screens/registration/IdentityStepScreen.js', 'utf8');
const bid = readFileSync('src/components/BidModal.js', 'utf8');
const createCargo = readFileSync('src/screens/CreateCargoScreen.js', 'utf8');
const truckParams = readFileSync('src/screens/registration/TruckParamsScreen.js', 'utf8');
const vehicleDocs = readFileSync('src/screens/registration/VehicleDocsScreen.js', 'utf8');
const editTrip = readFileSync('src/screens/EditTripScreen.js', 'utf8');
const createTrip = readFileSync('src/screens/CreateTripScreen.js', 'utf8');
// Commit 6: registration Premium* and onboarding V2 forms migrated from
// their own KeyboardAvoidingView forks to the canonical primitive.
const PREM_REGISTER = 'src/screens/registration/PremiumRegisterScreen.js';
const PREM_LOGIN = 'src/screens/registration/PremiumLoginScreen.js';
const PREM_OTP = 'src/screens/registration/PremiumOtpScreen.js';
const PREM_PROFILE = 'src/screens/registration/PremiumProfileScreen.js';
const PHONE_V2 = 'src/screens/onboarding/PhoneV2Screen.js';
const OTP_V2 = 'src/screens/onboarding/OtpV2Screen.js';
const PROFILE_V2 = 'src/screens/onboarding/ProfileV2Screen.js';
const migratedForms = [
  ['PremiumRegisterScreen', readFileSync(PREM_REGISTER, 'utf8')],
  ['PremiumLoginScreen', readFileSync(PREM_LOGIN, 'utf8')],
  ['PremiumOtpScreen', readFileSync(PREM_OTP, 'utf8')],
  ['PremiumProfileScreen', readFileSync(PREM_PROFILE, 'utf8')],
  ['PhoneV2Screen', readFileSync(PHONE_V2, 'utf8')],
  ['OtpV2Screen', readFileSync(OTP_V2, 'utf8')],
  ['ProfileV2Screen', readFileSync(PROFILE_V2, 'utf8')],
];

test('canonical keyboard primitive scrolls the focused native input into view', () => {
  assert.match(primitive, /KeyboardSafeScrollView/);
  assert.match(primitive, /KeyboardSafeFocusContext/);
  assert.match(primitive, /Keyboard\.addListener/);
  assert.match(primitive, /keyboardDidShow/);
  assert.match(primitive, /UIManager\.measure/);
  assert.match(primitive, /const overlap = pageY \+ height \+ 16 - keyboardTop\.current/);
  assert.match(primitive, /scrollTo\?\.\(\{ y: nextY, animated: true \}\)/);
  assert.match(primitive, /keyboardShouldPersistTaps/);
  assert.match(primitive, /keyboardVerticalOffset=\{offset\}/);
});

test('active long forms use the canonical keyboard-aware scroll container', () => {
  assert.match(screen, /KeyboardSafeScrollView/);
  assert.match(identity, /KeyboardSafeScrollView/);
  assert.match(bid, /KeyboardSafeScrollView/);
  assert.match(createCargo, /<Screen[\s\S]*contentStyle/);
  assert.match(truckParams, /KeyboardSafeLayout[\s\S]*KeyboardSafeScrollView/);
  assert.match(vehicleDocs, /KeyboardSafeLayout[\s\S]*KeyboardSafeScrollView/);
  assert.match(editTrip, /KeyboardSafeLayout[\s\S]*KeyboardSafeScrollView/);
});

test('Android forms use native-frame KAV height only when edge-to-edge bypasses adjustResize', () => {
  const app = readFileSync('app.json', 'utf8');
  const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(app, /"softwareKeyboardLayoutMode"\s*:\s*"resize"/);
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
  assert.match(primitive, /Platform\.OS === 'ios' \? 'padding' : 'height'/);
  assert.doesNotMatch(primitive, /paddingBottom: androidImeInset/);
  assert.doesNotMatch(primitive, /measureAndroidImeOverlap/);
});

test('bottom-docked chat uses the measured IME overlap without a double offset', () => {
  assert.match(primitive, /export function useKeyboardDockInset/);
  assert.match(primitive, /Platform\.Version >= 36/);
  assert.match(primitive, /Math\.max\(0, height - keyboardTop \+ visualImeInset\)/);
  assert.match(primitive, /Platform\.OS !== 'android'/);
});

// Design v1 Commit 6: Premium* (registration) and onboarding V2 forms no
// longer own a KeyboardAvoidingView fork — they compose the canonical
// KeyboardSafeLayout (iOS padding / Android adjustResize single owner) and
// KeyboardSafeScrollView (shared focus-reveal), same as the rest of the app.
test('registration/onboarding auth forms use the canonical keyboard primitive, no KAV fork', () => {
  for (const [name, src] of migratedForms) {
    assert.match(src, /KeyboardSafeLayout/, `${name}: must compose KeyboardSafeLayout`);
    assert.match(src, /KeyboardSafeScrollView/, `${name}: must scroll via KeyboardSafeScrollView`);
    assert.doesNotMatch(src, /KeyboardAvoidingView/, `${name}: local KAV fork must be gone`);
    assert.doesNotMatch(src, /behavior=\{Platform\.OS === 'ios'/, `${name}: behavior fork must live in the primitive only`);
    assert.doesNotMatch(src, /<ScrollView/, `${name}: raw ScrollView must be replaced by KeyboardSafeScrollView`);
  }
});

// Design v1 Commit 2: the create-form submit CTA is pinned in a sticky
// footer (Screen's `footer` slot, rendered inside KeyboardSafeLayout AFTER
// the scroll body) so it sits directly above the IME instead of scrolling
// away at the bottom of the content. The scroll container itself stays the
// canonical Screen + KeyboardSafeScrollView composition.
test('create forms pin the submit CTA in a sticky footer outside the scroll body', () => {
  // Screen must implement the footer slot after the scroll body.
  assert.match(screen, /footer/);
  assert.match(screen, /<KeyboardSafeLayout>[\s\S]*?\{inner\}[\s\S]*?\{footer\}/);
  assert.match(screen, /style: footer \? s\.flex : undefined/);

  const cases = [
    ['CreateCargoScreen', createCargo, 'cargo-submit-button'],
    ['CreateTripScreen', createTrip, 'trip-submit-button'],
  ];
  for (const [name, src, submitTestID] of cases) {
    // CTA is declared inside the footer= prop (sticky footer composition)…
    assert.match(src, new RegExp(`footer=\\{\\(\\s*\\)?\\s*<StickyCTABar>[\\s\\S]*?testID="${submitTestID}"`), `${name}: submit CTA must render via Screen's sticky footer`);
    // …so no standalone <PrimaryButton> remains in the scroll children.
    assert.doesNotMatch(src, new RegExp(`</View>\\s*\\n\\s*<PrimaryButton[\\s\\S]*?${submitTestID}`), `${name}: submit CTA leaked back into scroll content`);
    // Form scroll container unchanged: same Screen wrapper + scroll content style.
    assert.match(src, /<Screen[\s\S]*?contentStyle=\{\{/, `${name}: lost the Screen scroll content style`);
  }
});
