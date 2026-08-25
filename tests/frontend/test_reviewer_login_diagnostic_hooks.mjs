import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const flow = fs.readFileSync(
  path.join(root, 'qa/maestro/google-play-location/login-reviewer-driver.yaml'),
  'utf8',
);

test('reviewer login flow emits diagnostic markers around the email CTA tap', () => {
  assert.match(
    flow,
    /- hideKeyboard\s*\n- waitForAnimationToEnd\s*\n- runScript: diag-marker-pre\.js\s*\n- tapOn:\s*\n\s*id: "phone-v2-cta"\s*\n- runScript: diag-marker-after\.js/,
  );
});
