import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/google-play-location-video.yml'),
  'utf8',
);

test('android emulator runner invokes bash explicitly before enabling pipefail', () => {
  const runnerStep = workflow.match(
    /- name: Boot Android emulator and record evidence[\s\S]*?script:\s*\|\n([\s\S]*?)\n\s*- name:/,
  );

  assert.ok(runnerStep, 'emulator runner step must exist');
  const scriptBlock = runnerStep[1];

  assert.match(
    scriptBlock,
    /bash -lc 'set -euo pipefail; export PATH="\$HOME\/\.maestro\/bin:\$PATH"; bash qa\/scripts\/google-play-background-location\/run-ci-video\.sh'/,
    'emulator runner must enter bash explicitly before pipefail and CI video script execution',
  );
  assert.doesNotMatch(
    scriptBlock,
    /^\s*set -euo pipefail\s*$/m,
    'runner script must not rely on /bin/sh supporting pipefail',
  );
});

test('background-location evidence always records exact run in release ledger', () => {
  assert.match(
    workflow,
    /permissions:\s*\n\s*contents: read\s*\n\s*issues: write/,
    'workflow must be allowed to write release evidence to the issue ledger',
  );

  const ledgerStep = workflow.match(
    /- name: Record background-location evidence in release ledger[\s\S]*$/,
  );
  assert.ok(ledgerStep, 'release-ledger evidence step must exist');

  const block = ledgerStep[0];
  assert.match(block, /if: always\(\)/, 'ledger step must report both PASS and FAIL');
  assert.match(block, /EVIDENCE_SOURCE_SHA: \$\{\{ env\.SOURCE_SHA \}\}/);
  assert.match(block, /EVIDENCE_RESULT: \$\{\{ job\.status \}\}/);
  assert.match(block, /context\.runId/, 'ledger entry must include the exact workflow run URL');
  assert.match(block, /issue_number: 247/, 'release evidence must be written to issue #247');
  assert.match(block, /google-play-background-location-evidence/);
  assert.match(block, /com\.urtruck\.app/);
});
