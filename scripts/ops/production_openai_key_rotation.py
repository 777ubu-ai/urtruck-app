"""Заменяет только production OpenAI credential через защищённый executor."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time
import urllib.error
import urllib.request

import external_feed_production_overlay as runtime

NAMES = ('urtruck-security-api', 'urtruck-security-scheduler')
KEY = 'OPENAI_API_KEY'
DUMPS = (Path('/home/ubuntu/.pm2/dump.pm2'), Path('/home/ubuntu/.pm2/dump.pm2.bak'))
LAUNCH = ('pm_cwd', 'pm_exec_path', 'args', 'exec_interpreter', 'exec_mode')


def read_key(path):
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) & 0o077 or info.st_size > 1024):
        raise ValueError('unsafe_secret_input')
    value = path.read_text().rstrip('\r\n')
    if not re.fullmatch(r'sk-[A-Za-z0-9_-]{20,1000}', value):
        raise ValueError('invalid_secret_format')
    return value


def without_key(env):
    return {k: v for k, v in env.items() if k != KEY}


def replace_env(data, key):
    lines = data.splitlines(keepends=True)
    selected = [i for i, line in enumerate(lines)
                if re.match(rb'^(?:export[ \t]+)?OPENAI_API_KEY[ \t]*=', line)]
    if len(selected) != 1:
        raise ValueError('environment_key_not_unique')
    lines[selected[0]] = (KEY + '=' + key + '\n').encode()
    return b''.join(lines)


def patch_dump(data, processes, key):
    rows = json.loads(data)
    if not isinstance(rows, list):
        raise ValueError('invalid_pm2_dump')
    for name in NAMES:
        selected = [row for row in rows if row.get('name') == name]
        if len(selected) != 1:
            raise ValueError('dump_process_not_unique')
        row = selected[0]
        live = processes[name]['pm2_env']
        if any(row.get(k) != live.get(k) for k in LAUNCH):
            raise ValueError('dump_process_identity_changed')
        if not isinstance(row.get('env'), dict) or KEY not in row['env'] or KEY not in row:
            raise ValueError('dump_key_missing')
        row[KEY] = key
        row['env'][KEY] = key
    return (json.dumps(rows, ensure_ascii=False, indent=2) + '\n').encode()


def provider_check(key):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    request = urllib.request.Request('https://api.openai.com/v1/models',
                                     headers={'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=25) as response:
            if response.status != 200:
                raise ValueError('provider_key_not_accepted')
    except urllib.error.HTTPError as error:
        raise ValueError('provider_http_' + str(error.code)) from None
    except (OSError, urllib.error.URLError):
        raise ValueError('provider_connection_failed') from None


def pm2(args, env=None):
    command_env = env or {'HOME': '/home/ubuntu', 'PM2_HOME': '/home/ubuntu/.pm2',
                          'PATH': '/usr/bin:/bin'}
    return subprocess.check_output(['/usr/bin/node', str(runtime.PM2_TARGET), *args],
                                   env=command_env, text=True, stderr=subprocess.PIPE, timeout=40)


def processes():
    runtime.verified_pm2_entry()
    rows = json.loads(pm2(['jlist']))
    result = {}
    for name in NAMES:
        selected = [row for row in rows if row.get('name') == name]
        if len(selected) != 1:
            raise ValueError('process_not_unique')
        row = selected[0]
        config = row['pm2_env']
        env = config.get('env', {})
        if (config.get('status') != 'online' or Path(config.get('pm_cwd', '')).resolve() != runtime.ROOT
                or Path('/proc/' + str(row.get('pid', 0)) + '/cwd').resolve(strict=True) != runtime.ROOT
                or Path(config.get('pm_exec_path', '')).resolve(strict=True)
                != Path('/proc/' + str(row['pid']) + '/exe').resolve(strict=True)
                or env.get('PM2_HOME') != '/home/ubuntu/.pm2'
                or not env.get(KEY) or config.get(KEY) != env[KEY]
                or not all(isinstance(v, str) for v in env.values())):
            raise ValueError('unexpected_production_process')
        result[name] = row
    return result


def source_hashes():
    proof = runtime.release_protected_hashes(runtime.ROOT)
    proof.pop('.env')
    for name in runtime.RELEASE_FILES:
        proof[name] = runtime.digest(runtime.ROOT / name)
    return proof


def stable_process(row):
    config = row['pm2_env']
    return {'pm_id': row['pm_id'], 'name': row['name'],
            'launch': {k: config.get(k) for k in LAUNCH},
            'env': without_key(config['env'])}


def same_processes(left, right):
    return all(stable_process(left[n]) == stable_process(right[n])
               and left[n]['pid'] == right[n]['pid']
               and left[n]['pm2_env']['env'][KEY] == right[n]['pm2_env']['env'][KEY]
               for n in NAMES)


def verify_processes(before, key, restarted):
    current = processes()
    for name in NAMES:
        row = current[name]
        if (stable_process(row) != stable_process(before[name])
                or row['pm2_env']['env'][KEY] != key
                or restarted and row['pid'] == before[name]['pid']):
            raise ValueError('process_configuration_not_preserved')
        values = dict(part.split('=', 1) for part in
                      Path('/proc/' + str(row['pid']) + '/environ').read_text().split('\0') if '=' in part)
        if values.get(KEY) != key:
            raise ValueError('process_secret_not_active')
    return current


def restart(before, keys):
    for name in NAMES:
        env = {**before[name]['pm2_env']['env'], KEY: keys[name]}
        pm2(['restart', str(before[name]['pm_id']), '--update-env'], env)
    for _ in range(30):
        try:
            env, _ = runtime.runtime_identity(allow_feed_env=True)
            if runtime.status('/health') == 200 and env[KEY] == keys[NAMES[0]]:
                return
        except (ValueError, OSError, subprocess.SubprocessError):
            pass
        time.sleep(1)
    raise ValueError('production_health_failed')


def apply(key, run_id, source_sha):
    if not re.fullmatch(r'[0-9]+', run_id) or not re.fullmatch(r'[0-9a-f]{40}', source_sha):
        raise ValueError('invalid_release_identity')
    if runtime.ROOT.resolve(strict=True) != runtime.ROOT or runtime.BACKUP_ROOT.resolve(strict=True) != runtime.BACKUP_ROOT:
        raise ValueError('unsafe_production_root')
    # Тот же executor сериализует production операции; lock защищает и повтор SSH.
    lock_path = runtime.BACKUP_ROOT / '.openai-key-rotation.lock'
    fd = os.open(lock_path, os.O_CREAT | os.O_NOFOLLOW | os.O_RDWR, 0o600)
    with os.fdopen(fd, 'r+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = processes()
        runtime.runtime_identity(allow_feed_env=True)
        code = source_hashes()
        files = (runtime.ROOT / '.env', *DUMPS)
        if any(p.is_symlink() or not p.is_file() for p in files):
            raise ValueError('unsafe_configuration_file')
        originals = {p: p.read_bytes() for p in files}
        updated = {files[0]: replace_env(originals[files[0]], key)}
        updated.update({p: patch_dump(originals[p], before, key) for p in DUMPS})
        provider_check(key)
        if (all(p.read_bytes() == updated[p] for p in files)
                and all(before[n]['pm2_env']['env'][KEY] == key for n in NAMES)):
            verify_processes(before, key, False)
            return {'status': 'OPENAI_KEY_ALREADY_ACTIVE', 'provider_http_status': 200}
        backup = runtime.BACKUP_ROOT / ('openai-key-rotation-' + run_id + '-' + str(time.time_ns()))
        backup.mkdir(mode=0o700)
        for i, p in enumerate(files):
            runtime.write_atomic(backup / ('configuration-' + str(i)), originals[p])
        runtime.write_atomic(backup / 'pm2-before.json', json.dumps(before).encode())
        # Отказ при чужом изменении до нашей первой записи не вызывает rollback.
        if source_hashes() != code or not same_processes(processes(), before) or any(p.read_bytes() != originals[p] for p in files):
            raise ValueError('production_changed_before_mutation')
        written = []
        attempted_restart = False
        try:
            for p in files:
                if p.read_bytes() != originals[p]:
                    raise ValueError('configuration_changed_before_write')
                runtime.write_atomic(p, updated[p])
                written.append(p)
            attempted_restart = True
            restart(before, {n: key for n in NAMES})
            verify_processes(before, key, True)
            if source_hashes() != code or any(p.read_bytes() != updated[p] for p in files):
                raise ValueError('protected_production_state_changed')
            result = {'status': 'OPENAI_KEY_ROTATED', 'provider_http_status': 200,
                      'controller_sha': source_sha, 'run_id': run_id,
                      'api_and_scheduler_key_active': True, 'pm2_credentials_persisted': True,
                      'other_process_settings_preserved': True, 'code_unchanged': True,
                      'database_replacement_performed': False, 'catalog_import_performed': False}
            runtime.write_atomic(backup / 'result.json', json.dumps(result).encode())
            return result
        except BaseException:
            rollback_ok = True
            for p in reversed(written):
                if p.read_bytes() != updated[p]:
                    rollback_ok = False
                    continue
                runtime.write_atomic(p, originals[p])
            if attempted_restart:
                try:
                    old_keys = {n: before[n]['pm2_env']['env'][KEY] for n in NAMES}
                    restart(before, old_keys)
                    current = processes()
                    for name in NAMES:
                        if (stable_process(current[name]) != stable_process(before[name])
                                or current[name]['pm2_env']['env'][KEY] != old_keys[name]):
                            rollback_ok = False
                except BaseException:
                    rollback_ok = False
            raise ValueError('rotation_failed_rollback_' + ('verified' if rollback_ok else 'failed')) from None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--key-file', type=Path, required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--source-sha', required=True)
    args = parser.parse_args()
    try:
        key = read_key(args.key_file)
        result = apply(key, args.run_id, args.source_sha)
        print(json.dumps(result))
    except BaseException as error:
        # Исключения subprocess/HTTP могут содержать секрет: печатаем только наши коды.
        safe = str(error) if isinstance(error, ValueError) and re.fullmatch(r'[a-z0-9_]+', str(error)) else 'rotation_preflight_failed'
        print(json.dumps({'status': 'FAILED', 'error': safe}))
        raise SystemExit(1) from None
    finally:
        if args.key_file.is_file() and not args.key_file.is_symlink():
            args.key_file.unlink()


if __name__ == '__main__':
    main()
