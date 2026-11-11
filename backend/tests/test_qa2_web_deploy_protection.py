"""QA2 Web deploy must pass the same protected reviewer gate as QA2 backend."""
from pathlib import Path
import os
import subprocess
import sys

import pytest


yaml = pytest.importorskip("yaml", reason="PyYAML is test-only")
ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "qa2-web-deploy.yml"


def test_qa2_web_deploy_is_manual_and_environment_protected():
    doc = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    triggers = doc.get(True, doc.get("on"))
    assert "workflow_dispatch" in triggers
    deploy = doc["jobs"]["deploy"]
    assert deploy["environment"]["name"] == "qa2"
    assert "DEPLOY_QA2_WEB" in str(deploy["steps"])


def test_qa2_web_deploy_pins_host_and_preserves_existing_nginx_config():
    source = WORKFLOW.read_text(encoding="utf-8")
    assert "secrets.SERVER_SSH_KNOWN_HOSTS" in source
    assert "StrictHostKeyChecking=yes" in source
    assert "UserKnownHostsFile=" in source
    assert "StrictHostKeyChecking=no" not in source
    assert "ssh-keyscan" not in source
    assert source.index("sudo nginx -t") < source.index('ln -sfn "$QA_WEB_ROOT/releases/$QA_SHA"')
    assert 'sudo cp -a "$site" "$backup"' in source
    assert 'sudo install -o root -g root' not in source
    assert "trap rollback" in source


@pytest.mark.parametrize("broken", [None, "/qa2/storage/", "/storage/", "/security/storage/"])
def test_qa2_storage_validation_rejects_missing_or_wrong_upstream(tmp_path, broken):
    doc = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    step = next(s for s in doc["jobs"]["deploy"]["steps"] if s.get("name") == "Route only QA2 web root to the static release")
    script = step["run"].split('python3 - "$site" <<\'PY\'\n', 1)[1].split('\nPY\n', 1)[0]
    routes = {'/qa2/storage/': '/storage/', '/storage/': '/storage/', '/security/storage/': '/security/storage/'}
    config = '\n'.join(f'location ^~ {path} {{ proxy_pass http://127.0.0.1:{8001 if path == broken else 8002}{upstream}; }}' for path, upstream in routes.items())
    target = tmp_path / 'site.conf'
    target.write_text(config, encoding='utf-8')
    proc = subprocess.run([sys.executable, '-', str(target)], input=script, text=True, capture_output=True)
    assert (proc.returncode == 0) is (broken is None)


@pytest.mark.parametrize('fail_health', [False, True])
def test_qa2_web_switch_preserves_config_and_rolls_back_on_error(tmp_path, fail_health):
    doc = yaml.safe_load(WORKFLOW.read_text(encoding='utf-8'))
    step = next(s for s in doc['jobs']['deploy']['steps'] if s.get('name') == 'Route only QA2 web root to the static release')
    script = step['run'].split("<<'REMOTE'\n", 1)[1].split('\nREMOTE\n', 1)[0]
    root = tmp_path / 'qa2'
    sha = 'a' * 40
    old = root / 'releases' / 'old'
    release = root / 'releases' / sha
    old.mkdir(parents=True)
    release.mkdir()
    (release / 'index.html').write_text('QA2', encoding='utf-8')
    (root / 'current').symlink_to(old)
    site = tmp_path / 'site.conf'
    site.write_text('server_name qa2.urtruck.kz;\nroot /home/ubuntu/urtruck-qa2-web/current;\nproxy_pass http://127.0.0.1:8002;\n' + '\n'.join(
        f'location ^~ {p} {{ proxy_pass http://127.0.0.1:8002{up}; }}'
        for p, up in (('/qa2/storage/', '/storage/'), ('/storage/', '/storage/'), ('/security/storage/', '/security/storage/'))), encoding='utf-8')
    before = site.read_bytes()
    script = script.replace('site=/etc/nginx/sites-available/urtruck-qa2', f'site={site}')
    bin_dir = tmp_path / 'bin'
    bin_dir.mkdir()
    for name, body in {'sudo': 'exec "$@"', 'nginx': 'exit 0', 'curl': 'if [ "$FAIL_HEALTH" = 1 ]; then exit 7; fi\nprintf "{\\"commit\\":\\"%s\\"}" "$QA_SHA"'}.items():
        f = bin_dir / name
        f.write_text('#!/bin/sh\n' + body + '\n', encoding='utf-8')
        f.chmod(0o755)
    env = {**os.environ, 'PATH': str(bin_dir) + os.pathsep + os.environ['PATH'], 'QA_WEB_ROOT': str(root), 'QA_SHA': sha, 'FAIL_HEALTH': str(int(fail_health))}
    proc = subprocess.run(['bash', '-c', script], env=env, text=True, capture_output=True)
    assert (proc.returncode != 0) is fail_health
    assert (root / 'current').resolve() == (old if fail_health else release)
    assert site.read_bytes() == before
