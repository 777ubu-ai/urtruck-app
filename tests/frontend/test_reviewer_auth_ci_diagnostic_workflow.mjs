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
  assert.match(workflow, /REVIEWER_EMAIL: appreview@urtruck\.kz/);
  assert.match(workflow, /REVIEWER_CODE: "1975"/);
  assert.match(diagnosticShell, /for attempt in 1 2 3 4 5;/);
  assert.match(workflow, /if: \$\{\{ always\(\) && hashFiles\('qa\/artifacts\/reviewer-auth-diagnostic\/\*\*'\) != '' \}\}/);
  assert.match(workflow, /name: reviewer-auth-ci-diagnostic/);
  assert.match(workflow, /mitmproxy==11\.0\.2/);
  assert.match(workflow, /sudo apt-get install -y unzip ripgrep/);
  assert.match(workflow, /emulator-options: .* -writable-system/);
  assert.match(diagnosticShell, /if command -v rg >\/dev\/null 2>&1;/);
  assert.match(diagnosticShell, /sanitize_ui_dump\(\)/);
  assert.match(diagnosticShell, /end_tag = '<\/hierarchy>'/);
  assert.match(diagnosticShell, /sanitize_ui_dump "\$raw_dump" "\$dest"/);
  assert.match(diagnosticShell, /PREFLIGHT_STABLE_PROBES="\$\{PREFLIGHT_STABLE_PROBES:-3\}"/);
  assert.match(diagnosticShell, /PREFLIGHT_MAX_ATTEMPTS="\$\{PREFLIGHT_MAX_ATTEMPTS:-6\}"/);
  assert.match(diagnosticShell, /PREFLIGHT_RECURRENCE_COUNT=0/);
  assert.match(diagnosticShell, /current_focus_is_clean_app\(\)/);
  assert.match(diagnosticShell, /current_focus_has_system_anr\(\)/);
  assert.match(diagnosticShell, /wait_for_clean_preflight_window\(\)/);
  assert.match(diagnosticShell, /preflight_recurrent_anr_attempt_/);
  assert.match(diagnosticShell, /preflight_stable_attempt_\$\{attempt\}_probe_\$\{probe\}/);
  assert.match(diagnosticShell, /"clean foreground before Maestro": "\$clean_foreground_before_maestro"/);
  assert.match(diagnosticShell, /"ANR recurrence count": "\$anr_recurrence_count"/);
  assert.match(diagnosticShell, /if ! ensure_preflight_ready; then/);
  assert.match(diagnosticShell, /Skipping global proxy because mitmproxy CA is not trusted by the emulator/);
  assert.match(diagnosticShell, /PREFLIGHT_TARGET_ID="\$\{PREFLIGHT_TARGET_ID:-onb-v2-cta-phone\}"/);
  assert.match(diagnosticShell, /Detected system ANR dialog before reviewer flow/);
  assert.match(diagnosticShell, /dumpsys window windows > "\$dir\/dumpsys-window\.txt"/);
  assert.match(diagnosticShell, /ensure_preflight_ready/);
});
