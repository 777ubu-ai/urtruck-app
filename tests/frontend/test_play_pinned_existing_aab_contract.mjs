import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/deploy-play.yml', 'utf8');

test('pinned existing-AAB mode is opt-in and limited to the consolidated release branch', () => {
  assert.match(workflow, /upload_existing_pinned_aab:[\s\S]*?default: false[\s\S]*?type: boolean/);
  assert.match(workflow, /upload-existing-pinned-aab:[\s\S]*?test "\$GITHUB_REF_NAME" = "release\/consolidated-20261014"/);
  assert.match(workflow, /git merge-base --is-ancestor "\$EXPECTED_SOURCE_SHA" "\$GITHUB_SHA"/);
  assert.match(workflow, /Unexpected non-release-tooling path after frozen app source/);
  assert.match(workflow, /EXPECTED_RUN_ID: "38512422153"/);
  assert.match(workflow, /EXPECTED_ARTIFACT_ID: "11870969860"/);
  assert.match(workflow, /EXPECTED_SOURCE_SHA: "9ac0b6200e1e91aa40b99cd1f4943062e2acc048"/);
});

test('existing AAB upload validates origin CI, artifact identity and exact bytes before upload', () => {
  assert.match(workflow, /\.name \| startswith\("quality-gate \/"\)\)\] \| length == 3 and all\(\.\[\]; \.conclusion == "success"\)/);
  assert.match(workflow, /Build AAB and upload to Play" and \.conclusion == "success"/);
  assert.match(workflow, /artifact-ids: 11870969860/);
  assert.match(workflow, /03500f2861ed6d07f20dc9d71f388d42438a589b046396bd393861718fe138da/);
  assert.match(workflow, /android:versionCode="214116271"/);
  assert.match(workflow, /android:versionName="1\.0\.9"/);
  assert.match(workflow, /node scripts\/verify-production-apk-config\.mjs/);
  assert.match(workflow, /PAGE_ALIGNMENT_16K/);
  assert.match(workflow, /expected_cert="BB2474C2ED08076F7141FE1E4D3F6C604FC3E860FE5811E3C2FCD129E7CB88B4"/);
  assert.match(workflow, /jarsigner -verify/);
});

test('pinned existing-AAB upload skips rebuild and keeps the shared Play concurrency lock', () => {
  assert.match(workflow, /group: google-play-\$\{\{ github\.repository \}\}[\s\S]*?cancel-in-progress: false/);
  assert.match(workflow, /quality-gate:[\s\S]*?!inputs\.upload_existing_pinned_aab/);
  assert.match(workflow, /build-and-submit:[\s\S]*?!inputs\.upload_existing_pinned_aab/);
  assert.match(workflow, /uses: r0adkll\/upload-google-play@v1/);
  assert.match(workflow, /this step uploads the existing AAB and never runs Gradle\/build/);
  assert.doesNotMatch(workflow, /upload-existing-pinned-aab:[\s\S]{0,14000}gradlew|upload-existing-pinned-aab:[\s\S]{0,14000}Build release AAB/);
});
