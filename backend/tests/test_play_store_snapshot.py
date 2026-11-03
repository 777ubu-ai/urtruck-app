"""Номер берётся из всех видимых пакетов/треков; edit закрывается при ошибке."""
import importlib.util
from pathlib import Path
import pytest

spec = importlib.util.spec_from_file_location('inspect_play_store', Path(__file__).resolve().parents[2] / 'scripts/ops/inspect_play_store.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Response:
    def __init__(self, payload, status=200):
        self.payload, self.status_code = payload, status

    def json(self):
        return self.payload


class Session:
    def __init__(self, broken=False):
        self.calls = []
        self.broken = broken

    def post(self, url, **kwargs):
        self.calls.append(('POST', url))
        return Response({'id': 'inspection-1'})

    def get(self, url, **kwargs):
        self.calls.append(('GET', url))
        if url.endswith('/tracks'):
            return Response({'tracks': [{'track': 'production', 'releases': [{'status': 'completed', 'versionCodes': ['215090228']}]},
                                        {'track': 'internal', 'releases': [{'status': 'draft', 'versionCodes': ['215090229']}]}]})
        if self.broken:
            return Response({}, status=403)
        return Response({'bundles': [{'versionCode': 215090230}]} if url.endswith('/bundles') else {'apks': [{'versionCode': 215090231}]})

    def delete(self, url, **kwargs):
        self.calls.append(('DELETE', url))
        return Response({}, status=204)


def test_maximum_includes_unassigned_bundles_apks_and_drafts():
    session = Session()
    result = module.snapshot(session)
    assert result['maximum_current_version_code'] == 215090231
    assert result['proposed_next_version_code'] == 215090232
    assert result['temporary_edit_deleted']
    assert not result['edit_committed'] and not result['upload_performed']
    assert [verb for verb, _ in session.calls] == ['POST', 'GET', 'GET', 'GET', 'DELETE']
    assert not any(':commit' in url or 'upload' in url for _, url in session.calls)


def test_api_failure_closes_temporary_edit():
    session = Session(broken=True)
    with pytest.raises(RuntimeError, match='HTTP 403'):
        module.snapshot(session)
    assert session.calls[-1] == ('DELETE', module.BASE + '/inspection-1')


@pytest.mark.parametrize('value', [True, 0, '01', '-1', '215090231;exit 0', 2100000000])
def test_rejects_invalid_version_code(value):
    with pytest.raises(ValueError):
        module.code(value)
