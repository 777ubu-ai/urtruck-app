"""Репетиция оператора только на временных данных, без сети и systemd."""
import ast
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest


def sha(data):
    return hashlib.sha256(data).hexdigest()


def remote_script():
    tree = ast.parse(Path('scripts/qa/deploy_qa2_vehicle_window.py').read_text())
    return next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == 'remote' for t in n.targets))


def setup_fixture(tmp_path):
    root = tmp_path / 'qa2'
    backend = root / 'backend'
    for name in ('database', 'tests'):
        (backend / name).mkdir(parents=True)
    (root / 'runtime').mkdir()
    (root / 'backups').mkdir()
    baseline = '4195f888c444d04b532fe358c2f32c7d3c72e494'
    (backend / '.qa-source-sha').write_text(baseline)
    (backend / '.env').write_text('PUSH_OUTBOX_CUTOFF_ID=100\n')
    old = {'database/external_freight_dal.py': b'old dal', 'tests/test_external_freight_feed.py': b'old tests'}
    new = {'database/external_freight_dal.py': b'new dal', 'tests/test_external_freight_feed.py': b'new tests'}
    for path, content in old.items():
        (backend / path).write_bytes(content)
    (backend / 'other.py').write_bytes(b'unchanged')
    with sqlite3.connect(root / 'runtime/security.db') as db:
        db.execute('CREATE TABLE push_outbox(id INTEGER PRIMARY KEY, status TEXT)')
        db.execute("INSERT INTO push_outbox VALUES(5,'pending')")
    with sqlite3.connect(root / 'runtime/external-freight.sqlite3') as db:
        db.execute('CREATE TABLE external_freight_items(kind,status,source_published_at,expires_at)')
        published = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)
        db.execute("INSERT INTO external_freight_items VALUES('vehicle','active',?,?)", (published.isoformat(), (published + datetime.timedelta(days=30)).isoformat()))
    proc = tmp_path / 'proc/123'
    proc.mkdir(parents=True)
    (proc / 'environ').write_bytes(b'PUSH_OUTBOX_CUTOFF_ID=100\x00')
    bin_dir = tmp_path / 'bin'
    bin_dir.mkdir()
    (bin_dir / 'systemctl').write_text('#!/bin/sh\ncase "$1" in show) echo 123;; cat) echo fixed-unit;; esac\n')
    (bin_dir / 'sudo').write_text('#!/bin/sh\nexit 0\n')
    for f in bin_dir.iterdir(): f.chmod(0o755)
    src = remote_script().replace("Path('/home/ubuntu/urtruck-qa2')", f'Path({str(root)!r})')
    src = src.replace("Path('/proc',str(pid),'environ')", f"Path({str(tmp_path / 'proc')!r},str(pid),'environ')")
    src = src.replace('152de292a60f804de561650c98cfaefe9e1d3a5f9a28a12fe1ab758b2b19577b', sha(old['database/external_freight_dal.py']))
    src = src.replace('57213c3e77075b682bc09fce988f3c56ccd7f6224c507033f6c5044228e52dd1', sha(old['tests/test_external_freight_feed.py']))
    src = src.replace("p=json.load(sys.stdin);", "class Response:\n    status=200\n    def __enter__(self): return self\n    def __exit__(self,*args): pass\nurllib.request.urlopen=lambda *a,**k: Response()\np=json.load(sys.stdin);")
    payload = {'sha': 'a' * 40, 'run_id': '123', 'baseline': baseline,
               'manifest': {**{p: sha(v) for p, v in new.items()}, 'other.py': sha(b'unchanged')},
               'files': {p: base64.b64encode(v).decode() for p, v in new.items()}}
    return root, backend, bin_dir, src, payload, old, new


