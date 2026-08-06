"""Storage service — локальный FS (default) + Supabase/S3 (optional).

Provider выбирается через env STORAGE_PROVIDER=local|supabase|s3.
"""
import os
import re
import tempfile
import uuid
from pathlib import Path
from typing import Optional

import httpx

PROVIDER = os.getenv("STORAGE_PROVIDER", "local")

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
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{key}"


def _save_s3(data: bytes, key: str) -> str:
    try:
        import boto3
    except ImportError:
        raise RuntimeError("boto3 не установлен — добавь в requirements.txt")
    s3 = boto3.client("s3", region_name=S3_REGION)
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType="image/jpeg")
    return f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{key}"


def save_image(data: bytes, category: str, ext: str = "jpg") -> str:
    """Сохраняет изображение и возвращает публичный URL."""
    key = _gen_key(category, ext)
    if PROVIDER == "supabase" and SUPABASE_URL and SUPABASE_KEY:
        return _save_supabase(data, key)
    if PROVIDER == "s3" and S3_BUCKET:
        return _save_s3(data, key)
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
