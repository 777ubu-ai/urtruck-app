import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const screen = fs.readFileSync('src/screens/onboarding/OnboardingV2Screen.js', 'utf8');
const i18n = fs.readFileSync('src/utils/i18n.js', 'utf8');

test('standalone onboarding never renders QA auth controls', () => {
  assert.match(screen, /if \(typeof __DEV__ === 'undefined' \|\| !__DEV__\) return false;/);
  assert.match(screen, /EXPO_PUBLIC_QA_HOOKS !== '1'/);
  assert.match(screen, /Constants\?\.appOwnership !== 'standalone'/);
  assert.doesNotMatch(screen, /flavor === 'qa2'.*return true/s);
});

test('approved RU onboarding titles remain separate two-line UI copy', () => {
  assert.match(i18n, /onb_v2_slide1_title: 'Всё для перевозки —\\nв одном приложении'/);
  assert.match(i18n, /onb_v2_slide2_title: 'Найди груз и\\nпредложи ставку'/);
  assert.match(i18n, /onb_v2_slide3_title: 'Договорились —\\nи поехали'/);
  assert.match(screen, /<Text style=\{s\.title\} numberOfLines=\{2\}/);
});

test('onboarding CTAs use compact asymmetric approved sizing', () => {
  assert.match(screen, /ctaPrimary:[\s\S]*height: 52,[\s\S]*width: '86%'[\s\S]*maxWidth: 540[\s\S]*borderRadius: 26/);
  assert.match(screen, /ctaArrowBubble:[\s\S]*width: 38,[\s\S]*height: 38,[\s\S]*borderRadius: 19/);
  assert.match(screen, /ctaOutline: \{ height: 48, width: '76%', maxWidth: 480, borderRadius: 24/);
});

test('the complete unauthenticated onboarding flow stays light regardless of app theme', () => {
  const files = [
    'OnboardingV2Screen.js',
    'PhoneV2Screen.js',
    'OtpV2Screen.js',
    'RoleScreenV2.js',
    'ProfileV2Screen.js',
    'CountryPickerSheet.js',
  ];
  for (const file of files) {
    const source = fs.readFileSync(`src/screens/onboarding/${file}`, 'utf8');
    assert.match(source, /brandLight/, `${file} must use the fixed light auth palette`);
    assert.doesNotMatch(source, /useBrand\(\)/, `${file} must not follow the signed-in dark theme`);
  }
});

test('truck cards and queue highlights use runtime theme surfaces', () => {
  const truckGrid = fs.readFileSync('src/components/TruckTypeGrid.js', 'utf8');
  const queue = fs.readFileSync('src/screens/QueueScreenLazyV2.js', 'utf8');
  assert.match(truckGrid, /useV1Colors\(\)/);
  assert.match(truckGrid, /backgroundColor: v1\.surface, borderColor: v1\.border/);
  assert.doesNotMatch(truckGrid, /backgroundColor: '#FFFFFF'/);
  assert.match(queue, /backgroundColor: v1\.surfaceMuted/);
  assert.match(queue, /backgroundColor: item\.is_day_off \? v1\.bg : theme\.card/);
  assert.doesNotMatch(queue, /heroBooking: \{ backgroundColor: '#E5EBF0'/);
  assert.doesNotMatch(queue, /heroDate: \{ color: '#111C2C'/);
});
