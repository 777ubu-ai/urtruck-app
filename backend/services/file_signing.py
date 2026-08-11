"""Подпись ссылок на приватные файлы storage (signed URLs).

Зачем: документы водителя (права/селфи/техпаспорт/личное фото) и вложения
чата лежат в локальном storage. RN `<Image>` не умеет слать `Authorization`,
поэтому доступ авторизуем не заголовком, а **подписанной ссылкой** с TTL:

    /security/storage/<key>?exp=<unixts>&sig=<hmac_sha256(secret, "<key>|<exp>")>

Подпись ставится ТОЛЬКО на выходе (в ответе авторизованному владельцу или
админу под Basic Auth). В БД хранится сырой путь без подписи. Кастомный роут
`GET /storage/{path}` (см. main.py) проверяет exp+sig и отдаёт файл, иначе 403.

Секрет: только env `FILE_SIGNING_KEY`. Без отдельного ключа сервис работает
в fail-closed режиме: новые подписанные ссылки не создаются, а существующие
не проходят проверку. Нельзя использовать общий API-секрет и тем более
пустую строку как ключ подписи документов.
"""
import hashlib
import hmac
import os
import time
from typing import Optional

from services import storage_service

class FileSigningConfigurationError(RuntimeError):
    """Подписывание файлов запрещено, пока не задан отдельный сильный ключ."""


def is_configured() -> bool:
    """Есть ли отдельный ключ для HMAC-подписей файлов."""
    # HMAC technically permits short keys, but a production key shorter than
    # 32 bytes is not an acceptable replacement for a randomly generated one.
    return len(os.getenv("FILE_SIGNING_KEY", "").encode("utf-8")) >= 32


def _secret() -> bytes:
    """Возвращает отдельный ключ или останавливает операцию безопасно."""
    if not is_configured():
        raise FileSigningConfigurationError(
            "FILE_SIGNING_KEY is required and must be at least 32 bytes"
        )
    return os.environ["FILE_SIGNING_KEY"].encode("utf-8")


def _storage_prefixes():
    """Известные публичные префиксы локального storage (prod /security/storage,
    dev /storage), включая текущий LOCAL_PUBLIC_BASE."""
    seen, out = set(), []
    for p in (storage_service.LOCAL_PUBLIC_BASE, "/security/storage", "/storage"):
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return out


def is_local_storage_path(url_or_key: Optional[str]) -> bool:
    """True только для ссылок нашего локального storage (начинаются с одного из
    публичных префиксов). Всё прочее — http(s) supabase/s3, data:/file: URI,
    пустое — НЕ наш storage и подписываться не должно (иначе испортим значение)."""
    if not url_or_key:
        return False
    s = str(url_or_key).split("?", 1)[0]
    return any(s.startswith(p) for p in _storage_prefixes())


def extract_key(url_or_key: Optional[str]) -> Optional[str]:
    """Достаёт относительный ключ storage ('licenses/abc.jpg') из ссылки нашего
    локального storage. Для не-storage значений (http/data/file/пусто) возвращает
    вход без изменений — вызывающий код проверяет is_local_storage_path()."""
    if not url_or_key:
        return url_or_key
    s = str(url_or_key).split("?", 1)[0]
    for prefix in _storage_prefixes():
        if s.startswith(prefix):
            return s[len(prefix):].lstrip("/")
    return url_or_key


def _compute_sig(key: str, exp: int) -> str:
    msg = f"{key}|{exp}".encode("utf-8")
    return hmac.new(_secret(), msg, hashlib.sha256).hexdigest()


def sign(url_or_key: Optional[str], ttl: int = 86400) -> Optional[str]:
    """Подписывает ссылку нашего локального storage и возвращает публичный
    подписанный путь '<PUBLIC_BASE>/<key>?exp=<ts>&sig=<hmac>'.

    Значения, которые НЕ являются локальным storage (пусто, http/https
    supabase/s3, data:/file: URI, произвольные строки), возвращаются БЕЗ
    изменений — чтобы случайно не испортить внешние ссылки/вложения."""
    # Supabase objects stay private too.  The stored `supabase://` reference
    # is opaque; a short-lived URL is minted only inside an already-authorized
    # endpoint (profile, chat or admin).  Do not change arbitrary http(s)
    # values, because legacy external links are not our storage.
    if storage_service.is_private_remote_ref(url_or_key):
        return storage_service.create_signed_url(url_or_key, ttl)
    if not is_local_storage_path(url_or_key):
        return url_or_key
    key = extract_key(url_or_key)
    if not key:
        return url_or_key
    # The chat polls its history every few seconds. Previously each response
    # contained a new `?exp=…&sig=…`, so React Native treated one unchanged
    # photo as a new source and visibly reloaded it. Keep the private signed
    # URL stable in a short time window while preserving at least the requested
    # TTL. The object itself remains inaccessible without this signature.
    now = int(time.time())
    window = min(900, max(60, int(ttl)))
    exp = ((now + int(ttl) + window - 1) // window) * window
    sig = _compute_sig(key, exp)
    base = storage_service.LOCAL_PUBLIC_BASE.rstrip("/")
    return f"{base}/{key}?exp={exp}&sig={sig}"


def verify(key: str, exp, sig: Optional[str]) -> bool:
    """Проверяет подпись файла: HMAC совпал (constant-time) и срок не истёк."""
    if not sig or exp is None:
        return False
    try:
        exp_i = int(exp)
    except (TypeError, ValueError):
        return False
    if exp_i < int(time.time()):
        return False
    try:
        expected = _compute_sig(str(key), exp_i)
    except FileSigningConfigurationError:
        return False
    return hmac.compare_digest(expected, str(sig))
