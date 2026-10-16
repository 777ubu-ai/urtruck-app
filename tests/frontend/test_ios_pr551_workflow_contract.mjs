import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/testflight-pr551.yml', 'utf8');
const dispatch = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('\npermissions:'));
const submitStep = workflow.match(/      - name: Submit IPA to TestFlight([\s\S]*?)(?=\n      - name:|$)/)?.[1];

assert.ok(dispatch.includes('workflow_dispatch:'), 'production IPA release must remain manual-only');
assert.ok(dispatch.includes('expected_tooling_sha:'), 'dispatch must identify the independently reviewed tooling SHA');
assert.ok(dispatch.includes('asc_max_ios_build:'), 'dispatch must carry a fresh read-only ASC maximum');
assert.match(dispatch, /upload_mode:[\s\S]*?default: build_only[\s\S]*?options:[\s\S]*?- build_only[\s\S]*?- upload_testflight/);
assert.doesNotMatch(dispatch, /^\s{2}(push|pull_request|schedule):/m, 'no automatic production build trigger is allowed');

assert.ok(workflow.includes('group: urtruck-ios-production-push-inbox'), 'keep the existing single production build concurrency group');
assert.ok(workflow.includes('URTRUCK_TOOLING_BRANCH: main'));
assert.ok(workflow.includes('name: UrTruck PR555 Exact-source TestFlight'));
assert.ok(workflow.includes('URTRUCK_APP_SOURCE_BRANCH: fix/deal-status-safe-area-20261016'));
assert.ok(workflow.includes('URTRUCK_SOURCE_SHA: 227ab583f1fca4064442356f62ec3b9d21063c6d'));
assert.match(workflow, /test "\$EXPECTED_TOOLING_SHA" = "\$GITHUB_SHA"/);
assert.match(workflow, /git checkout --detach "\$URTRUCK_SOURCE_SHA"/);
assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$URTRUCK_SOURCE_SHA"/);

assert.ok(workflow.includes('URTRUCK_SOURCE_CI_RUN_ID: 38945022343'), 'use the existing successful CI for exact app source');
assert.ok(workflow.includes('Verify existing exact-source CI result'));
assert.ok(workflow.includes('test_ios_pr551_workflow_contract.mjs'), 'run the focused workflow contract test');

assert.ok(workflow.includes('EXPO_PUBLIC_API_URL: https://urtruck.kz'));
assert.ok(workflow.includes('URTRUCK_BUILD_FLAVOR: production'));
assert.ok(workflow.includes('secrets.YANDEX_MAPS_JS_API_KEY'));
assert.ok(workflow.includes('secrets.YANDEX_MAPKIT_API_KEY'));
assert.ok(workflow.includes('npx --yes eas-cli@25.0.0'), 'pin EAS CLI to a fixed version');
assert.doesNotMatch(workflow, /eas-cli@latest/, 'do not resolve a moving EAS CLI tag');
const installDependencies = workflow.match(/      - name: Install dependencies([\s\S]*?)(?=\n      - name:|$)/)?.[1] || '';
assert.doesNotMatch(installDependencies, /EXPO_TOKEN|YANDEX|OPENROUTESERVICE/,
  'production credentials must not be inherited by npm install lifecycle scripts');
assert.match(workflow, /name: Build signed IPA locally[\s\S]*?env:[\s\S]*?EXPO_TOKEN: \$\{\{ secrets\.EXPO_TOKEN \}\}/,
  'EAS token is available only to the signed build step that needs it');
assert.match(workflow, /name: Inject production runtime configuration[\s\S]*?env:[\s\S]*?YANDEX_ROUTER_API_KEY: \$\{\{ secrets\.YANDEX_ROUTER_API_KEY \}\}/,
  'runtime provider keys are scoped to runtime config injection');
assert.ok(workflow.includes('codesign --verify --deep --strict'));
assert.ok(workflow.includes("entitlements['aps-environment'] == 'production'"));
assert.ok(workflow.includes("config['extra']['urtruckApiUrl'].rstrip('/') == 'https://urtruck.kz'"));
assert.ok(workflow.includes("info['CFBundleIdentifier'] == 'com.urtruck.app'"));
assert.ok(workflow.includes("info['CFBundleShortVersionString'] == '1.0.9'"));
assert.ok(workflow.includes('npx --yes eas-cli@25.0.0 build:version:get --platform ios --profile production --json'));
assert.ok(workflow.indexOf('name: Verify exact branch and credentials')
  < workflow.indexOf('name: Install dependencies'),
  'pin and validate the checked-out source before running npm lifecycle scripts');
assert.ok(workflow.indexOf('name: Install dependencies')
  < workflow.indexOf('name: Verify EAS account and build counter'),
  'install Expo plugins before asking EAS CLI to resolve app config/build counter');
assert.ok(workflow.indexOf('name: Verify EAS account and build counter')
  < workflow.indexOf('name: Build signed IPA locally'),
  'verify the live EAS counter before allocating a build');
assert.ok(workflow.includes('EAS_CURRENT_IOS_BUILD'));
assert.ok(workflow.includes('int(number) > int(os.environ[\'ASC_MAX_IOS_BUILD\'])'));
assert.ok(workflow.includes('int(number) > int(os.environ[\'EAS_CURRENT_IOS_BUILD\'])'));
assert.ok(workflow.includes('int(number) == int(os.environ[\'URTRUCK_NEXT_IOS_BUILD\'])'));
assert.doesNotMatch(workflow, /URTRUCK_MIN_IOS_BUILD:\s*98/,
  'do not assume an unreserved next iOS build number');

assert.ok(submitStep, 'TestFlight upload step must exist');
assert.match(submitStep, /if: \$\{\{ inputs\.upload_mode == 'upload_testflight' \}\}/,
  'TestFlight upload must require explicit opt-in');
assert.equal((workflow.match(/npx --yes eas-cli@25\.0\.0 submit --platform ios/g) || []).length, 1,
  'keep a single explicit TestFlight upload command');
assert.ok(workflow.indexOf('name: Upload private IPA artifact') < workflow.indexOf('name: Submit IPA to TestFlight'));
assert.doesNotMatch(workflow, /--auto-submit|Add for Review|Submit for App Review|appStoreReviewSubmissions/,
  'this tooling may upload to TestFlight but must never submit to App Review');

console.log('iOS release workflow contract: PASS');

assert.match(workflow, /build-and-upload:[\s\S]*?environment: production/, 'signing and upload retain protected production Environment');
