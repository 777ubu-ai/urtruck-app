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

test('QA staging preflight supports verified systemd or direct-nohup restart modes', () => {
  assert.match(workflow, /for\(i=NF;i>=1;i--\) if \(\$i ~ \/\\\.service\$\//);
  assert.match(workflow, /systemctl --user is-active --quiet/);
  assert.match(workflow, /systemctl is-active --quiet/);
  assert.match(workflow, /QA_PREFLIGHT_RESTART_MODE=exact-port-8002-direct-nohup/);
  assert.match(workflow, /QA_PREFLIGHT_QA_LISTENER_OWNER_MISMATCH/);
  assert.match(workflow, /grep -Fq 'main:app'/);
  assert.match(workflow, /curl -fsS http:\/\/127\.0\.0\.1:8002\/api\/version/);
});

test('QA staging preflight keeps isolation and port guards', () => {
  assert.match(workflow, /QA_PREFLIGHT_EXISTING_PORT_MISSING/);
  assert.match(workflow, /\(\^\|:\)8002\$/);
  assert.match(workflow, /QA_PREFLIGHT_EXISTING_DB_NOT_ISOLATED/);
  assert.match(workflow, /QA_PREFLIGHT_SYSTEMD_UNIT_INACTIVE/);
});

test('QA staging preflight emits safe startup diagnostics without reading env contents', () => {
  assert.match(workflow, /QA_PREFLIGHT_REMOTE_CONNECTED=yes/);
  assert.match(workflow, /QA_PREFLIGHT_UVICORN_LOG=present/);
  assert.match(workflow, /safe_startup_diagnostic/);
  assert.match(workflow, /tail -n 120/);
  assert.match(workflow, /<redacted>/);
  assert.doesNotMatch(workflow, /cat \"\\$qa_root\\\/\\.env\"/);
});

test('QA staging preflight tolerates an empty fuser/lsof result before reporting listener absence', () => {
  assert.ok(workflow.includes('{ fuser -n tcp 8002 2>/dev/null || true; }'));
  assert.ok(workflow.includes('{ lsof -nP -iTCP:8002 -sTCP:LISTEN -t 2>/dev/null || true; }'));
});

test('QA staging preflight reports Python runtime layout without exposing paths', () => {
  assert.match(workflow, /QA_PREFLIGHT_VENV_BACKEND=present/);
  assert.match(workflow, /QA_PREFLIGHT_VENV_ROOT=present/);
  assert.match(workflow, /QA_PREFLIGHT_DOTVENV_BACKEND=present/);
  assert.match(workflow, /QA_PREFLIGHT_SYSTEM_PYTHON=present/);
});

test('QA staging preflight proves recovery prerequisites before touching the listener', () => {
  assert.match(workflow, /QA_PREFLIGHT_SYSTEM_PYTHON_API_DEPS=present/);
  assert.match(workflow, /QA_PREFLIGHT_ENVIRONMENT=nonproduction/);
  assert.match(workflow, /QA_PREFLIGHT_ROLLBACK_BACKUP=present/);
  assert.match(workflow, /QA_PREFLIGHT_CURRENT_CODE_MATCHES_PREDEPLOY=yes/);
  assert.match(workflow, /QA_PREFLIGHT_STORAGE_INODE=preserved/);
});

test('QA staging code fingerprint includes database DAL code while excluding data files', () => {
  assert.ok(!workflow.includes("! -path './database/*'"));
  assert.ok(workflow.includes("! -name '*.db'"));
  assert.ok(workflow.includes("! -name '*.sqlite*'"));
});
