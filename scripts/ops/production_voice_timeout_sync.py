"""Задаёт отсутствующий STT timeout; секреты и PM2 env не изменяет."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import time

import production_openai_key_rotation as rotation

SETTING = 'QA2_OPENAI_STT_TIMEOUT_SECONDS'
VALUE = '8'


def patch_timeout(data):
    lines = data.splitlines(keepends=True)
    indexes = [i for i, line in enumerate(lines)
               if re.match(rb'^(?:export[ \t]+)?QA2_OPENAI_STT_TIMEOUT_SECONDS[ \t]*=', line)]
    if len(indexes) > 1:
        raise ValueError('timeout_setting_ambiguous')
    replacement = (SETTING + '=' + VALUE + '\n').encode()
    if indexes:
        lines[indexes[0]] = replacement
    else:
        if lines and not lines[-1].endswith(b'\n'):
            lines.append(b'\n')
        lines.append(replacement)
    return b''.join(lines)


def check_override(rows):
    for name in rotation.NAMES:
        if rows[name]['pm2_env']['env'].get(SETTING) not in (None, VALUE):
            raise ValueError('incompatible_pm2_timeout_override')


def restart(before):
    for name in rotation.NAMES:
        current = rotation.processes()[name]
        if not rotation.same_identity(current, before[name]):
            raise ValueError('process_identity_changed')
        # Без --update-env: никакие переменные вызывающего процесса не передаются.
        rotation.pm2(['restart', str(before[name]['pm_id'])])
    api = before[rotation.NAMES[0]]
    rotation.runtime.wait_healthy({'pm_id': str(api['pm_id']),
                                  'pm_exec_path': api['pm2_env']['pm_exec_path'],
                                  '_pid': str(api['pid'])}, require_new_pid=True)


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
        check_override(before)
        code = rotation.source_hashes()
        path = runtime.ROOT / '.env'
        if path.resolve(strict=True) != path or not path.is_file():
            raise ValueError('unsafe_environment')
        original = path.read_bytes()
        updated = patch_timeout(original)
        backup = runtime.BACKUP_ROOT / ('voice-timeout-' + run_id + '-' + str(time.time_ns()))
        backup.mkdir(mode=0o700)
        runtime.write_atomic(backup / 'backend.env', original)
        if (path.read_bytes() != original or rotation.source_hashes() != code
                or not rotation.same_processes(rotation.processes(), before)):
            raise ValueError('production_changed_before_mutation')
        wrote = False
        try:
            runtime.write_atomic(path, updated)
            wrote = True
            restart(before)
            after = rotation.processes()
            if (any(rotation.stable_process(after[n]) != rotation.stable_process(before[n])
                    or after[n]['pm2_env']['env'][rotation.KEY] != before[n]['pm2_env']['env'][rotation.KEY]
                    or after[n]['pid'] == before[n]['pid'] for n in rotation.NAMES)
                    or rotation.source_hashes() != code or path.read_bytes() != updated):
                raise ValueError('protected_configuration_changed')
            result = {'status': 'VOICE_WORKER_TIMEOUT_CONFIGURED', 'timeout_seconds': 8,
                      'controller_sha': source_sha, 'run_id': run_id,
                      'openai_key_unchanged': True, 'models_unchanged': True,
                      'pm2_environment_unchanged': True, 'code_unchanged': True,
                      'database_replacement_performed': False, 'catalog_import_performed': False}
            runtime.write_atomic(backup / 'result.json', json.dumps(result).encode())
            return result
        except BaseException:
            ok = True
            if wrote:
                if path.read_bytes() != updated:
                    ok = False
                else:
                    runtime.write_atomic(path, original)
            try:
                fresh = rotation.processes()
                if not all(rotation.same_identity(fresh[n], before[n]) for n in rotation.NAMES):
                    raise ValueError('foreign_process_identity')
                restart(fresh)
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
