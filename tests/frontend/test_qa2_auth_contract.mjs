import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const onboarding = fs.readFileSync('src/screens/onboarding/OnboardingV2Screen.js', 'utf8');

test('QA login hook is opt-in and standalone-only for QA2', () => {
  assert.match(onboarding, /EXPO_PUBLIC_QA_HOOKS/);
  assert.match(onboarding, /EXPO_PUBLIC_QA2_STANDALONE/);
  assert.match(onboarding, /appOwnership === 'standalone'/);
  assert.match(onboarding, /executionEnvironment === 'standalone'/);
  assert.match(onboarding, /com\.urtruck\.app\.qa2/);
  assert.match(onboarding, /expo-application/);
  assert.match(onboarding, /testID="qa-debug-submit"/);
});
