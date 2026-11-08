"""Review gate отклоняет самоодобрение, старый SHA и чужой merge."""
import copy
from pathlib import Path
import sys
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/ops'))
from owned_listing_review_gate import validate, REPOSITORY, owner_authorization, AUTHORIZED_FILES
from datetime import datetime, timezone
import json
import hashlib

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


def authorized_pr():
    pr, _ = fixture()
    pr['number'] = 693
    pr['head'].update(ref='fix/owned-production-overlay-20261107', repo={'full_name': REPOSITORY})
    return pr


def test_owner_exception_is_reported_without_fabricated_approval():
    pr = authorized_pr()
    result = validate(pr, [], SHA, SHA, owner_authorized=True)
    assert result['independent_approvals'] == 0
    assert result['authorization_basis'] == 'owner_scoped_recovery_exception'
    for change in ['other_pr', 'not_merged', 'wrong_main', 'changes_requested']:
        altered = copy.deepcopy(pr)
        reviews = []
        main = SHA
        if change == 'other_pr': altered['number'] = 694
        if change == 'not_merged': altered['merged'] = False
        if change == 'wrong_main': main = 'c' * 40
        if change == 'changes_requested':
            _, review = fixture()
            reviews = [{**review, 'state': 'CHANGES_REQUESTED'}]
        with pytest.raises(ValueError):
            validate(altered, reviews, main, SHA, owner_authorized=True)


@pytest.fixture
def approved_payload(tmp_path, monkeypatch):
    """Положительный эталон не должен зависеть от последующих изменений runtime."""
    import owned_listing_review_gate as gate
    main = b'baseline main\n'
    market = b'reviewed marketplace\n'
    files = {'backend/main.py': main, 'backend/api/marketplace.py': market}
    manifest = {
        'baseline_files': {'main.py': hashlib.sha256(main).hexdigest(),
                           'api/marketplace.py': hashlib.sha256(b'old marketplace').hexdigest()},
        'files': {'api/marketplace.py': hashlib.sha256(market).hexdigest()},
    }
    for name in AUTHORIZED_FILES:
        files[name] = (json.dumps(manifest).encode() if name.endswith('/manifest.json')
                       else ('reviewed fixture: ' + name).encode())
    for name, value in files.items():
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(value)
    monkeypatch.setattr(gate, 'AUTHORIZED_FILES',
                        {name: hashlib.sha256(files[name]).hexdigest() for name in AUTHORIZED_FILES})
    return tmp_path


def test_exact_reviewed_tree_qualifies_only_for_owner_operation(approved_payload):
    root = approved_payload
    pr = authorized_pr()
    now = datetime(2026, 11, 8, 12, tzinfo=timezone.utc)
    assert owner_authorization(pr, root, now)
    for field, value in [('number', 694), ('ref', 'other'), ('repo', {'full_name': 'other/repo'})]:
        altered = copy.deepcopy(pr)
        (altered if field == 'number' else altered['head'])[field] = value
        assert not owner_authorization(altered, root, now)
    assert not owner_authorization(pr, root, datetime(2026, 11, 7, tzinfo=timezone.utc))
    assert not owner_authorization(pr, root, datetime(2026, 11, 9, tzinfo=timezone.utc))


@pytest.mark.parametrize('changed', ['backend/api/marketplace.py', 'backend/main.py',
    'scripts/ops/owned_listing_recovery.py', 'ops/owned-listing-production/manifest.json',
    '.github/workflows/production-deploy-execute.yml'])
def test_owner_exception_rejects_runtime_controller_manifest_and_workflow_drift(approved_payload, changed):
    tmp_path = approved_payload
    pr = authorized_pr()
    now = datetime(2026, 11, 8, 12, tzinfo=timezone.utc)
    assert owner_authorization(pr, tmp_path, now)
    with (tmp_path / changed).open('ab') as stream:
        stream.write(b'\n# drift\n')
    assert not owner_authorization(pr, tmp_path, now)


def test_current_changed_payload_does_not_inherit_original_owner_exception():
    """Новые runtime-изменения не получают разрешение прежнего пакета PR693."""
    root = Path(__file__).resolve().parents[2]
    manifest = json.loads((root / 'ops/owned-listing-production/manifest.json').read_text())
    expected = {**manifest['baseline_files'], **manifest['files']}
    changed = any(hashlib.sha256((root / 'backend' / name).read_bytes()).hexdigest() != digest
                  for name, digest in expected.items())
    if changed:
        assert not owner_authorization(authorized_pr(), root, datetime(2026, 11, 8, 12, tzinfo=timezone.utc))


def test_existing_production_callers_do_not_lose_required_read_permissions():
    import yaml
    root = Path(__file__).resolve().parents[2]
    for path in (root / '.github/workflows').glob('*.yml'):
        data = yaml.safe_load(path.read_text())
        for job in data.get('jobs', {}).values():
            if 'production-deploy-execute.yml' in job.get('uses', ''):
                permissions = job.get('permissions', data.get('permissions', {}))
                assert permissions.get('contents') == 'read', path.name
                assert permissions.get('pull-requests') == 'read', path.name
