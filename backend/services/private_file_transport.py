"""Совместимое представление приватных файлов для обновлённых клиентов.

Capability управляет только форматом ответа. Авторизация и ACL всегда
проверяются byte-endpoint-ами; отсутствие заголовка сохраняет старый путь.
"""
import logging
import os
import re

logger = logging.getLogger(__name__)
CAPABILITY_HEADER = "x-urtruck-private-file-transport"
CLIENT_VERSION_HEADER = "x-urtruck-client-version"
CAPABILITY_V1 = "v1"
LEGACY_SIGNED_URL_TTL_SECONDS = 86400
LEGACY_LINKS_ENV = "LEGACY_SIGNED_FILE_LINKS_ENABLED"


def legacy_links_enabled() -> bool:
    # Compatibility-safe by default. Turning this off is a staged operator
    # action after observed client adoption; this change never flips it.
    return os.getenv(LEGACY_LINKS_ENV, "true").strip().lower() not in {"0", "false", "no", "off"}


def supports_private_file_transport(headers) -> bool:
    return str(headers.get(CAPABILITY_HEADER, "")).strip().lower() == CAPABILITY_V1


def safe_client_version(headers) -> str:
    value = str(headers.get(CLIENT_VERSION_HEADER, ""))[:32]
    return value if re.fullmatch(r"[0-9A-Za-z.+_-]{1,32}", value) else "unknown"


def attachment_payload(attachment: dict | None, *, private_transport: bool) -> dict | None:
    if not isinstance(attachment, dict):
        return attachment
    if not private_transport:
        return attachment
    # Never echo a storage reference to the client. It receives only the
    # opaque DB id and uses the authenticated room/file byte endpoint.
    return {
        **attachment,
        "url": None,
        "download_url": None,
        "private_file_transport": CAPABILITY_V1,
        "private_content_available": bool(attachment.get("url")),
    }


def legacy_disabled_payload(attachment: dict | None) -> dict | None:
    if not isinstance(attachment, dict):
        return attachment
    return {
        **attachment,
        "url": None,
        "download_url": None,
        "private_file_transport_required": True,
        "private_content_available": bool(attachment.get("url")),
    }


def record_legacy_issuance(kind: str, count: int, headers) -> None:
    """Safe aggregate log: no user, room, file, URL, signature, or token."""
    if count > 0:
        logger.info(
            "legacy_file_link_issued kind=%s count=%d client_version=%s ttl_seconds=%d",
            re.sub(r"[^a-z_]+", "", str(kind).lower())[:24] or "unknown",
            min(int(count), 10000),
            safe_client_version(headers),
            LEGACY_SIGNED_URL_TTL_SECONDS,
        )
