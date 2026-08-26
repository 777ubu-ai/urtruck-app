import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/reviewer-auth-ci-diagnostic.yml'),
  'utf8',
);
const diagnosticShell = fs.readFileSync(
  path.join(root, 'qa/scripts/reviewer-auth-diagnostic/run-ci-diagnostic.sh'),
  'utf8',
);

test('reviewer auth CI diagnostic pins the exact source sha, APK artifact identity and SHA256', () => {
  assert.match(workflow, /SOURCE_SHA: aaf8760da0fa4b8068db27a2d535aff938e593dc/);
  assert.match(workflow, /APK_RUN_ID: "32864148744"/);
  assert.match(workflow, /APK_ARTIFACT_ID: "9569835383"/);
  assert.match(workflow, /APK_SHA256: 062842f31ec74f5b6cdb9cd841f5abe541d0d844de55315c61960a27812cad7b/);
  assert.match(workflow, /gh api "repos\/777ubu-ai\/urtruck-app\/actions\/artifacts\/\$\{APK_ARTIFACT_ID\}"/);
  assert.match(workflow, /test "\$actual_sha" = "\$APK_SHA256"/);
});

test('reviewer auth CI diagnostic always uploads artifacts and runs the exact reviewer login flow', () => {
  assert.match(workflow, /permissions:\s*\n\s*contents: read\s*\n\s*actions: read/);
  assert.match(workflow, /FLOW_PATH: qa\/maestro\/google-play-location\/login-reviewer-driver\.yaml/);
  assert.match(diagnosticShell, /for attempt in 1 2 3 4 5;/);
  assert.match(workflow, /if: \$\{\{ always\(\) && hashFiles\('qa\/artifacts\/reviewer-auth-diagnostic\/\*\*'\) != '' \}\}/);
  assert.match(workflow, /name: reviewer-auth-ci-diagnostic/);
  assert.match(workflow, /mitmproxy==11\.0\.2/);
  assert.match(workflow, /sudo apt-get install -y unzip ripgrep/);
  assert.match(workflow, /emulator-options: .* -writable-system/);
  assert.match(diagnosticShell, /if command -v rg >\/dev\/null 2>&1;/);
  assert.match(diagnosticShell, /Skipping global proxy because mitmproxy CA is not trusted by the emulator/);
});
