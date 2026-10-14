import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/deploy-play.yml', 'utf8');
const trackHelper = readFileSync('scripts/ops/google-play-pinned-track.mjs', 'utf8');
const apkRequirements = readFileSync('scripts/ops/google-play-apk-requirements.txt', 'utf8');

test('pinned existing-AAB mode is opt-in and bound to the reviewed executable tooling SHA', () => {
  assert.match(workflow, /upload_existing_pinned_aab:[\s\S]*?default: false[\s\S]*?type: boolean/);
  assert.match(workflow, /APPROVED_TOOLING_SHA: \$\{\{ vars\.PLAY_RELEASE_TOOLING_SHA \}\}/);
  assert.match(workflow, /name: Checkout release tooling\s+uses: actions\/checkout@v4\s+with:\s+fetch-depth: 0/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/release\/consolidated-20261014"/);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$APPROVED_TOOLING_SHA"/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$APPROVED_TOOLING_SHA"/);
  assert.match(workflow, /git merge-base --is-ancestor "\$EXPECTED_SOURCE_SHA" "\$GITHUB_SHA"/);
  assert.match(workflow, /Unexpected non-release-tooling path after frozen app source/);
  assert.match(workflow, /EXPECTED_RUN_ID: "38512422153"/);
  assert.match(workflow, /EXPECTED_ARTIFACT_ID: "11870969860"/);
  assert.match(workflow, /urtruck-existing-aab\/UrTruck-aab\/app-release\.aab/);
  assert.match(workflow, /aab="\$RUNNER_TEMP\/urtruck-existing-aab\/UrTruck-aab\/app-release\.aab"[\s\S]*?releaseFiles: \$\{\{ runner\.temp \}\}\/urtruck-existing-aab\/UrTruck-aab\/app-release\.aab/);
  assert.match(workflow, /EXPECTED_SOURCE_SHA: "9ac0b6200e1e91aa40b99cd1f4943062e2acc048"/);
  assert.match(workflow, /scripts\/ops\/google-play-pinned-track\.mjs/);
});

test('Play credentials never reach dependency installation and tooling dependencies are fully version-pinned', () => {
  const credentialSteps = workflow.split(/(?=^      - name: )/m).filter((step) => step.includes('secrets.PLAY_SERVICE_ACCOUNT_JSON'));
  assert.equal(credentialSteps.length, 6, 'only existing Play upload, APK retrieval, track readback, two track API calls and upload action need Play credentials');
  for (const step of credentialSteps) {
    assert.doesNotMatch(step, /pip install|npm install/);
  }
  assert.doesNotMatch(workflow, /python3? -m pip install[^\n]*google-auth|python3? -m pip install[^\n]*requests/);
  for (const name of ['google-auth', 'requests', 'cryptography', 'cffi', 'pycparser', 'urllib3', 'certifi']) {
    assert.match(apkRequirements, new RegExp(`^${name}==[0-9][^\\n]*$`, 'm'));
  }
  assert.match(workflow, /pip install[^\n]*--no-deps --requirement scripts\/ops\/google-play-apk-requirements\.txt/);
  assert.match(workflow, /python -m pip check/);
  assert.doesNotMatch(trackHelper, /child_process|execSync|spawnSync|npm install|pip install/);
  assert.match(trackHelper, /PLAY_SERVICE_ACCOUNT_JSON/);
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
  assert.match(workflow, /Read current Play track version codes before upload[\s\S]*?node scripts\/ops\/google-play-pinned-track\.mjs preflight/);
  assert.match(trackHelper, /PLAY_PREFLIGHT_BLOCKED.*versionCode \$\{VERSION_CODE\} must first be completed on internal track/);
  assert.match(trackHelper, /temporary edit cleanup HTTP/);
  assert.match(workflow, /uses: r0adkll\/upload-google-play@v1/);
  assert.match(workflow, /internal uploads the existing AAB; production promotes its completed internal version code without re-uploading or rebuilding/);
  assert.doesNotMatch(workflow, /upload-existing-pinned-aab:[\s\S]{0,14000}gradlew|upload-existing-pinned-aab:[\s\S]{0,14000}Build release AAB/);
});

test('internal-track readback is opt-in, pinned to reviewed tooling, and never rebuilds or uploads', () => {
  assert.match(workflow, /verify_existing_internal_release:[\s\S]*?default: false[\s\S]*?type: boolean/);
  assert.match(workflow, /verify-existing-internal-release:[\s\S]*?inputs\.verify_existing_internal_release[\s\S]*?Verify pinned source and reviewed tooling identity[\s\S]*?APPROVED_TOOLING_SHA: \$\{\{ vars\.PLAY_RELEASE_TOOLING_SHA \}\}[\s\S]*?test "\$GITHUB_SHA" = "\$APPROVED_TOOLING_SHA"[\s\S]*?Read back internal release using a temporary edit without changing track state[\s\S]*?google-play-pinned-track\.mjs verify-internal/);
  assert.match(workflow, /quality-gate:[\s\S]*?!inputs\.verify_existing_internal_release/);
  assert.match(workflow, /build-and-submit:[\s\S]*?!inputs\.verify_existing_internal_release/);
  assert.match(workflow, /printf '%s\\n'[\s\S]*?Pinned Android AAB upload/);
});

test('production reuses the completed internal version without uploading the same bundle twice', () => {
  assert.match(workflow, /Upload verified AAB to the selected Play track[\s\S]*?if: \$\{\{ inputs\.track != 'production' \}\}/);
  assert.match(workflow, /Promote the already uploaded internal version to production without re-upload/);
  assert.match(trackHelper, /pinned versionCode is not completed on internal/);
  assert.match(trackHelper, /versionCodes: \[VERSION_CODE\],[\s\S]*?status: 'completed'/);
  assert.match(trackHelper, /changesInReviewBehavior=ERROR_IF_IN_REVIEW/);
  assert.match(trackHelper, /changesInReviewBehavior=ERROR_IF_IN_REVIEW/);
  assert.match(trackHelper, /production promotion must be a completed 100% release after review/);
  assert.match(trackHelper, /countryAvailability\/production/);
  assert.match(trackHelper, /production country availability is empty; refusing to broaden release/);
  assert.match(trackHelper, /productionCountryAvailabilityUnchanged: true/);
  assert.doesNotMatch(trackHelper, /countryTargeting/);
});
