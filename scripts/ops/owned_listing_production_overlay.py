"""Узкая выкладка четырёх файлов и адресная коррекция без замены живой БД."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import time
import urllib.request

import external_feed_production_overlay as legacy
import owned_listing_recovery as recovery
import runtime_release_manifest as runtime

ROOT = legacy.ROOT
BACKUPS = legacy.BACKUP_ROOT
DATABASE = Path('/home/ubuntu/urtruck/runtime/security.db')
FILES = frozenset({'api/marketplace.py', 'services/bid_expiry.py',
                   'database/db.py', 'scheduler/jobs.py'})


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def release_manifests(manifest, source_sha):
    require(manifest.get('schema') == 1 and manifest.get('operation') == 'owned_history_auto_renew_v1',
            'owned_manifest_invalid')
    require(manifest.get('production_root') == str(ROOT)
            and manifest.get('primary_database') == str(DATABASE), 'owned_environment_mismatch')
    require(all(manifest.get(k) is False for k in ('full_runtime_promotion', 'environment_changes',
                'database_replacement', 'store_release')), 'owned_scope_expanded')
    before, changed = manifest.get('baseline_files'), manifest.get('files')
    require(isinstance(before, dict) and len(before) == 183 and isinstance(changed, dict)
            and set(changed) == FILES and FILES <= set(before), 'owned_file_allowlist_invalid')
    for name, value in {**before, **changed}.items():
        require(runtime.runtime_path(name) and str(Path(name)) == name
                and isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value), 'owned_hash_invalid')
    baseline_sha = manifest.get('reconstructed_baseline_sha', '')
    require(re.fullmatch('[0-9a-f]{40}', baseline_sha) and re.fullmatch('[0-9a-f]{40}', source_sha),
            'owned_source_identity_invalid')
    old = {'schema': 1, 'source_sha': baseline_sha, 'environment': 'production', 'files': before}
    new = {'schema': 1, 'source_sha': source_sha, 'environment': 'production', 'files': {**before, **changed}}
    require(manifest.get('candidate_manifest') == new, 'owned_candidate_not_bound_to_source')
    return old, new


def unpack(bundle, bundle_sha, destination, source_sha):
    require(re.fullmatch('[0-9a-f]{64}', bundle_sha) is not None
            and legacy.digest(bundle) == bundle_sha, 'owned_bundle_hash_mismatch')
    with tarfile.open(bundle, 'r:gz') as archive:
        members = archive.getmembers()
        require(len(members) == 5 and {m.name for m in members} == FILES | {'manifest.json'},
                'owned_bundle_members_invalid')
        require(all(m.isfile() and 0 <= m.size <= 400_000 for m in members), 'owned_bundle_type_invalid')
        manifest = json.load(archive.extractfile('manifest.json'))
        release_manifests(manifest, source_sha)
        for item in members:
            legacy.write_atomic(destination / item.name, archive.extractfile(item).read())
    for name in FILES:
        require(legacy.digest(destination / name) == manifest['files'][name], 'owned_payload_hash_mismatch')
        compile((destination / name).read_bytes(), name, 'exec')
    return manifest


def verify_state(manifest, source_sha):
    before, after = release_manifests(manifest, source_sha)
    runtime.verify_transition(before, after, 'production', ROOT)
    actual = {name: runtime.digest(runtime.safe_file(ROOT, name)) for name in runtime.runtime_inventory(ROOT)}
    if actual == before['files']:
        return 'before'
    if actual == after['files']:
        return 'after'
    raise ValueError('owned_runtime_drift_before_write')


def private_backup_file(path):
    path = Path(path)
    require(path.is_absolute() and BACKUPS.resolve() == BACKUPS
            and path.resolve() == path and path.is_file()
            and path.is_relative_to(BACKUPS), 'owned_private_path_invalid')
    require(path.stat().st_mode & 0o077 == 0, 'owned_private_file_permissions')
    return path


def full_backup_proof(path):
    require(path is not None, 'owned_fresh_full_backup_proof_required')
    path = private_backup_file(path)
    data = json.loads(path.read_text())
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(data['utc'])).total_seconds()
    require(data.get('environment') == 'production' and 0 <= age <= 1800
            and data.get('database_integrity') == 'ok'
            and data.get('live_overwritten') is False
            and all(data.get(k) is True for k in ('database_copy_identical', 'backend_copy_identical',
                    'config_copy_identical', 'local_storage_copy_identical', 'cloud_hashes_match',
                    'cloud_snapshot_stable'))
            and data.get('cloud_objects_restored', 0) > 0, 'owned_full_backup_not_verified_or_stale')
    return {'proof': str(path), 'sha256': legacy.digest(path), 'age_seconds': int(age)}


def private_allowlist(manifest):
    path = private_backup_file(manifest.get('recovery_allowlist_path', ''))
    require(legacy.digest(path) == manifest.get('recovery_allowlist_sha256'), 'owned_allowlist_identity_changed')
    rows = json.loads(path.read_text())
    counts = {table: sum(r.get('table') == table for r in rows) for table in ('cargos', 'trips')}
    require(counts == manifest.get('expected_recovery_counts') == {'cargos': 1, 'trips': 1}
            and len(rows) == 2, 'owned_recovery_scope_changed')
    return path


def rehearsal(database, allowlist, folder):
    folder.mkdir(mode=0o700)
    copy = folder / 'rehearsal.sqlite3'
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as source, sqlite3.connect(copy) as target:
        source.backup(target)
    audits = folder / 'audit'
    audits.mkdir(mode=0o700)
    first = recovery.recover(copy, allowlist, audits, apply=True)
    again = recovery.recover(copy, allowlist, audits, apply=True)
    require(sum(first['applied'].values()) + first['already_matching'] == 2
            and sum(again['applied'].values()) == 0 and again['already_matching'] == 2,
            'owned_rehearsal_not_idempotent')
    return {'applied_on_copy': first['applied'], 'repeat_new_changes': 0}


def scheduler_record(pm2, command_env):
    items = json.loads(subprocess.check_output([str(pm2), 'jlist'], env=command_env, text=True))
    found = [x for x in items if x.get('name') == 'urtruck-security-scheduler']
    require(len(found) == 1, 'owned_scheduler_not_unique')
    return found[0]


def process(pm2, command_env, action, identity):
    subprocess.run([str(pm2), action, identity], env=command_env, check=True, capture_output=True)


def stop_pair(pm2, command_env, env, scheduler_id):
    # Даже частичный stop учитывается вызывающим кодом до первой записи.
    process(pm2, command_env, 'stop', scheduler_id)
    process(pm2, command_env, 'stop', env['pm_id'])
    runtime.verify_stopped_pm2(ROOT, 'urtruck-security-api')
    runtime.verify_stopped_pm2(ROOT, 'urtruck-security-scheduler')
    listener = subprocess.check_output(['ss', '-ltnpH', 'sport = :8001'], text=True)
    require(not listener.strip(), 'owned_listener_not_stopped')


def start_pair(pm2, command_env, env, scheduler_id, old_scheduler_pid):
    # Оба restart пробуются даже при отказе одного процесса.
    failures = []
    for identity in (env['pm_id'], scheduler_id):
        try:
            process(pm2, command_env, 'restart', identity)
        except subprocess.SubprocessError as error:
            failures.append(type(error).__name__)
    require(not failures, 'owned_pair_restart_failed')
    wait_ready(env, scheduler_id, old_scheduler_pid, pm2, command_env)


def public_recovery_smoke(allowlist):
    # Анонимная общая выдача не получает токены или приватные сведения.
    entries = json.loads(allowlist.read_text())
    totals = {}
    for table in ('cargos', 'trips'):
        seen, offset = set(), 0
        while True:
            require(offset <= 100_000, 'owned_public_pagination_unbounded')
            url = 'http://127.0.0.1:8001/api/v1/market/' + table + '?limit=100&offset=' + str(offset)
            with urllib.request.urlopen(url, timeout=15) as response:
                require(response.status == 200, 'owned_public_api_failed')
                data = json.load(response)
            rows = data.get(table)
            require(isinstance(rows, list), 'owned_public_api_shape')
            ids = [row['id'] for row in rows]
            require(len(set(ids)) == len(ids) and not seen.intersection(ids), 'owned_public_duplicate')
            seen.update(ids)
            following = data.get('next_offset')
            if following is None:
                break
            require(isinstance(following, int) and following > offset, 'owned_public_offset_invalid')
            offset = following
        require(all(row['id'] in seen for row in entries if row['table'] == table),
                'owned_restored_record_not_public')
        totals[table] = len(seen)
    return totals


def wait_ready(expected, scheduler_id, old_scheduler_pid, pm2, command_env):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        try:
            current, _ = legacy.runtime_identity(allow_feed_env=True)
            scheduler = scheduler_record(pm2, command_env)
            require(current['pm_id'] == expected['pm_id'] and current['_pid'] != expected['_pid']
                    and current['DB_PATH'] == expected['DB_PATH']
                    and current['pm_exec_path'] == expected['pm_exec_path'], 'owned_api_identity_changed')
            require(str(scheduler['pm_id']) == scheduler_id and scheduler.get('pid', 0) > 0
                    and scheduler['pid'] != old_scheduler_pid, 'owned_scheduler_not_restarted')
            legacy.release_scheduler(current, pm2, command_env)
            if legacy.status('/health') == 200:
                return
        except (ValueError, OSError, subprocess.SubprocessError):
            pass
        time.sleep(2)
    raise ValueError('owned_api_or_scheduler_not_ready')


def rollback_code(manifest, source_sha, originals):
    before, after = release_manifests(manifest, source_sha)
    # Сначала проверяется весь заменяемый набор: чужие файлы не перезаписываются.
    for name in FILES:
        actual = runtime.digest(runtime.safe_file(ROOT, name))
        require(actual in {before['files'][name], after['files'][name]}, 'owned_rollback_foreign_code')
    for name in FILES:
        legacy.write_atomic(runtime.safe_destination(ROOT, name), originals[name], 0o644)
    runtime.verify(ROOT, before, 'production')
    try:
        legacy.write_atomic(ROOT / '.urtruck-runtime-manifest.json', json.dumps(before, indent=2).encode())
    except OSError:
        # Код уже полностью сверен: metadata-ошибка не оставляет его остановленным.
        print('owned_rollback_manifest_unwritable; исходные 183 файла проверены')


def execute(staged, manifest, source_sha, mode, proof_path=None):
    require(mode in {'preflight', 'apply'}, 'owned_mode_invalid')
    state = verify_state(manifest, source_sha)
    allowlist = private_allowlist(manifest)
    proof = full_backup_proof(proof_path) if mode == 'apply' else None
    env, pm2 = legacy.runtime_identity(allow_feed_env=True)
    require(Path(env['DB_PATH']) == DATABASE and DATABASE.is_file() and not DATABASE.is_symlink()
            and DATABASE.resolve() == DATABASE, 'owned_database_identity_invalid')
    command_env = dict(os.environ)
    command_env['PATH'] = str(pm2.parent) + ':' + command_env.get('PATH', '')
    command_env['PM2_HOME'] = env['PM2_HOME']
    scheduler_id = legacy.release_scheduler(env, pm2, command_env)
    old_scheduler_pid = scheduler_record(pm2, command_env)['pid']
    require(shutil.disk_usage(BACKUPS).free >= DATABASE.stat().st_size * 4 + 256 * 1024 * 1024,
            'owned_backup_space_insufficient')
    folder = BACKUPS / ('owned-listings-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    folder.mkdir(mode=0o700)
    originals = {name: runtime.safe_file(ROOT, name).read_bytes() for name in FILES}
    env_hash = legacy.digest(ROOT / '.env')
    for name, data in originals.items():
        legacy.write_atomic(folder / 'code' / name, data)
    legacy.write_atomic(folder / 'backend.env', (ROOT / '.env').read_bytes())
    legacy.write_atomic(folder / 'runtime-env-private.json', json.dumps(env).encode())
    backup = legacy.online_backup(DATABASE, folder / 'primary.sqlite3')
    for name in ('primary.sqlite3', 'restore-probe.sqlite3'):
        with sqlite3.connect((folder / name).as_uri() + '?mode=ro', uri=True) as connection:
            require(connection.execute('PRAGMA integrity_check').fetchall() == [('ok',)],
                    'owned_restore_integrity_failed')
    rehearsed = rehearsal(folder / 'restore-probe.sqlite3', allowlist, folder / 'rehearsal')
    require(verify_state(manifest, source_sha) == state and legacy.digest(ROOT / '.env') == env_hash,
            'owned_drift_during_backup')
    report = {'source_sha': source_sha, 'operation': 'owned_history_auto_renew_v1',
              'mode': mode, 'backup': backup, 'rehearsal': rehearsed, 'full_backup': proof,
              'runtime_files': 183, 'changed_files': 4, 'live_code_changed': False,
              'live_database_replaced': False, 'store_release': False}
    if mode == 'preflight':
        report['status'] = 'PREFLIGHT_ONLY'
    else:
        before, after = release_manifests(manifest, source_sha)
        stop_started = False
        changed = False
        try:
            # Повторный запуск тоже перезагружает оба процесса: байты на диске
            # сами по себе не доказывают, что старый scheduler выгружен из памяти.
            stop_started = True
            stop_pair(pm2, command_env, env, scheduler_id)
            require(verify_state(manifest, source_sha) == state
                    and legacy.digest(ROOT / '.env') == env_hash, 'owned_drift_after_stop')
            if state == 'before':
                changed = True
                for name in FILES:
                    legacy.write_atomic(runtime.safe_destination(ROOT, name), (staged / name).read_bytes(), 0o644)
            start_pair(pm2, command_env, env, scheduler_id, old_scheduler_pid)
            runtime.verify(ROOT, after, 'production', source_sha)
            require(legacy.digest(ROOT / '.env') == env_hash and legacy.status('/health') == 200,
                    'owned_config_or_health_changed')
            legacy.write_atomic(ROOT / '.urtruck-runtime-manifest.json', json.dumps(after, indent=2).encode())
            report['live_code_changed'] = state == 'before'
        except BaseException:
            report['status'] = 'CODE_PHASE_FAILED'
            try:
                if changed:
                    stop_pair(pm2, command_env, env, scheduler_id)
                    rollback_code(manifest, source_sha, originals)
                if stop_started:
                    # Не запускаем неизвестный код или конфигурацию даже ради
                    # автоматического восстановления доступности.
                    verify_state(manifest, source_sha)
                    require(legacy.digest(ROOT / '.env') == env_hash, 'owned_recovery_config_drift')
                    start_pair(pm2, command_env, env, scheduler_id, old_scheduler_pid)
            finally:
                # Нехватка места для отчёта не должна отменять rollback/restart.
                try:
                    legacy.write_atomic(folder / 'result.json', json.dumps(report, indent=2).encode())
                except OSError:
                    print('owned_failure_receipt_unwritable; проверить закрытый backup: ' + str(folder))
            raise
        # Истёкшие строки — отдельная транзакция после готовности обоих процессов.
        audits = folder / 'live-recovery'
        audits.mkdir(mode=0o700)
        try:
            restored = recovery.recover(DATABASE, allowlist, audits, apply=True)
            # При отказе post-smoke сохраняем audit и здоровый исправленный код.
            # Старую БД не подставляем; отдельная guarded-компенсация требует
            # неизменённого postimage и связей, а не слепого возврата snapshot.
            report['recovery_audit'] = restored['audit']
            report['public_counts'] = public_recovery_smoke(allowlist)
            runtime.verify(ROOT, after, 'production', source_sha)
            require(legacy.status('/health') == 200, 'owned_post_recovery_health_failed')
            report.update(status='APPLIED', restored=restored['applied'], already_matching=restored['already_matching'])
        except BaseException:
            report.update(status='CODE_ACTIVE_RECOVERY_REQUIRES_INSPECTION', restored=None)
            legacy.write_atomic(folder / 'result.json', json.dumps(report, indent=2).encode())
            raise
    legacy.write_atomic(folder / 'result.json', json.dumps(report, ensure_ascii=False, indent=2).encode())
    print(json.dumps({**report, 'evidence': str(folder)}, ensure_ascii=False))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--bundle-sha256', required=True)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--mode', choices=['preflight', 'apply'], default='preflight')
    parser.add_argument('--backup-proof', type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    with Path('/home/ubuntu/urtruck/runtime/.external-feed-deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with tempfile.TemporaryDirectory(prefix='owned-overlay-') as directory:
            staged = Path(directory)
            manifest = unpack(args.bundle, args.bundle_sha256, staged, args.source_sha)
            execute(staged, manifest, args.source_sha, args.mode, args.backup_proof)


if __name__ == '__main__':
    main()
