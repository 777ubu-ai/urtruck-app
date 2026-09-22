import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflow = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/qa-staging-preflight.yml'),
  'utf8',
);

test('QA staging preflight identifies the API process from the 8002 listener', () => {
  assert.match(workflow, /ss -ltnpH 'sport = :8002'/);
  assert.match(workflow, /fuser -n tcp 8002/);
  assert.match(workflow, /lsof -nP -iTCP:8002 -sTCP:LISTEN -t/);
  assert.match(workflow, /QA_PREFLIGHT_QA_LISTENER_PID_MISSING/);
  assert.match(workflow, /QA_PREFLIGHT_QA_LISTENER_UNEXPECTED_PROCESS/);
});

test('QA staging preflight derives the real service and proves QA-root linkage', () => {
  assert.match(workflow, /for\(i=NF;i>=1;i--\) if \(\$i ~ \/\\\.service\$\//);
  assert.match(workflow, /systemctl --user is-active --quiet/);
  assert.match(workflow, /systemctl is-active --quiet/);
  assert.match(workflow, /systemctl --user cat/);
  assert.match(workflow, /systemctl cat/);
  assert.match(workflow, /QA_PREFLIGHT_QA_LISTENER_NOT_LINKED_TO_QA_ROOT/);
});

test('QA staging preflight keeps isolation and port guards', () => {
  assert.match(workflow, /QA_PREFLIGHT_EXISTING_PORT_MISSING/);
  assert.match(workflow, /\(\^\|:\)8002\$/);
  assert.match(workflow, /QA_PREFLIGHT_EXISTING_DB_NOT_ISOLATED/);
  assert.match(workflow, /QA_PREFLIGHT_SYSTEMD_UNIT_INACTIVE/);
});
