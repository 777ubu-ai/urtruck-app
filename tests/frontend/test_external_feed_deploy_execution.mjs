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
    const script = 'set -eu\nQA_SOURCE_SHA=71d1624222ca0788ad719a9cc3696d7848849c7e\nSERVER_USER=test\nSERVER_HOST=isolated.invalid\nQA2_SSH_KNOWN_HOSTS_FILE=/tmp/known-hosts-test\nsshpass() { cat; }\ncurl() { echo RUNNER_CURL_FORBIDDEN >&2; return 91; }\n'
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
  const body = validation.match(/python3 - "\$ENV_BACKUP" "\$qa_root\/\.env" "\$BACKEND_ENV_BACKUP" "\$qa_backend\/\.env" <<'PYENV'\n([\s\S]*?)\n          PYENV/)[1].replace(/^ {10}/gm, '');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urtruck-env-regression-'));
  try {
    const before = path.join(dir, 'before');
    const after = path.join(dir, 'after');
    fs.writeFileSync(before, 'TRANSCRIBE_PROVIDER=openai\nTRANSLATE_PROVIDER=local_ai\n');
    fs.writeFileSync(after, fs.readFileSync(before, 'utf8') + 'EXTERNAL_FREIGHT_FEED_ENABLED=true\nEXTERNAL_FREIGHT_IMPORTER_KEY=isolated-test-import-key-32-bytes-long\n');
    const run = () => spawnSync('python3', ['-c', body, before, after, before, after], { encoding: 'utf8' });
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

test('deploy и rollback сохраняют system/user supervisor без запуска nohup', () => {
  const rollback = step('Roll back QA2 code and settings if deploy validation fails');
  for (const source of [validation, rollback]) {
    const cases = [...source.matchAll(/case "\$RESTART_MODE" in[\s\S]*?\n          esac/g)].map((match) => match[0]);
    assert.equal(cases.length, 2);
    for (const [index, body] of cases.entries()) {
      for (const mode of ['system', 'user']) {
        const result = spawnSync('bash', ['-eu', '-c', `systemctl() { echo SYSTEMCTL "$@"; }; sudo() { shift; shift; systemctl "$@"; }; nohup() { echo NOHUP_FORBIDDEN; return 90; }; ${body}`], { encoding: 'utf8', env: { ...process.env, RESTART_MODE: mode } });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, new RegExp(`SYSTEMCTL .*${index === 0 ? 'stop' : 'start'} urtruck-qa2.service`));
        assert.doesNotMatch(result.stdout, /NOHUP_FORBIDDEN/);
      }
      const invalid = spawnSync('bash', ['-eu', '-c', body], { encoding: 'utf8', env: { ...process.env, RESTART_MODE: 'unexpected' } });
      assert.notEqual(invalid.status, 0);
    }
  }
  const inspection = step('Record QA state and create code-only rollback backup');
  assert.ok(inspection.includes('RESTART_MODE=$restart_mode'));
  assert.ok(inspection.indexOf('QA2_RESTART_SUPERVISOR_UNSUPPORTED') < inspection.indexOf('cp -- "$qa_root/.env"'));
});

