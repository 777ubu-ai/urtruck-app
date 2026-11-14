"""Ограниченное чтение приватных объектов не принимает чужие пути."""
import io
import sys
from types import SimpleNamespace

import pytest

from services import storage_service as storage


def test_local_file_limits_and_path_containment(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'LOCAL_ROOT', tmp_path)
    (tmp_path / 'chat_attachments').mkdir()
    (tmp_path / 'chat_attachments' / 'a.pdf').write_bytes(b'1234')
    assert storage.read_private_bytes('/storage/chat_attachments/a.pdf', 4) == b'1234'
    with pytest.raises(storage.PrivateFileTooLargeError):
        storage.read_private_bytes('/storage/chat_attachments/a.pdf', 3)
    for value in ('/storage/../secret', '/storage/%2e%2e/secret',
                  '/storage/chat_attachments/a.pdf?other=1', 'https://other.example/a'):
        with pytest.raises(ValueError):
            storage.read_private_bytes(value, 4)


def test_supabase_stream_is_bounded_and_rejects_other_bucket(monkeypatch):
    monkeypatch.setattr(storage, 'SUPABASE_URL', 'https://storage.example')
    monkeypatch.setattr(storage, 'SUPABASE_KEY', 'test-secret')
    monkeypatch.setattr(storage, 'SUPABASE_BUCKET', 'ours')
    class Stream:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def raise_for_status(self): pass
        def iter_bytes(self, chunk_size):
            assert chunk_size == 65536
            yield b'123'
            yield b'45'
    monkeypatch.setattr(storage.httpx, 'stream', lambda *a, **kw: Stream())
    assert storage.read_private_bytes('supabase://ours/chat_attachments/a.pdf', 5) == b'12345'
    with pytest.raises(storage.PrivateFileTooLargeError):
        storage.read_private_bytes('supabase://ours/chat_attachments/a.pdf', 4)
    with pytest.raises(ValueError):
        storage.read_private_bytes('supabase://other/chat_attachments/a.pdf', 5)


def test_s3_reads_only_configured_bucket_and_closes_stream(monkeypatch):
    monkeypatch.setattr(storage, 'S3_BUCKET', 'ours')
    monkeypatch.setattr(storage, 'S3_REGION', 'test-region')
    body = io.BytesIO(b'12345')
    client = SimpleNamespace(get_object=lambda **kw: {'Body': body, 'ContentLength': 5})
    monkeypatch.setitem(sys.modules, 'boto3', SimpleNamespace(client=lambda *a, **kw: client))
    assert storage.read_private_bytes('https://ours.s3.test-region.amazonaws.com/chat_attachments/a.pdf', 5) == b'12345'
    assert body.closed
    with pytest.raises(ValueError):
        storage.read_private_bytes('https://other.s3.test-region.amazonaws.com/chat_attachments/a.pdf', 5)
