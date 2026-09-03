"""Storage service — приватный Supabase/S3 + локальный FS только для dev.

Provider выбирается через env STORAGE_PROVIDER=local|supabase|s3.
"""
import os
import re
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

import httpx

PROVIDER = os.getenv("STORAGE_PROVIDER", "local")
_RUNTIME_ENV = (os.getenv("URTRUCK_ENV") or os.getenv("ENV") or "production").strip().lower()
_PROD = _RUNTIME_ENV == "production"

_default_root = (
    Path(tempfile.gettempdir()) / "urtruck-storage"
    if _RUNTIME_ENV in {"test", "testing", "dev", "development", "local", "ci"}
    else Path("/home/ubuntu/urtruck-security/storage")
)
LOCAL_ROOT = Path(os.getenv("STORAGE_LOCAL_ROOT", str(_default_root))).expanduser()
LOCAL_PUBLIC_BASE = os.getenv("STORAGE_LOCAL_PUBLIC_BASE", "/security/storage")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "urtruck-docs")
_SUPABASE_REF_PREFIX = "supabase://"

S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_REGION = os.getenv("S3_REGION", "eu-central-1")

_SAFE_SEGMENT_RE = re.compile(r"[^A-Za-z0-9_-]+")
_SAFE_EXT_RE = re.compile(r"[^A-Za-z0-9]+")


class StorageSaveError(RuntimeError):
    """Raised when the configured durable storage rejects an object."""

    def __init__(self, message: str, *, provider: str = "", status_code: int | None = None, detail: str = ""):
        super().__init__(message)
        self.provider = provider
        self.status_code = status_code
        self.detail = detail


def _safe_segment(value: str, fallback: str) -> str:
    cleaned = _SAFE_SEGMENT_RE.sub("-", str(value or "").strip()).strip("-_")
    return cleaned[:64] or fallback


def _safe_ext(value: str) -> str:
    cleaned = _SAFE_EXT_RE.sub("", str(value or "").strip().lstrip(".")).lower()
    return cleaned[:10] or "jpg"


def _gen_key(category: str, ext: str = "jpg") -> str:
    return f"{_safe_segment(category, 'uploads')}/{uuid.uuid4().hex}.{_safe_ext(ext)}"


def _save_local(data: bytes, key: str) -> str:
    root = LOCAL_ROOT.resolve()
    full_path = (root / key).resolve()
    try:
        full_path.relative_to(root)
    except ValueError as exc:
        raise ValueError("Недопустимый путь хранения") from exc
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(data)
    return f"{LOCAL_PUBLIC_BASE}/{key}"


def _save_supabase(data: bytes, key: str, content_type: str) -> str:
    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{key}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type or "application/octet-stream",
        "x-upsert": "true",
    }
    try:
        r = httpx.post(url, headers=headers, content=data, timeout=30.0)
        r.raise_for_status()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text[:500] if exc.response is not None else ""
        raise StorageSaveError(
            "Supabase Storage rejected the file",
            provider="supabase",
            status_code=exc.response.status_code if exc.response is not None else None,
            detail=body,
        ) from exc
    except httpx.HTTPError as exc:
        raise StorageSaveError("Supabase Storage is unavailable", provider="supabase", detail=str(exc)) from exc
    return f"{_SUPABASE_REF_PREFIX}{SUPABASE_BUCKET}/{key}"


def _split_supabase_ref(value: Optional[str]) -> Optional[tuple[str, str]]:
    if not value or not str(value).startswith(_SUPABASE_REF_PREFIX):
        return None
    rest = str(value)[len(_SUPABASE_REF_PREFIX):]
    bucket, sep, key = rest.partition("/")
    if not sep or not bucket or not key or ".." in key.split("/"):
        return None
    if bucket != SUPABASE_BUCKET:
        return None
    return bucket, key


def is_private_remote_ref(value: Optional[str]) -> bool:
    return _split_supabase_ref(value) is not None


