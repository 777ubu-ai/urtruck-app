import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const flow = fs.readFileSync(
  path.join(root, 'qa/maestro/google-play-location/login-reviewer-driver.yaml'),
  'utf8',
);

test('Google Play reviewer login dismisses Android keyboard before both CTAs', () => {
  assert.match(
    flow,
    /- inputText: \$\{REVIEWER_EMAIL\}\s*\n- hideKeyboard\s*\n- waitForAnimationToEnd(?:\s*\n- runScript: [^\n]+)?\s*\n- tapOn:\s*\n\s*id: "phone-v2-cta"/,
    'email keyboard must be dismissed before the email CTA is tapped',
  );

  assert.match(
    flow,
    /- inputText: \$\{REVIEWER_CODE\}\s*\n- hideKeyboard\s*\n- waitForAnimationToEnd\s*\n- tapOn:\s*\n\s*id: "otp-v2-cta"/,
    'OTP keyboard must be dismissed before the OTP CTA is tapped',
  );
});