@pytest.mark.parametrize('mode', ['verify', 'deploy'])
def test_operator_snapshots_and_touches_only_candidate_files(tmp_path, mode):
    root, backend, bin_dir, src, payload, old, new = setup_fixture(tmp_path)
    payload['mode'] = mode
    result = subprocess.run([sys.executable, '-c', src], input=json.dumps(payload), text=True,
                            capture_output=True, env={**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH']}, timeout=20)
    assert result.returncode == 0, result.stderr
    for name in old:
        assert (backend / name).read_bytes() == (old if mode == 'verify' else new)[name]
    assert (backend / 'other.py').read_bytes() == b'unchanged'
    assert (backend / '.qa-source-sha').read_text().strip() == (payload['baseline'] if mode == 'verify' else payload['sha'])
    with sqlite3.connect(root / 'runtime/security.db') as db:
        assert db.execute('SELECT status FROM push_outbox WHERE id=5').fetchone()[0] == 'pending'
    backup = next((root / 'backups').iterdir())
    assert (backup / 'security.sqlite3').is_file()
    assert (backup / 'external-freight.sqlite3').is_file()


def test_operator_stops_before_writes_when_baseline_differs(tmp_path):
    root, backend, bin_dir, src, payload, old, _ = setup_fixture(tmp_path)
    (backend / 'other.py').write_bytes(b'unexpected')
    payload['mode'] = 'deploy'
    result = subprocess.run([sys.executable, '-c', src], input=json.dumps(payload), text=True,
                            capture_output=True, env={**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH']}, timeout=20)
    assert result.returncode != 0
    assert 'baseline_mismatch' in result.stderr
    for name in old: assert (backend / name).read_bytes() == old[name]
    assert not list((root / 'backups').iterdir())


def test_operator_restores_code_if_health_check_fails(tmp_path):
    root, backend, bin_dir, src, payload, old, _ = setup_fixture(tmp_path)
    src = src.replace('urllib.request.urlopen=lambda *a,**k: Response()',
                      "urllib.request.urlopen=lambda *a,**k: (_ for _ in ()).throw(OSError('offline'))")
    src = src.replace('for _ in range(90):', 'for _ in range(1):').replace('time.sleep(1)', 'time.sleep(0)')
    payload['mode'] = 'deploy'
    result = subprocess.run([sys.executable, '-c', src], input=json.dumps(payload), text=True,
                            capture_output=True, env={**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH']}, timeout=20)
    assert result.returncode != 0
    for name in old: assert (backend / name).read_bytes() == old[name]
    assert (backend / '.qa-source-sha').read_text().strip() == payload['baseline']
    with sqlite3.connect(root / 'runtime/security.db') as db:
        assert db.execute('SELECT status FROM push_outbox WHERE id=5').fetchone()[0] == 'pending'
    assert next((root / 'backups').iterdir()).is_dir()


def test_operator_stops_when_persisted_push_cutoff_differs(tmp_path):
    root, backend, bin_dir, src, payload, old, _ = setup_fixture(tmp_path)
    (backend / '.env').write_text('PUSH_OUTBOX_CUTOFF_ID=50\n')
    payload['mode'] = 'deploy'
    result = subprocess.run([sys.executable, '-c', src], input=json.dumps(payload), text=True,
                            capture_output=True, env={**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH']}, timeout=20)
    assert result.returncode != 0
    assert 'push_cutoff_config_mismatch' in result.stderr
    for name in old: assert (backend / name).read_bytes() == old[name]
    assert not list((root / 'backups').iterdir())


def test_operator_stops_if_existing_startup_would_reactivate_rows(tmp_path):
    root, backend, bin_dir, src, payload, old, _ = setup_fixture(tmp_path)
    with sqlite3.connect(root / 'runtime/external-freight.sqlite3') as db:
        db.execute("UPDATE external_freight_items SET status='expired'")
    payload['mode'] = 'deploy'
    result = subprocess.run([sys.executable, '-c', src], input=json.dumps(payload), text=True,
                            capture_output=True, env={**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH']}, timeout=20)
    assert result.returncode != 0
    assert 'startup_would_change_existing_feed_rows' in result.stderr
    for name in old: assert (backend / name).read_bytes() == old[name]
    assert next((root / 'backups').iterdir()).is_dir()
