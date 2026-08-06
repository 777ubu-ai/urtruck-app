"""Regression coverage for local storage path containment."""
from pathlib import Path

from services import storage_service as storage


def test_generated_key_sanitizes_category_and_extension():
    key = storage._gen_key("../../driver docs", "../JpG")
    category, filename = key.split("/", 1)

    assert category == "driver-docs"
    assert filename.endswith(".jpg")
    assert ".." not in key
    assert "\\" not in key


def test_save_local_cannot_escape_storage_root(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "LOCAL_ROOT", tmp_path)

    try:
        storage._save_local(b"secret", "../escaped.txt")
    except ValueError:
        pass
    else:
        raise AssertionError("path traversal must be rejected")

    assert not (tmp_path.parent / "escaped.txt").exists()


def test_public_storage_url_resolves_inside_root(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "LOCAL_ROOT", tmp_path)
    monkeypatch.setattr(storage, "LOCAL_PUBLIC_BASE", "/security/storage")

    resolved = storage.get_local_path("/security/storage/driver/photo.jpg")

    assert resolved == str((tmp_path / "driver" / "photo.jpg").resolve())


def test_public_storage_url_rejects_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "LOCAL_ROOT", tmp_path)
    monkeypatch.setattr(storage, "LOCAL_PUBLIC_BASE", "/security/storage")

    assert storage.get_local_path("/security/storage/../../etc/passwd") is None
    assert storage.get_local_path("/security/storage/driver/../../../secret") is None


def test_non_storage_path_keeps_backward_compatibility(tmp_path):
    raw_path = str(Path(tmp_path) / "capture.jpg")
    assert storage.get_local_path(raw_path) == raw_path
