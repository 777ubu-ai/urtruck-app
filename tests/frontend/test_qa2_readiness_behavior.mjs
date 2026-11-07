import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';

const workflow = fs.readFileSync('.github/workflows/deploy-qa2-final-integration.yml', 'utf8');
const helpers = [...workflow.matchAll(/          wait_for_qa2_api\(\) \{[\s\S]*?\n          \}/g)]
  .map(([source]) => source.replace(/^ {10}/gm, ''));

function runWait(index, systemReady, readyAfter, timeout = 1) {
  assert.equal(helpers.length, 2, 'Forward и rollback используют проверяемое ожидание готовности');
  return spawnSync('bash', ['-c', `
set -euo pipefail
qa2_test_calls=0
sudo() { "$@"; }
systemctl() { return ${systemReady ? 0 : 1}; }
curl() { qa2_test_calls=$((qa2_test_calls + 1)); ((qa2_test_calls >= ${readyAfter})); }
sleep() { command sleep 0.05; }
${helpers[index]}
qa2_test_status=0
wait_for_qa2_api ${timeout} || qa2_test_status=$?
printf 'status=%s calls=%s\n' "$qa2_test_status" "$qa2_test_calls"
exit "$qa2_test_status"
`], { encoding: 'utf8', timeout: 5000 });
}

test('Оба пути дают холодному запуску ограниченные 180 секунд', () => {
  assert.equal(helpers.length, 2);
  assert.equal(helpers[0], helpers[1], 'Откат не должен проверять HTTP раньше готовности');
  const timeouts = [...workflow.matchAll(/^          wait_for_qa2_api (\d+)$/gm)].map((match) => Number(match[1]));
  assert.deepEqual(timeouts, [180, 180]);
});

for (const index of [0, 1]) {
  const phase = index === 0 ? 'forward' : 'rollback';
  test(`${phase}: ожидает готовность после временного отсутствия HTTP`, () => {
    const result = runWait(index, true, 3, 5);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /status=0 calls=3/);
  });
  test(`${phase}: завершается отказом по deadline, когда HTTP не готов`, () => {
    const result = runWait(index, true, 1000000);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /status=1 calls=[1-9]\d*/);
  });
  test(`${phase}: active service обязателен, одного HTTP недостаточно`, () => {
    const result = runWait(index, false, 1);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /status=1 calls=0/);
  });
  test(`${phase}: отвергает неограниченный или неверный timeout`, () => {
    for (const timeout of [0, -1, 301, 'invalid']) {
      const result = runWait(index, true, 1, timeout);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stdout, /status=2 calls=0/);
    }
  });
}

test('Ошибка до backup не запускает чужой или устаревший rollback', () => {
  const rollback = workflow.slice(workflow.indexOf('- name: Roll back only QA2'));
  const expression = rollback.match(/^        if: (.+)$/m)[1].trim()
    .replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
  for (const [failed, outcome, expected] of [
    [true, 'success', true], [true, 'failure', false],
    [true, 'skipped', false], [false, 'success', false],
  ]) {
    assert.equal(vm.runInNewContext(expression, {
      failure: () => failed, steps: { qa2_backup: { outcome } },
    }, { timeout: 100 }), expected);
  }
  const backupStep = workflow.indexOf('- name: Create QA2 code-only rollback backup');
  const ready = workflow.indexOf('id: qa2_backup');
  const deploy = workflow.indexOf('- name: Deploy exact backend, web and AI source');
  assert.ok(backupStep < ready && ready < deploy);
  assert.ok(!workflow.includes('/tmp/urtruck-qa2-final-rollback-id'));
  assert.match(workflow, /QA2_RUN_ATTEMPT: \$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.equal((workflow.match(/final-rollback-\$QA2_RUN_ATTEMPT/g) || []).length, 2);
});

test('Неполная резервная копия не получает указатель успешного backup', () => {
  const backupStep = workflow.slice(workflow.indexOf('- name: Create QA2 code-only rollback backup'),
    workflow.indexOf('- name: Deploy exact backend, web and AI source'));
  const guard = backupStep.slice(backupStep.indexOf('          test -s "$backup/qa2.env"'),
    backupStep.indexOf('          echo "QA2_ROLLBACK_BACKUP='))
    .replace(/^ {10}/gm, '');
  assert.ok(guard.includes('final-rollback-$QA2_RUN_ATTEMPT'));
  for (const omitted of [null, 'qa2.env', 'backend/main.py', 'ai/main.py']) {
    for (const empty of [false, true]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'urtruck-backup-guard-'));
      try {
        fs.mkdirSync(path.join(root, 'backups', 'copy', 'backend'), { recursive: true });
        fs.mkdirSync(path.join(root, 'backups', 'copy', 'ai'), { recursive: true });
        for (const file of ['qa2.env', 'backend/main.py', 'ai/main.py']) {
          if (file !== omitted || empty) {
            fs.writeFileSync(path.join(root, 'backups', 'copy', file), file === omitted ? '' : 'fixture');
          }
        }
        const result = spawnSync('bash', ['-c', `set -euo pipefail
QA_ROOT="$1"
backup="$QA_ROOT/backups/copy"
QA2_RUN_ATTEMPT=123-1
stamp=fixture
${guard}`, 'qa2-backup-test', root], { encoding: 'utf8', timeout: 5000 });
        const pointer = fs.existsSync(path.join(root, 'backups', 'final-rollback-123-1'));
        if (omitted === null) {
          assert.equal(result.status, 0, result.stderr);
          assert.equal(pointer, true);
        } else {
          assert.notEqual(result.status, 0, `${omitted}: ${empty ? 'пустой' : 'отсутствует'}`);
          assert.equal(pointer, false, `Нельзя разрешать откат: ${omitted}`);
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }
});
