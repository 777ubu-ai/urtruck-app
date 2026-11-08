"""Проверка review, адресного разрешения владельца и точного merge commit."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.request

REPOSITORY = '777ubu-ai/urtruck-app'

# Владелец 08.11 разрешил эту операцию после независимого инженерного review
# f70da5a6 и CI без ожидания отдельного GitHub approval. Это не разрешение
# менять проверенный пакет, обходить защиту ветки или выпускать приложение.
OWNER_AUTHORIZATION_PR = 693
ENGINEERING_REVIEWED_SOURCE = 'f70da5a6d098dd82d7a7e70dc28134fcec435177'
OWNER_AUTHORIZATION_UNTIL = datetime(2026, 11, 9, tzinfo=timezone.utc)
AUTHORIZED_FILES = {
    'ops/owned-listing-production/manifest.json': '23194246ed9ed808f10bc0287bdb03c446c9d916805527b14aa3874b6f47a3a9',
    'scripts/ops/owned_listing_production_overlay.py': '1868c057effeb759ba13fe264c86dd806bb911f3c8e0dd2204aa38a9d468120c',
    'scripts/ops/owned_listing_recovery.py': '43a849ee6f0077e7fabaa0841b3a70abd3e85c1fb5dd9c5c11f95f02511d0ef2',
    'scripts/ops/runtime_release_manifest.py': '2234b89c4ac69881dbbd7f2686f5ef41e414bb843a07612c33d0fee106ddcdaf',
    'scripts/ops/build_owned_listing_overlay.py': '6d864f2bdde6293618f441e55ae05c6a19a6db30d0c2891b5c4e1119d8af343e',
    'scripts/ops/external_feed_production_overlay.py': '5ec0fd64148de3ae26aac3db0b55ea44afad4f99fe63418d144b75aa3465a628',
    '.github/workflows/deploy-owned-listing-recovery.yml': '3415383b6055dc1e7dd6538e54724ad9cc24183c4da70aab1c28f7c8a16bf7a5',
    '.github/workflows/production-deploy-execute.yml': 'b540b9c26b5df13f67cdd67cd22a42878cd2c38629dae0fe167157d7e8209e55',
}


def owner_authorization(pr, root, now=None):
    """Исключение только для неизменного проверенного пакета PR #693."""
    now = now or datetime.now(timezone.utc)
    if not (pr.get('number') == OWNER_AUTHORIZATION_PR
            and pr.get('head', {}).get('ref') == 'fix/owned-production-overlay-20261107'
            and pr.get('head', {}).get('repo', {}).get('full_name') == REPOSITORY
            and datetime(2026, 11, 8, tzinfo=timezone.utc) <= now < OWNER_AUTHORIZATION_UNTIL):
        return False
    try:
        for name, digest in AUTHORIZED_FILES.items():
            path = root / name
            if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                return False
        manifest = json.loads((root / 'ops/owned-listing-production/manifest.json').read_text())
        for name, digest in {**manifest['baseline_files'], **manifest['files']}.items():
            path = root / 'backend' / name
            if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                return False
    except (OSError, ValueError, KeyError):
        return False
    return True


def validate(pr, reviews, main_sha, expected_sha, *, owner_authorized=False):
    owner_authorized = owner_authorized and pr.get('number') == OWNER_AUTHORIZATION_PR
    if not (re.fullmatch('[0-9a-f]{40}', expected_sha) and main_sha == expected_sha
            and pr.get('merged') is True and pr.get('base', {}).get('ref') == 'main'
            and pr.get('base', {}).get('repo', {}).get('full_name') == REPOSITORY
            and pr.get('merge_commit_sha') == expected_sha):
        raise ValueError('owned_review_requires_exact_current_merged_main')
    author = pr.get('user', {}).get('login', '').lower()
    head = pr.get('head', {}).get('sha')
    latest = {}
    for review in reviews:
        login = review.get('user', {}).get('login', '').lower()
        if review.get('state') in {'APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'}:
            latest[login] = review
    accepted = [login for login, item in latest.items()
                if login and login != author and item.get('state') == 'APPROVED'
                and item.get('commit_id') == head
                and item.get('author_association') in {'OWNER', 'MEMBER', 'COLLABORATOR'}
                and item.get('user', {}).get('type') == 'User']
    if not accepted and not owner_authorized:
        raise ValueError('owned_independent_current_head_approval_missing')
    if any(item.get('state') == 'CHANGES_REQUESTED' for item in latest.values()):
        raise ValueError('owned_unresolved_changes_requested')
    return {'pull_request': pr['number'], 'current_head': head, 'main_sha': expected_sha,
            'independent_approvals': len(accepted),
            'authorization_basis': 'independent_github_approval' if accepted else 'owner_scoped_recovery_exception',
            'engineering_reviewed_source': ENGINEERING_REVIEWED_SOURCE if owner_authorized else None}


def fetch(path):
    request = urllib.request.Request('https://api.github.com/repos/' + REPOSITORY + path,
        headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pr', type=int, required=True)
    parser.add_argument('--sha', required=True)
    args = parser.parse_args()
    if args.pr <= 0:
        raise ValueError('owned_pr_number_invalid')
    pr = fetch('/pulls/' + str(args.pr))
    reviews = []
    for page in range(1, 101):
        batch = fetch('/pulls/' + str(args.pr) + '/reviews?per_page=100&page=' + str(page))
        reviews.extend(batch)
        if len(batch) < 100:
            break
    else:
        raise ValueError('owned_review_pagination_unbounded')
    main = fetch('/git/ref/heads/main')['object']['sha']
    root = Path(__file__).resolve().parents[2]
    print(json.dumps(validate(pr, reviews, main, args.sha,
                              owner_authorized=owner_authorization(pr, root))))


if __name__ == '__main__':
    main()
