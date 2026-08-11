"""Regression: chat polling must not make the same private photo blink."""

from services import file_signing


def test_local_signed_url_is_stable_inside_polling_window(monkeypatch):
    monkeypatch.setenv("FILE_SIGNING_KEY", "x" * 32)
    monkeypatch.setattr(file_signing.time, "time", lambda: 1_700_000_001)
    first = file_signing.sign("/security/storage/chat_photos/proof.jpg")

    # ChatScreen polls roughly every three seconds.  The exact same object
    # must keep its source URL, otherwise React Native reloads the image.
    monkeypatch.setattr(file_signing.time, "time", lambda: 1_700_000_004)
    second = file_signing.sign("/security/storage/chat_photos/proof.jpg")

    assert first == second
