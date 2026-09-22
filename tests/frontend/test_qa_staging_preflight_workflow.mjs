import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflow = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/qa-staging-preflight.yml'),
  'utf8',
);

test('QA staging preflight binds an API process to QA root without command-line ordering assumptions', () => {
  assert.match(workflow, /for candidate_pid in \$\(pgrep -f 'uvicorn\|gunicorn' \|\| true\); do/);
  assert.match(workflow, /readlink -f "\/proc\/\$candidate_pid\/cwd"/);
  assert.match(workflow, /tr '\\0' ' ' < "\/proc\/\$candidate_pid\/cmdline"/);
  assert.match(workflow, /"\$qa_root"\|"\$qa_root"\/\*/);
  assert.match(workflow, /grep -Fq -- "\$qa_root"/);
  assert.doesNotMatch(
    workflow,
    /pgrep -fo '\/home\/ubuntu\/urtruck-qa2\.\*\(uvicorn\|gunicorn\)'/,
  );
});

test('QA staging preflight keeps isolation and port guards', () => {
  assert.match(workflow, /QA_PREFLIGHT_EXISTING_PORT_MISSING/);
  assert.match(workflow, /\(\^\|:\)8002\$/);
  assert.match(workflow, /QA_PREFLIGHT_EXISTING_DB_NOT_ISOLATED/);
  assert.match(workflow, /QA_PREFLIGHT_SYSTEMD_UNIT_INACTIVE/);
});
