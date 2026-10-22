import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/qa-staging-deploy.yml', 'utf8');
const step = (name) => workflow.split(`      - name: ${name}\n`)[1].split('\n      - name: ')[0];
const validation = step('Validate deployed source, restart exact QA2 listener and verify protected state');

// Выполняется оболочка runner; вместо SSH сохраняется переданное тело, сеть не используется.
test('удалённые проверки передаются SSH без раскрытия переменных и curl на runner', () => {
  const start = validation.indexOf('          sshpass ');
  const end = validation.indexOf('\n          REMOTE', start) + '\n          REMOTE'.length;
  for (const enabled of ['true', 'false']) {
    const script = 'set -eu\nQA_SOURCE_SHA=71d1624222ca0788ad719a9cc3696d7848849c7e\nSERVER_USER=test\nSERVER_HOST=isolated.invalid\nsshpass() { cat; }\ncurl() { echo RUNNER_CURL_FORBIDDEN >&2; return 91; }\n'
      + validation.slice(start, end).replaceAll('${{ inputs.enable_external_freight_feed }}', enabled) + '\n';
    const result = spawnSync('bash', [], { input: script, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('openapi="$(curl '));
    assert.ok(result.stdout.includes('"$openapi"'));
    assert.doesNotMatch(result.stderr, /RUNNER_CURL_FORBIDDEN/);
  }
});

test('режим ленты пропускает перенастройку AI и запись fixtures основных грузов', () => {
  for (const name of ['Verify existing QA2 secret and local NLLB policy before mutation', 'Configure the bounded QA2-only OpenAI STT route', 'Runtime QA2P isolation check through QA and production APIs']) {
    assert.ok(step(name).startsWith('        if: ${{ !inputs.enable_external_freight_feed }}\n'), name);
  }
  const body = validation.match(/python3 - "\$ENV_BACKUP" "\$qa_root\/\.env" <<'PYENV'\n([\s\S]*?)\n          PYENV/)[1].replace(/^ {10}/gm, '');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urtruck-env-regression-'));
  try {
    const before = path.join(dir, 'before');
    const after = path.join(dir, 'after');
    fs.writeFileSync(before, 'TRANSCRIBE_PROVIDER=openai\nTRANSLATE_PROVIDER=local_ai\n');
    fs.writeFileSync(after, fs.readFileSync(before, 'utf8') + 'EXTERNAL_FREIGHT_FEED_ENABLED=true\n');
    const run = () => spawnSync('python3', ['-c', body, before, after], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    fs.appendFileSync(after, 'TRANSCRIBE_PROVIDER=local_ai\n');
    const changed = run();
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /QA2_PROTECTED_SETTINGS_CHANGED/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rollback восстанавливает точное окружение с любым исходным provider и отвергает повреждение', () => {
  const rollback = step('Roll back QA2 code and settings if deploy validation fails');
  const line = rollback.split('\n').find((value) => value.includes('cmp -s -- "$ENV_BACKUP"'));
  assert.ok(line);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urtruck-rollback-regression-'));
  try {
    const before = path.join(dir, 'before');
    const qaRoot = path.join(dir, 'qa');
    fs.mkdirSync(qaRoot);
    for (const provider of ['openai', 'local_ai']) {
      fs.writeFileSync(before, `TRANSCRIBE_PROVIDER=${provider}\nTRANSLATE_PROVIDER=local_ai\n`);
      fs.copyFileSync(before, path.join(qaRoot, '.env'));
      const run = () => spawnSync('bash', ['-eu', '-c', line], { encoding: 'utf8', env: { ...process.env, ENV_BACKUP: before, qa_root: qaRoot } });
      assert.equal(run().status, 0);
      fs.appendFileSync(path.join(qaRoot, '.env'), 'WRONG=true\n');
      assert.notEqual(run().status, 0);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
