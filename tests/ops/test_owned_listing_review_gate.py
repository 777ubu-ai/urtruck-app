"""Review gate отклоняет самоодобрение, старый SHA и чужой merge."""
import copy
from pathlib import Path
import sys
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/ops'))
from owned_listing_review_gate import validate, REPOSITORY

SHA = 'a' * 40
HEAD = 'b' * 40


def fixture():
    pr = {'number': 700, 'merged': True, 'base': {'ref': 'main', 'repo': {'full_name': REPOSITORY}},
          'merge_commit_sha': SHA, 'user': {'login': 'author'}, 'head': {'sha': HEAD}}
    review = {'state': 'APPROVED', 'user': {'login': 'independent', 'type': 'User'},
              'commit_id': HEAD, 'author_association': 'COLLABORATOR'}
    return pr, review


def test_current_independent_review_passes():
    pr, review = fixture()
    assert validate(pr, [review], SHA, SHA)['independent_approvals'] == 1


@pytest.mark.parametrize('case', ['self', 'stale', 'bot', 'outsider', 'comment', 'dismissed', 'changes_requested',
                                  'not_merged', 'wrong_base', 'old_main', 'wrong_merge'])
def test_unreviewed_or_stale_sources_fail_closed(case):
    pr, r = fixture(); main = SHA
    if case == 'self': r['user']['login'] = 'AUTHOR'
    if case == 'stale': r['commit_id'] = 'c' * 40
    if case == 'bot': r['user']['type'] = 'Bot'
    if case == 'outsider': r['author_association'] = 'CONTRIBUTOR'
    if case in {'comment', 'dismissed', 'changes_requested'}: r['state'] = {'comment': 'COMMENTED', 'dismissed': 'DISMISSED', 'changes_requested': 'CHANGES_REQUESTED'}[case]
    if case == 'not_merged': pr['merged'] = False
    if case == 'wrong_base': pr['base']['ref'] = 'qa2/integration-candidate'
    if case == 'old_main': main = 'd' * 40
    if case == 'wrong_merge': pr['merge_commit_sha'] = 'e' * 40
    with pytest.raises(ValueError): validate(pr, [r], main, SHA)


def test_later_dismissal_or_changes_requested_revoke_approval():
    pr, r = fixture()
    for state in ['DISMISSED', 'CHANGES_REQUESTED']:
        newer = {**r, 'state': state}
        with pytest.raises(ValueError): validate(pr, [r, newer], SHA, SHA)