test('флаг и importer-настройка попадают в реальный backend/.env, остальные настройки сохраняются', () => {
  const enable = step('Enable external freight feed in isolated QA2 environment');
  const raw = enable.match(/<<'PYFEED'\n([\s\S]*?)\n          PYFEED/)[1].replace(/^ {10}/gm, '');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urtruck-runtime-env-'));
  try {
    const backend = path.join(dir, 'backend'); fs.mkdirSync(backend);
    const env = path.join(dir, '.env'), runtimeEnv = path.join(backend, '.env');
    fs.writeFileSync(env, 'TRANSCRIBE_PROVIDER=openai\nROOT_ONLY=keep\n');
    fs.writeFileSync(runtimeEnv, 'TRANSCRIBE_PROVIDER=local_ai\nRUNTIME_ONLY=keep\n');
    const body = raw.replace("Path('/home/ubuntu/urtruck-qa2')", `Path(${JSON.stringify(dir)}).resolve()`);
    const run = () => spawnSync('python3', ['-c', body, dir], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    const content = fs.readFileSync(runtimeEnv, 'utf8');
    assert.match(content, /TRANSCRIBE_PROVIDER=local_ai\nRUNTIME_ONLY=keep/);
    assert.match(fs.readFileSync(env, 'utf8'), /TRANSCRIBE_PROVIDER=openai\nROOT_ONLY=keep/);
    const key = content.split('\n').find(line => line.startsWith('EXTERNAL_FREIGHT_IMPORTER_KEY='));
    assert.ok(key.length > 60);
    assert.ok(fs.readFileSync(env, 'utf8').includes(key));
    assert.equal(fs.statSync(runtimeEnv).mode & 0o777, 0o600);
    assert.equal(run().status, 0);
    assert.equal(fs.readFileSync(runtimeEnv, 'utf8'), content);
    // Запускаем настоящий загрузчик env из main.py отдельно от приложения.
    const main = fs.readFileSync('backend/main.py', 'utf8');
    const loader = main.slice(main.indexOf('_env = Path('), main.indexOf('#', main.indexOf('os.environ.setdefault')));
    const loaded = spawnSync('python3', ['-c', `import os\nfrom pathlib import Path\n__file__=${JSON.stringify(path.join(backend, 'main.py'))}\n${loader}\nassert os.environ['EXTERNAL_FREIGHT_FEED_ENABLED']=='true'\nassert len(os.environ['EXTERNAL_FREIGHT_IMPORTER_KEY'])>=32\n`], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(loaded.status, 0, loaded.stderr);
    fs.appendFileSync(env, 'EXTERNAL_FREIGHT_IMPORTER_KEY=different-existing-test-key-32-bytes-long\n');
    const beforeConflict = fs.readFileSync(runtimeEnv, 'utf8');
    const conflict = run();
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /KEYS_MISMATCH/);
    assert.equal(fs.readFileSync(runtimeEnv, 'utf8'), beforeConflict);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rollback восстанавливает root и runtime env раздельно до запуска сервера', () => {
  const rollback = step('Roll back QA2 code and settings if deploy validation fails');
  const begin = rollback.indexOf('          cp -- "$ENV_BACKUP"');
  const end = rollback.indexOf('          cd "$qa_backend"', begin);
  const body = rollback.slice(begin, end);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urtruck-both-env-rollback-'));
  try {
    const qaRoot = path.join(dir, 'qa'), backend = path.join(qaRoot, 'backend'); fs.mkdirSync(backend, { recursive: true });
    const before = path.join(dir, 'root.snapshot'), beforeBackend = path.join(dir, 'backend.snapshot');
    fs.writeFileSync(before, 'ROOT_ONLY=keep\nTRANSCRIBE_PROVIDER=openai\n');
    fs.writeFileSync(beforeBackend, 'RUNTIME_ONLY=keep\nTRANSCRIBE_PROVIDER=local_ai\n');
    fs.writeFileSync(path.join(qaRoot, '.env'), 'EXTERNAL_FREIGHT_FEED_ENABLED=true\n');
    fs.writeFileSync(path.join(backend, '.env'), 'EXTERNAL_FREIGHT_FEED_ENABLED=true\n');
    const result = spawnSync('bash', ['-eu', '-c', body], { encoding: 'utf8', env: { ...process.env, qa_root: qaRoot, qa_backend: backend, ENV_BACKUP: before, BACKEND_ENV_BACKUP: beforeBackend } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(qaRoot, '.env'), 'utf8'), fs.readFileSync(before, 'utf8'));
    assert.equal(fs.readFileSync(path.join(backend, '.env'), 'utf8'), fs.readFileSync(beforeBackend, 'utf8'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
