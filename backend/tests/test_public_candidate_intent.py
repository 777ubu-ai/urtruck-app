"""Production guard проверяется до затратной сборки, без GitHub/секретов."""
import copy
import importlib.util
from pathlib import Path
import subprocess
import pytest

spec = importlib.util.spec_from_file_location('public_intent', Path(__file__).resolve().parents[2] / 'scripts/ops/verify_public_candidate_intent.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SHA = 'a' * 40
CONTEXT = {'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REPOSITORY': module.REPOSITORY,
           'GITHUB_REF_NAME': module.BRANCH, 'GITHUB_SHA': SHA}


@pytest.mark.parametrize('platform,counter', [('ios', '122'), ('ios', '125'), ('android', '215090228')])
def test_accepts_current_counter_in_exact_context(platform, counter):
    assert module.verify_context(CONTEXT, platform, counter) == SHA


@pytest.mark.parametrize('key,value', [('GITHUB_EVENT_NAME', 'push'), ('GITHUB_REPOSITORY', 'other/urtruck-app'),
                                      ('GITHUB_REF_NAME', 'qa2/integration-candidate'), ('GITHUB_SHA', 'bad')])
def test_rejects_wrong_execution_context(key, value):
    with pytest.raises(ValueError):
        module.verify_context({**CONTEXT, key: value}, 'ios', '122')


@pytest.mark.parametrize('platform,counter', [('ios', '121'), ('ios', '0121'), ('ios', '121;exit 0'),
                                           ('android', '214494478'), ('android', '215090227'),
                                           ('android', '2100000000'), ('android', '')])
def test_rejects_old_qa2_invalid_or_exhausted_counter(platform, counter):
    with pytest.raises(ValueError):
        module.verify_context(CONTEXT, platform, counter)


@pytest.mark.parametrize('changed', ['src/utils/chatAPI.js', 'app.config.js', 'backend/api/marketplace.py', '.github/workflows/testflight-rc.yml'])
def test_application_or_qa2_workflow_changes_cannot_hide_in_release_pr(changed):
    calls = []
    def execute(*args):
        calls.append(args)
        if args[1:3] == ('rev-parse', 'HEAD'):
            return SHA
        return changed if '--name-only' in args else ''
    with pytest.raises(ValueError, match='вне разрешённой'):
        module.verify_git(SHA, execute)
    assert not any('fetch' in call for call in calls)


def test_release_metadata_still_requires_clean_tree_and_identical_reviewed_merge():
    calls = []
    def execute(*args):
        calls.append(args)
        if args[1:3] == ('rev-parse', 'HEAD'):
            return SHA
        return '.github/workflows/testflight-local.yml' if '--name-only' in args else ''
    module.verify_git(SHA, execute)
    assert ('git', 'diff', '--exit-code', 'HEAD', '--') in calls
    assert ('git', 'merge-base', '--is-ancestor', module.SOURCE, SHA) in calls
    assert ('git', 'diff', '--quiet', module.SOURCE_HEAD, module.SOURCE, '--') in calls


def records():
    return {'source': {'state': 'closed', 'merged': True, 'merge_commit_sha': module.SOURCE,
                       'base': {'ref': 'qa2/integration-candidate'},
                       'head': {'sha': module.SOURCE_HEAD, 'repo': {'full_name': module.REPOSITORY}}},
            'release': {'state': 'open', 'merged': False, 'base': {'ref': 'qa2/integration-candidate'},
                        'head': {'sha': SHA, 'ref': module.BRANCH, 'repo': {'full_name': module.REPOSITORY}}},
            'checks': {'check_runs': [{'id': i + 1, 'name': name, 'conclusion': 'success'} for i, name in enumerate(module.CHECKS)]}}


def api(values):
    return lambda path: copy.deepcopy(values['source'] if path.endswith('/643') else
                                      values['release'] if path.endswith('/636') else values['checks'])


def test_merged_reviewed_source_and_current_open_release_pass():
    module.verify_reviews(SHA, api(records()))


@pytest.mark.parametrize('record,field,value', [('source', 'merged', False), ('source', 'merge_commit_sha', 'b' * 40),
                                             ('release', 'state', 'closed')])
def test_rejects_unmerged_source_wrong_merge_or_closed_unmerged_release(record, field, value):
    values = records()
    values[record][field] = value
    with pytest.raises(ValueError):
        module.verify_reviews(SHA, api(values))


def test_release_pr_sha_must_equal_actual_checkout():
    values = records()
    values['release']['head']['sha'] = 'b' * 40
    with pytest.raises(ValueError, match='release PR636'):
        module.verify_reviews(SHA, api(values))


@pytest.mark.parametrize('conclusion', ['failure', 'cancelled', None])
def test_newer_failed_or_pending_check_overrides_historical_pass(conclusion):
    values = records()
    values['checks']['check_runs'].append({'id': 99, 'name': module.CHECKS[0], 'conclusion': conclusion})
    with pytest.raises(ValueError, match='обязательный CI'):
        module.verify_reviews(SHA, api(values))


def test_missing_required_check_is_rejected():
    values = records()
    values['checks']['check_runs'].pop()
    with pytest.raises(ValueError, match='обязательный CI'):
        module.verify_reviews(SHA, api(values))


def test_production_android_counter_skips_previous_unfixed_candidate(tmp_path):
    text = (Path(__file__).resolve().parents[2] / '.github/workflows/deploy-play.yml').read_text()
    section = text.split('- name: Compute collision-resistant versionCode\n')[1]
    script = section.split('        run: |\n')[1].split('\n      - name:')[0]
    script = '\n'.join(line[10:] if line.startswith(' ' * 10) else line for line in script.splitlines())
    import os
    target = tmp_path / 'env'
    result = subprocess.run(['bash', '-c', script], env={**os.environ, 'GITHUB_REF_NAME': module.BRANCH,
                              'VERIFIED_PLAY_MAX_CODE': '215090228', 'GITHUB_ENV': str(target)}, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert target.read_text().strip() == 'URTRUCK_VERSION_CODE=215090230'


@pytest.mark.parametrize('field,value', [('API_ENVIRONMENT_INPUT', 'qa2'), ('TRACK_INPUT', 'internal'),
                                       ('RELEASE_STATUS_INPUT', 'completed'), ('SUBMIT_TO_PLAY_INPUT', 'true'),
                                       ('BUILD_APK_INPUT', 'false'), ('EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED', 'false')])
def test_new_production_lane_refuses_other_targets_and_automatic_submission(tmp_path, field, value):
    text = (Path(__file__).resolve().parents[2] / '.github/workflows/deploy-play.yml').read_text()
    section = text.split('- name: Prepare reviewed internal candidate identity\n')[1]
    script = section.split('        run: |\n')[1].split('\n      - name:')[0]
    script = '\n'.join(line[10:] if line.startswith(' ' * 10) else line for line in script.splitlines())
    import os
    target = tmp_path / 'env'
    environment = {**os.environ, **CONTEXT, 'API_ENVIRONMENT_INPUT': 'production', 'TRACK_INPUT': 'production',
                   'RELEASE_STATUS_INPUT': 'draft', 'SUBMIT_TO_PLAY_INPUT': 'false', 'BUILD_APK_INPUT': 'true',
                   'EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED': 'true', 'VERIFIED_PLAY_MAX_CODE': '215090228',
                   'GITHUB_ENV': str(target), field: value}
    result = subprocess.run(['bash', '-c', script], env=environment, cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode != 0
    assert not target.exists()
    assert 'verify_public_candidate_intent.py' not in result.stderr
