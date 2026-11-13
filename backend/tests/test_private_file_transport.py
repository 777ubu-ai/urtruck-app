import logging

from services import private_file_transport as transport


def test_capability_changes_representation_without_returning_storage_ref():
    headers = {"x-urtruck-private-file-transport": "v1", "x-urtruck-client-version": "1.0.51"}
    assert transport.supports_private_file_transport(headers)
    source = {"id": "file-id", "url": "supabase://private/secret-key.pdf", "kind": "document"}
    result = transport.attachment_payload(source, private_transport=True)
    assert result["id"] == "file-id"
    assert result["private_file_transport"] == "v1"
    assert result["private_content_available"] is True
    assert result["url"] is None and result["download_url"] is None
    assert "secret-key" not in repr(result)
    assert transport.attachment_payload(source, private_transport=False) is source


def test_legacy_issuance_telemetry_has_only_aggregate_nonsecret_fields(caplog):
    headers = {
        "x-urtruck-client-version": "1.0.51",
        "authorization": "Bearer do-not-log",
        "referer": "https://host/file?sig=do-not-log",
    }
    with caplog.at_level(logging.INFO):
        transport.record_legacy_issuance("chat_media", 3, headers)
        transport.record_legacy_issuance("chat_media", 0, headers)
    message = caplog.text
    assert "kind=chat_media count=3 client_version=1.0.51 ttl_seconds=86400" in message
    assert "do-not-log" not in message
    assert "host/file" not in message
    assert "user" not in message.lower()


def test_legacy_cutoff_is_opt_in_and_compatibility_default_stays_enabled(monkeypatch):
    monkeypatch.delenv(transport.LEGACY_LINKS_ENV, raising=False)
    assert transport.legacy_links_enabled() is True
    monkeypatch.setenv(transport.LEGACY_LINKS_ENV, "false")
    assert transport.legacy_links_enabled() is False
    disabled = transport.legacy_disabled_payload({"id": "f", "url": "/storage/private.pdf"})
    assert disabled["url"] is None
    assert disabled["private_file_transport_required"] is True
    assert disabled["private_content_available"] is True
