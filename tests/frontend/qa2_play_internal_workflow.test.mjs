import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/submit-android-qa2-internal.yml', 'utf8');

test('Google Play Internal QA2 workflow pins the open candidate and all required checks', () => {
  assert.match(workflow, /source_sha:\n\s+description: Exact 40-character head SHA of open PR 561\n\s+required: true/);
  assert.match(workflow, /ref: \$\{\{ inputs\.source_sha \}\}/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$QA_SOURCE_SHA"/);
  assert.match(workflow, /pulls\/561/);
  for (const check of [
    'quality-gate / Backend tests',
    'quality-gate / Frontend tests, lint, and build',
    'quality-gate / Mandatory web E2E subset',
  ]) assert.ok(workflow.includes(check), `missing required check: ${check}`);
});

test('Google Play release is hard-pinned to QA2 and the Internal track', () => {
  assert.ok(workflow.includes('test "$QA_HOST" = qa2.urtruck.kz'));
  assert.ok(workflow.includes('test "${QA2_API_URL%/}" != https://urtruck.kz'));
  assert.ok(workflow.includes('tracks: internal'));
  assert.ok(workflow.includes('packageName: com.urtruck.app'));
  assert.ok(workflow.includes('environment: production'), 'protected Environment approval is required');
  assert.ok(!workflow.includes('tracks: ${{ inputs.track'));
  assert.doesNotMatch(workflow, /EXPO_PUBLIC_API_URL:\s*https:\/\/urtruck\.kz(?:\s|$)/m);
});

test('QA2 AAB verifies the exact API host, Firebase, 16 KB alignment, and no background location', () => {
  assert.ok(workflow.includes('curl -fsS --max-time 20 "${QA2_API_URL%/}/health"'));
  assert.ok(workflow.includes('curl -fsS --max-time 20 "${QA2_API_URL%/}/api/version"'));
  assert.ok(workflow.includes('verify_android_firebase_config.py --check-resources'));
  assert.ok(workflow.includes('verify_android_fcm_handler.py'));
  assert.ok(workflow.includes('verify_android_16kb.py'));
  assert.ok(workflow.includes('grep -aFq "${QA2_API_URL%/}"'));
  assert.ok(workflow.includes('ACCESS_BACKGROUND_LOCATION|FOREGROUND_SERVICE_LOCATION'));
});


test('native patches are mandatory before Gradle and a failed application stops the build', () => {
  const patchStep = workflow.match(/      - name: Apply reviewed native dependency patches\n        run: \|\n([\s\S]*?)(?=\n      - name:)/)?.[1];
  assert.ok(patchStep, 'ignore-scripts must be followed by an explicit native patch step');
  const script = patchStep.split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const patchIndex = workflow.indexOf('name: Apply reviewed native dependency patches');
  assert.ok(patchIndex > workflow.indexOf('name: Verify protected QA2 Internal release intent'));
  assert.ok(patchIndex < workflow.indexOf('name: Build and test signed QA2 AAB'));
  assert.match(script, /patch-package --error-on-fail/);
  const dir = mkdtempSync(join(tmpdir(), 'urtruck-patch-gate-'));
  try {
    mkdirSync(join(dir, 'patches'));
    mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true });
    const binary = join(dir, 'node_modules/.bin/patch-package');
    writeFileSync(binary, '#!/bin/bash\nprintf "%s" "$*" > patch-args\nexit "${PATCH_RESULT:-0}"\n', { mode: 0o700 });
    const run = (code) => spawnSync('/bin/bash', ['-c', script], {
      cwd: dir, env: { ...process.env, PATCH_RESULT: String(code) }, encoding: 'utf8',
    });
    assert.notEqual(run(0).status, 0, 'missing committed GPS patch must fail closed');
    writeFileSync(join(dir, 'patches/react-native-yamap+4.8.3.patch'), 'fixture\n');
    assert.equal(run(0).status, 0);
    assert.equal(readFileSync(join(dir, 'patch-args'), 'utf8'), '--error-on-fail');
    assert.equal(run(7).status, 7, 'patch failure must propagate before Gradle/upload');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
