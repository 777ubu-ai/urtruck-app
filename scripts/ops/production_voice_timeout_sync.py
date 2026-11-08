"""Передаёт только STT timeout scheduler; ключ и приложение не меняет."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time

import production_openai_key_rotation as rotation

SETTING = 'QA2_OPENAI_STT_TIMEOUT_SECONDS'
VALUE = '8'
NAME = 'urtruck-security-scheduler'


def stable(row):
    result = rotation.stable_process(row)
    if row['name'] == NAME:
        result['env'].pop(SETTING, None)
    return result


def patch_dump(data, before):
    rows = json.loads(data)
    selected = [r for r in rows if r.get('name') == NAME]
    if len(selected) != 1:
        raise ValueError('dump_scheduler_not_unique')
    row = selected[0]
    if any(row.get(k) != before['pm2_env'].get(k) for k in rotation.LAUNCH):
        raise ValueError('dump_scheduler_identity_changed')
    row.setdefault('env', {})[SETTING] = VALUE
    row[SETTING] = VALUE
    return (json.dumps(rows, ensure_ascii=False, indent=2) + '\n').encode()


def restart_timeout(before, value):
    current = rotation.processes()[NAME]
    if (not rotation.same_identity(current, before)
            or current['pm2_env']['env'].get(SETTING) != before['pm2_env']['env'].get(SETTING)):
        raise ValueError('scheduler_changed_before_rpc')
    script = """
