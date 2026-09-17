import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = readFileSync('src/components/ui/v1/RootHeader.js', 'utf8');
const back = readFileSync('src/components/ui/v1/BackButton.js', 'utf8');
const keyboard = readFileSync('src/components/ui/v1/KeyboardSafeLayout.js', 'utf8');
const identity = readFileSync('src/screens/registration/IdentityStepScreen.js', 'utf8');
const theme = readFileSync('src/theme/designV1.js', 'utf8');

test('Track 2 root header owns canonical left bell and right menu', () => {
  assert.match(root, /<BellBadge[\s\S]*<HeaderMenuButton/);
  assert.match(root, /minHeight: 56/);
  assert.match(root, /paddingHorizontal: 16/);
});

test('Track 2 shared controls expose 44px touch and accessibility contracts', () => {
  assert.match(back, /width: 44, height: 44/);
  assert.match(back, /hitSlop=\{4\}/);
  assert.match(back, /accessibilityRole="button"/);
  // Design v1 Commit 2: the default label is localized via t('back')
  // (RU «Назад» / ZH «返回» / EN «Back» / KK «Артқа»); the `label` prop
  // remains as an explicit override.
  assert.match(back, /accessibilityLabel=\{a11yLabel\}/);
  assert.match(back, /const a11yLabel = label \|\| t\('back'\)/);
  assert.match(back, /accessibilityState=\{\{ disabled \}\}/);
});

test('Track 2 keyboard primitive defines platform behavior and is used by active identity form', () => {
  assert.match(keyboard, /Platform\.OS === 'ios' \? 'padding' : 'height'/);
  assert.match(keyboard, /keyboardVerticalOffset=\{offset\}/);
  assert.match(identity, /KeyboardSafeLayout/);
});

test('Track 2 uses the existing designV1 source for shared palette tokens', () => {
  assert.match(root, /useV1Colors/);
  assert.match(back, /useV1Colors/);
  assert.match(theme, /export const v1Spacing/);
  assert.match(theme, /screenPad: 16/);
});

test('auth/onboarding screens use brand light palette boundary, not authenticated theme hook', () => {
  for (const file of ['src/screens/onboarding/PhoneV2Screen.js', 'src/screens/onboarding/OnboardingV2Screen.js', 'src/screens/onboarding/RoleScreenV2.js']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /brandV2/);
    assert.doesNotMatch(source, /useTheme\(/);
  }
});
