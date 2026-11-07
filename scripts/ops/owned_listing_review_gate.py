"""Проверка независимого GitHub approval и неизменности merge commit."""
import argparse
import json
import os
import re
import urllib.request

REPOSITORY = '777ubu-ai/urtruck-app'


def validate(pr, reviews, main_sha, expected_sha):
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
    if not accepted:
        raise ValueError('owned_independent_current_head_approval_missing')
    if any(item.get('state') == 'CHANGES_REQUESTED' for item in latest.values()):
        raise ValueError('owned_unresolved_changes_requested')
    return {'pull_request': pr['number'], 'approved_head': head, 'main_sha': expected_sha,
            'independent_approvals': len(accepted)}


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
    print(json.dumps(validate(pr, reviews, main, args.sha)))


if __name__ == '__main__':
    main()