def create_signed_url(value: Optional[str], ttl: int = 3600) -> Optional[str]:
    parsed = _split_supabase_ref(value)
    if not parsed:
        return value
    if not (SUPABASE_URL and SUPABASE_KEY):
        raise RuntimeError("Supabase Storage is not configured")
    bucket, key = parsed
    ttl_seconds = max(60, min(int(ttl), 7 * 24 * 60 * 60))
    r = httpx.post(
        f"{SUPABASE_URL}/storage/v1/object/sign/{bucket}/{key}",
        headers={"Authorization": f"Bearer {SUPABASE_KEY}"},
        json={"expiresIn": ttl_seconds},
        timeout=15.0,
    )
    r.raise_for_status()
    payload = r.json()
    signed = payload.get("signedURL") or payload.get("signedUrl")
    if not signed:
        raise RuntimeError("Supabase did not return a signed object URL")
    return signed if str(signed).startswith("http") else f"{SUPABASE_URL}/storage/v1{signed}"


@contextmanager
def materialize_for_processing(value: Optional[str], suffix: str = ".jpg") -> Iterator[Optional[str]]:
    parsed = _split_supabase_ref(value)
    if not parsed:
        yield get_local_path(value or "")
        return
    if not (SUPABASE_URL and SUPABASE_KEY):
        raise RuntimeError("Supabase Storage is not configured")
    bucket, key = parsed
    r = httpx.get(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{key}",
        headers={"Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=30.0,
    )
    r.raise_for_status()
    fd, path = tempfile.mkstemp(prefix="urtruck-verify-", suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(r.content)
        yield path
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass


def _save_s3(data: bytes, key: str, content_type: str) -> str:
    try:
        import boto3
    except ImportError:
        raise RuntimeError("boto3 не установлен — добавь в requirements.txt")
    s3 = boto3.client("s3", region_name=S3_REGION)
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=data,
        ContentType=content_type or "application/octet-stream",
    )
    return f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{key}"


def save_file(
    data: bytes,
    category: str,
    *,
    ext: str = "bin",
    content_type: str = "application/octet-stream",
) -> str:
    """Store arbitrary validated bytes while preserving their real MIME type.

    Callers must validate file content before this function. This service owns
    only durable/private storage and must not silently relabel a PDF as JPEG.
    """
    key = _gen_key(category, ext)
    if PROVIDER == "supabase":
        if not (SUPABASE_URL and SUPABASE_KEY):
            raise StorageSaveError("Supabase Storage is not configured", provider="supabase")
        return _save_supabase(data, key, content_type)
    if PROVIDER == "s3":
        if not S3_BUCKET:
            raise StorageSaveError("S3 Storage is not configured", provider="s3")
        return _save_s3(data, key, content_type)
    if PROVIDER != "local":
        raise StorageSaveError(f"Unsupported storage provider: {PROVIDER}", provider=PROVIDER)
    if _PROD:
        raise StorageSaveError("Local storage is disabled in production", provider="local")
    return _save_local(data, key)


def save_image(data: bytes, category: str, ext: str = "jpg") -> str:
    """Backward-compatible image helper."""
    mime = "image/png" if str(ext).lower().lstrip('.') == "png" else "image/jpeg"
    return save_file(data, category, ext=ext, content_type=mime)


def get_local_path(url_or_path: str) -> Optional[str]:
    if not url_or_path:
        return None
    if url_or_path.startswith(LOCAL_PUBLIC_BASE):
        rel = url_or_path[len(LOCAL_PUBLIC_BASE):].lstrip("/")
        root = LOCAL_ROOT.resolve()
        candidate = (root / rel).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            return None
        return str(candidate)
    return url_or_path


def info() -> dict:
    return {
        "provider": PROVIDER,
        "local_root": str(LOCAL_ROOT),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_KEY),
        "s3_configured": bool(S3_BUCKET),
    }
