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
