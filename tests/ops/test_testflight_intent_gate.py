"""Непроверенный исходник не исполняется с учётными данными TestFlight."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github/workflows/testflight-rc.yml'


def job():
    return yaml.safe_load(WORKFLOW.read_text())['jobs']['build-and-upload']


def test_credentials_are_not_given_to_candidate_checkout_or_install():
    data = job()
    for name in ['EXPO_TOKEN', 'YANDEX_ROUTER_API_KEY', 'OPENROUTESERVICE_API_KEY', 'GH_TOKEN',
                 'EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY', 'EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY']:
        assert name not in data.get('env', {})
    checkout = next(x for x in data['steps'] if x.get('uses') == 'actions/checkout@v4')
    assert checkout['with']['persist-credentials'] is False
    for step in data['steps']:
        if 'EXPO_TOKEN' in step.get('env', {}):
            assert step['name'] in {'Verify TestFlight account', 'Build signed QA2 IPA locally',
                                    'Submit QA2 IPA to TestFlight'}


def test_guard_precedes_all_candidate_execution():
    steps = job()['steps']
    names = [x.get('name') for x in steps]
    guard = names.index('Verify protected QA2 TestFlight intent')
    for name in ['Install dependencies', 'Apply reviewed native dependency patches',
                 'Verify TestFlight account', 'Verify resolved Expo QA2 configuration',
                 'Build signed QA2 IPA locally', 'Submit QA2 IPA to TestFlight']:
        assert names.index(name) > guard
    install = next(x for x in steps if x.get('name') == 'Install dependencies')
    assert install['run'] == 'npm ci --ignore-scripts'
    script = steps[guard]['run']
    assert 'npx ' not in script and 'npm ' not in script


@pytest.mark.parametrize('change,valid', [({}, True), ({'CONFIRMATION': 'wrong'}, False),
    ({'GITHUB_REF_NAME': 'other'}, False), ({'QA_SOURCE_SHA': 'not-a-sha'}, False),
    ({'SYNTHETIC_PR_HEAD': 'b' * 40}, False), ({'SYNTHETIC_CHECK': 'failure'}, False)])
def test_actual_guard_stops_install_for_wrong_intent_source_or_ci(tmp_path, change, valid):
    binary = tmp_path / 'bin'
    binary.mkdir()
    gh = binary / 'gh'
    gh.write_text(f'#!{sys.executable}\n' + '''import os,sys,json
args=sys.argv
if '.state' in args: print('open')
elif '.head.sha' in args: print(os.environ.get('SYNTHETIC_PR_HEAD',os.environ['QA_SOURCE_SHA']))
else: print(json.dumps({'check_runs':[{'name':name,'conclusion':os.environ.get('SYNTHETIC_CHECK','success')} for name in ['quality-gate / Backend tests','quality-gate / Frontend tests, lint, and build','quality-gate / Mandatory web E2E subset']]}))
''')
    for name, body in {'git': '#!/bin/bash\nprintf "%s\\n" "$QA_SOURCE_SHA"\n',
                       'curl': '#!/bin/bash\nexit 0\n',
                       'npm': '#!/bin/bash\ntouch npm-invoked\n'}.items():
        (binary / name).write_text(body)
    for path in binary.iterdir():
        path.chmod(0o700)
    env = {**os.environ, 'PATH': str(binary) + ':' + os.environ['PATH'],
           'CONFIRMATION': 'BUILD_QA2_TESTFLIGHT', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
           'GITHUB_REF_NAME': 'main', 'GITHUB_REPOSITORY': 'synthetic/repo',
           'QA_SOURCE_SHA': 'a' * 40, 'QA2_API_URL': 'https://qa2.urtruck.kz', **change}
    selected = {'Verify protected QA2 TestFlight intent', 'Install dependencies'}
    result = None
    for step in job()['steps']:
        if step.get('name') in selected:
            result = subprocess.run(['bash', '-c', step['run']], cwd=tmp_path,
                                    env=env, capture_output=True, text=True)
            if result.returncode:
                break
    assert (result.returncode == 0) == valid
    assert (tmp_path / 'npm-invoked').exists() == valid


def test_actual_install_disables_untrusted_lifecycle_hook(tmp_path):
    npm = shutil.which('npm')
    assert npm
    package = {'name': 'synthetic-intent-fixture', 'version': '1.0.0', 'scripts': {
        'preinstall': 'node -e "require(\'fs\').writeFileSync(\'untrusted-hook-ran\',\'bad\')"'}}
    (tmp_path / 'package.json').write_text(json.dumps(package))
    lock = {'name': package['name'], 'version': package['version'], 'lockfileVersion': 3,
            'requires': True, 'packages': {'': {'name': package['name'], 'version': package['version'],
                                               'hasInstallScript': True}}}
    (tmp_path / 'package-lock.json').write_text(json.dumps(lock))
    script = next(x['run'] for x in job()['steps'] if x.get('name') == 'Install dependencies')
    result = subprocess.run(['bash', '-c', script], cwd=tmp_path, env={**os.environ,
        'npm_config_audit': 'false', 'npm_config_fund': 'false'}, capture_output=True, timeout=30)
    assert result.returncode == 0
    assert not (tmp_path / 'untrusted-hook-ran').exists()
