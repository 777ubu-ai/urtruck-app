"""Сверка Play не загружает артефакты и не меняет треки."""
import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    'play_readback', Path(__file__).resolve().parents[2] / 'scripts/ops/inspect_play_store.py')
readback = importlib.util.module_from_spec(spec)
spec.loader.exec_module(readback)


class Response:
    def __init__(self, value, status=200):
        self.value, self.status_code = value, status

    def json(self):
        return self.value


class Session:
    def __init__(self, bad=False):
        self.calls, self.bad = [], bad

    def post(self, url, json, timeout):
        self.calls.append(('POST', url, json))
        assert url == readback.BASE and json == {}
        return Response({'id': 'temporary-read-only'}, 201)

    def get(self, url, timeout):
        self.calls.append(('GET', url))
        if self.bad:
            return Response({}, 403)
        if url.endswith('/tracks'):
            return Response({'tracks': [{'track': 'internal', 'releases': [
                {'status': 'completed', 'versionCodes': ['215090229']}]}]})
        if url.endswith('/bundles'):
            return Response({'bundles': [{'versionCode': 215090230}]})
        assert url.endswith('/apks')
        return Response({'apks': []})

    def delete(self, url, timeout):
        self.calls.append(('DELETE', url))
        return Response({}, 204)


def test_readback_uses_all_artifact_counters_and_never_commits_or_uploads():
    session = Session()
    result = readback.snapshot(session)
    assert result['maximum_current_version_code'] == 215090230
    assert result['proposed_next_version_code'] == 215090231
    assert result['upload_performed'] is result['edit_committed'] is False
    assert result['temporary_edit_deleted'] is True
    assert [call[0] for call in session.calls] == ['POST', 'GET', 'GET', 'GET', 'DELETE']
    assert not any('commit' in call[1] or 'upload' in call[1] for call in session.calls)


def test_failed_readback_still_removes_temporary_edit():
    session = Session(bad=True)
    with pytest.raises(RuntimeError, match='403'):
        readback.snapshot(session)
    assert session.calls[-1] == ('DELETE', readback.BASE + '/temporary-read-only')


@pytest.mark.parametrize('value', ['', '123;exit 0', '00012', True, 2100000000])
def test_invalid_play_counter_is_not_used(value):
    with pytest.raises(ValueError):
        readback.code(value)
