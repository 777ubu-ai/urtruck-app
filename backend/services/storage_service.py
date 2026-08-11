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

# Local. Production keeps the existing server path. Tests, CI and local
# development use a writable temporary directory unless explicitly configured.
_env = os.getenv("ENV", os.getenv("APP_ENV", "production")).strip().lower()
_default_root = (
    Path(tempfile.gettempdir()) / "urtruck-storage"
    if _env in {"test", "testing", "dev", "development", "local", "ci"}
    else Path("/home/ubuntu/urtruck-security/storage")
)
LOCAL_ROOT = Path(os.getenv("STORAGE_LOCAL_ROOT", str(_default_root))).expanduser()
LOCAL_PUBLIC_BASE = os.getenv("STORAGE_LOCAL_PUBLIC_BASE", "/security/storage")

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "urtruck-docs")
_SUPABASE_REF_PREFIX = "supabase://"

# S3
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_REGION = os.getenv("S3_REGION", "eu-central-1")

_SAFE_SEGMENT_RE = re.compile(r"[^A-Za-z0-9_-]+")
_SAFE_EXT_RE = re.compile(r"[^A-Za-z0-9]+")


def _safe_segment(value: str, fallback: str) -> str:
    cleaned = _SAFE_SEGMENT_RE.sub("-", str(value or "").strip()).strip("-_")
    return cleaned[:64] or fallback


def _safe_ext(value: str) -> str:
    cleaned = _SAFE_EXT_RE.sub("", str(value or "").strip().lstrip(".")).lower()
    return cleaned[:10] or "jpg"


def _gen_key(category: str, ext: str = "jpg") -> str:
    """Generate a storage key without allowing caller-controlled path parts."""
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


def _save_supabase(data: bytes, key: str) -> str:
    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{key}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
    }
    r = httpx.post(url, headers=headers, content=data, timeout=30.0)
    r.raise_for_status()
    # The bucket is deliberately private.  Persisting a public URL here would
    # either expose a document (if the bucket were changed accidentally) or
    # make the file unreadable.  The API signs this opaque reference only
    # after it has checked the caller's access to the document/conversation.
    return f"{_SUPABASE_REF_PREFIX}{SUPABASE_BUCKET}/{key}"


def _split_supabase_ref(value: Optional[str]) -> Optional[tuple[str, str]]:
    """Parse only a canonical private Supabase object reference.

    Old public URLs are intentionally not accepted: treating arbitrary URLs
    as trusted storage references could turn this service into an SSRF proxy.
    """
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
    """Whether value is an internal private Supabase object reference."""
    return _split_supabase_ref(value) is not None


def create_signed_url(value: Optional[str], ttl: int = 3600) -> Optional[str]:
    """Create a short-lived URL for a private Supabase object.

    This function must run only after the caller's route-level authorization.
    The service key stays on the backend and bypasses Storage RLS; it must
    never be shipped to the mobile/web application.
    """
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
    """Yield a short-lived local path for OCR/liveness, then delete it.

    Verification libraries consume filesystem paths.  For private remote
    storage we download with the backend service key into a restrictive temp
    file and erase it immediately after the check; documents never become
    public just to make OCR work.
    """
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


def _save_s3(data: bytes, key: str) -> str:
    try:
        import boto3
    except ImportError:
        raise RuntimeError("boto3 не установлен — добавь в requirements.txt")
    s3 = boto3.client("s3", region_name=S3_REGION)
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType="image/jpeg")
    return f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{key}"


def save_image(data: bytes, category: str, ext: str = "jpg") -> str:
    """Сохраняет файл и возвращает ссылку.

    In production a missing remote-storage configuration must never silently
    fall back to the VPS disk. That fallback makes users believe documents are
    durable when they can disappear with the next server replacement.
    """
    key = _gen_key(category, ext)
    if PROVIDER == "supabase":
        if not (SUPABASE_URL and SUPABASE_KEY):
            raise RuntimeError("Supabase Storage is not configured")
        return _save_supabase(data, key)
    if PROVIDER == "s3":
        if not S3_BUCKET:
            raise RuntimeError("S3 Storage is not configured")
        return _save_s3(data, key)
    if PROVIDER != "local":
        raise RuntimeError(f"Unsupported storage provider: {PROVIDER}")
    if _PROD:
        raise RuntimeError("Local storage is disabled in production")
    return _save_local(data, key)


def get_local_path(url_or_path: str) -> Optional[str]:
    """Преобразует public URL обратно в локальный путь (для OCR/liveness).

    Public storage URLs are untrusted input. Resolve them and require the
    result to remain inside LOCAL_ROOT so encoded/explicit ``..`` segments
    cannot expose arbitrary server files.
    """
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
