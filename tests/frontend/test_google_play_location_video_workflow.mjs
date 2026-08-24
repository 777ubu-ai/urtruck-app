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
