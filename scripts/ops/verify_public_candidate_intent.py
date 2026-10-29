"""Ограничивает production-сборки проверенным исходником и отдельным release PR."""
import argparse
import json
import os
import re
import subprocess

SOURCE = '6aa6badf3ddfd8d124268c8cecf7c5e202c0baca'
SOURCE_HEAD = '6bb350e76f145c7865c9d0fe3efe68da3a6bb5ae'
REPOSITORY = '777ubu-ai/urtruck-app'
BRANCH = 'ops/public-store-preflight-20261028'
ALLOWED = {
    '.github/keys/device-qa-apk-encryption.pub',
    '.github/workflows/testflight-local.yml', '.github/workflows/deploy-play.yml',
    'scripts/ops/inspect_play_store.py', 'scripts/ops/verify_public_candidate_intent.py',
    'backend/tests/test_play_store_snapshot.py', 'backend/tests/test_public_candidate_intent.py',
    'tests/frontend/test_play_internal_sequential_version.mjs',
    'tests/frontend/test_play_release_inputs.mjs',
    'docs/release/public-store-preflight-20261028.md',
    'docs/release/public-store-candidate-20261028.md',
}
CHECKS = ('quality-gate / Backend tests', 'quality-gate / Frontend tests, lint, and build',
          'quality-gate / Mandatory web E2E subset')


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def verify_context(environment, platform, counter):
    expected = {'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REPOSITORY': REPOSITORY,
                'GITHUB_REF_NAME': BRANCH}
    if any(environment.get(key) != value for key, value in expected.items()):
        raise ValueError('Неверный контекст production-сборки')
    sha = environment.get('GITHUB_SHA', '')
    if not re.fullmatch('[0-9a-f]{40}', sha):
        raise ValueError('Неверный release SHA')
    if not re.fullmatch('[1-9][0-9]{0,9}', counter):
        raise ValueError('Неверный проверенный магазинный номер')
    floor, ceiling = (122, 999999999) if platform == 'ios' else (215090228, 2099999999)
    if platform not in ('ios', 'android') or not floor <= int(counter) < ceiling:
        raise ValueError('Проверенный магазинный номер вне диапазона')
    return sha


def verify_git(sha, execute=command):
    if execute('git', 'rev-parse', 'HEAD') != sha:
        raise ValueError('Release SHA не совпадает с checkout')
    execute('git', 'diff', '--exit-code', 'HEAD', '--')
    execute('git', 'merge-base', '--is-ancestor', SOURCE, sha)
    changes = set(execute('git', 'diff', '--name-only', SOURCE, sha, '--').splitlines())
    if not changes or changes - ALLOWED:
        raise ValueError('Release PR меняет файлы приложения вне разрешённой конфигурации')
    execute('git', 'fetch', 'origin', SOURCE_HEAD, '--depth=1')
    execute('git', 'diff', '--quiet', SOURCE_HEAD, SOURCE, '--')


def verify_reviews(sha, api):
    source = api(f'repos/{REPOSITORY}/pulls/643')
    if (source.get('state') != 'closed' or source.get('merged') is not True
            or source.get('merge_commit_sha') != SOURCE
            or source.get('base', {}).get('ref') != 'qa2/integration-candidate'
            or source.get('head', {}).get('sha') != SOURCE_HEAD
            or source.get('head', {}).get('repo', {}).get('full_name') != REPOSITORY):
        raise ValueError('Не подтверждён точный исходник PR643')
    release = api(f'repos/{REPOSITORY}/pulls/636')
    if (release.get('head', {}).get('sha') != sha
            or release.get('head', {}).get('ref') != BRANCH
            or release.get('head', {}).get('repo', {}).get('full_name') != REPOSITORY
            or release.get('base', {}).get('ref') != 'qa2/integration-candidate'
            or not (release.get('state') == 'open'
                    or release.get('state') == 'closed' and release.get('merged') is True)):
        raise ValueError('Не подтверждён текущий release PR636')
    checks = api(f'repos/{REPOSITORY}/commits/{SOURCE_HEAD}/check-runs?per_page=100')['check_runs']
    for name in CHECKS:
        matching = [item for item in checks if item.get('name') == name]
        if not matching or max(matching, key=lambda item: item['id']).get('conclusion') != 'success':
            raise ValueError('Не пройден обязательный CI исходника: ' + name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--platform', required=True, choices=('ios', 'android'))
    parser.add_argument('--verified-counter', required=True)
    args = parser.parse_args()
    sha = verify_context(os.environ, args.platform, args.verified_counter)
    verify_git(sha)
    verify_reviews(sha, lambda path: json.loads(command('gh', 'api', path)))
    print(json.dumps({'status': 'PUBLIC_CANDIDATE_INTENT_VERIFIED', 'app_source': SOURCE,
                      'release_config_sha': sha, 'platform': args.platform, 'public_upload_performed': False}))


if __name__ == '__main__':
    main()