const pm2 = require('/home/ubuntu/.nvm/versions/node/v22.15.0/lib/node_modules/pm2');
let input = '';
process.on('uncaughtException', () => process.exit(1));
process.stdin.setEncoding('utf8');
process.stdin.on('data', part => { input += part; });
process.stdin.on('end', () => {
  const value = JSON.parse(input);
  pm2.connect(error => {
    if (error) return process.exit(1);
    pm2.Client.executeRemote('restartProcessId', {
      id: value.id, env: { QA2_OPENAI_STT_TIMEOUT_SECONDS: value.timeout }
    }, error => {
      if (!error) pm2.Client.notifyGod('restart', value.id);
      pm2.disconnect(); process.exitCode = error ? 1 : 0;
    });
  });
});
"""
    subprocess.run(['/usr/bin/node', '-e', script],
                   input=json.dumps({'id': before['pm_id'], 'timeout': value}),
                   env={'HOME': '/home/ubuntu', 'PM2_HOME': '/home/ubuntu/.pm2', 'PATH': '/usr/bin:/bin'},
                   check=True, text=True, capture_output=True, timeout=40)


def verify(before):
    current = rotation.processes()
    for name in rotation.NAMES:
        if (stable(current[name]) != stable(before[name])
                or current[name]['pm2_env']['env'][rotation.KEY] != before[name]['pm2_env']['env'][rotation.KEY]):
            raise ValueError('protected_process_settings_changed')
    row = current[NAME]
    if row['pid'] == before[NAME]['pid'] or row['pm2_env']['env'].get(SETTING) != VALUE:
        raise ValueError('scheduler_timeout_not_active')
    env = dict(x.split('=', 1) for x in Path('/proc/' + str(row['pid']) + '/environ').read_text().split('\0') if '=' in x)
    if env.get(SETTING) != VALUE or rotation.runtime.status('/health') != 200:
        raise ValueError('scheduler_effective_timeout_not_verified')


def apply(run_id, source_sha):
    if not re.fullmatch('[0-9]+', run_id) or not re.fullmatch('[0-9a-f]{40}', source_sha):
        raise ValueError('invalid_release_identity')
    runtime = rotation.runtime
    if runtime.ROOT.resolve(strict=True) != runtime.ROOT or runtime.BACKUP_ROOT.resolve(strict=True) != runtime.BACKUP_ROOT:
        raise ValueError('unsafe_root')
    fd = os.open(runtime.BACKUP_ROOT / '.openai-key-rotation.lock', os.O_CREAT | os.O_NOFOLLOW | os.O_RDWR, 0o600)
    with os.fdopen(fd, 'r+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = rotation.processes()
        runtime.runtime_identity(allow_feed_env=True)
        old_timeout = before[NAME]['pm2_env']['env'].get(SETTING)
        if old_timeout not in (None, '', VALUE):
            raise ValueError('unexpected_scheduler_timeout')
        code = rotation.source_hashes()
        env_hash = runtime.digest(runtime.ROOT / '.env')
        files = rotation.DUMPS
        if any(p.resolve(strict=True) != p or not p.is_file() for p in files):
            raise ValueError('unsafe_pm2_dump')
        originals = {p: p.read_bytes() for p in files}
        updated = {p: patch_dump(originals[p], before[NAME]) for p in files}
        backup = runtime.BACKUP_ROOT / ('voice-timeout-' + run_id + '-' + str(time.time_ns()))
        backup.mkdir(mode=0o700)
        for i, p in enumerate(files):
            runtime.write_atomic(backup / ('dump-' + str(i)), originals[p])
        if (any(p.read_bytes() != originals[p] for p in files) or rotation.source_hashes() != code
                or runtime.digest(runtime.ROOT / '.env') != env_hash
                or not rotation.same_processes(rotation.processes(), before)):
            raise ValueError('production_changed_before_mutation')
        written = []
        attempted = False
        try:
            for path in files:
                if path.read_bytes() != originals[path]:
                    raise ValueError('dump_changed_before_write')
                runtime.write_atomic(path, updated[path]); written.append(path)
            attempted = True
            restart_timeout(before[NAME], VALUE)
            verify(before)
            if (rotation.source_hashes() != code or any(p.read_bytes() != updated[p] for p in files)
                    or runtime.digest(runtime.ROOT / '.env') != env_hash):
                raise ValueError('protected_state_changed')
            result = {'status': 'VOICE_WORKER_TIMEOUT_CONFIGURED', 'timeout_seconds': 8,
                      'controller_sha': source_sha, 'run_id': run_id,
                      'scheduler_effective_timeout_verified': True, 'openai_key_unchanged': True,
                      'models_unchanged': True, 'other_pm2_environment_unchanged': True,
                      'code_and_backend_env_unchanged': True, 'database_replacement_performed': False,
                      'catalog_import_performed': False}
            runtime.write_atomic(backup / 'result.json', json.dumps(result).encode())
            return result
        except BaseException:
            ok = True
            for path in reversed(written):
                if path.read_bytes() != updated[path]:
                    ok = False
                else:
                    runtime.write_atomic(path, originals[path])
            if attempted:
                try:
                    fresh = rotation.processes()[NAME]
                    if not rotation.same_identity(fresh, before[NAME]):
                        raise ValueError('foreign_scheduler_identity')
                    actual = fresh['pm2_env']['env'].get(SETTING)
                    if actual == VALUE:
                        # PM2 merge RPC не удаляет переменную. Пустая строка
                        # семантически равна исходному отсутствию: service
                        # отклоняет оба значения одним кодом до HTTP-запроса.
                        restore = old_timeout if old_timeout is not None else ''
                        restart_timeout(fresh, restore)
                        after = rotation.processes()[NAME]
                        if stable(after) != stable(fresh) or after['pm2_env']['env'].get(SETTING) != restore:
                            raise ValueError('timeout_rollback_not_verified')
                    elif actual != old_timeout:
                        raise ValueError('foreign_timeout_preserved')
                except BaseException:
                    ok = False
            raise ValueError('timeout_sync_failed_rollback_' + ('verified' if ok else 'failed')) from None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--source-sha', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(apply(args.run_id, args.source_sha)))
    except BaseException as error:
        safe = str(error) if isinstance(error, ValueError) and re.fullmatch('[a-z0-9_]+', str(error)) else 'timeout_sync_failed'
        print(json.dumps({'status': 'FAILED', 'error': safe}))
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
