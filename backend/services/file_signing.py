"""Подпись ссылок на приватные файлы storage (signed URLs).

Зачем: документы водителя (права/селфи/техпаспорт/личное фото) и вложения
чата лежат в локальном storage. RN `<Image>` не умеет слать `Authorization`,
поэтому доступ авторизуем не заголовком, а **подписанной ссылкой** с TTL:

    /security/storage/<key>?exp=<unixts>&sig=<hmac_sha256(secret, "<key>|<exp>")>

Подпись ставится ТОЛЬКО на выходе (в ответе авторизованному владельцу или
админу под Basic Auth). В БД хранится сырой путь без подписи. Кастомный роут
`GET /storage/{path}` (см. main.py) проверяет exp+sig и отдаёт файл, иначе 403.

Секрет: env `FILE_SIGNING_KEY`, fallback `URTRUCK_API_SECRET`. Не хардкодим —
если оба пусты, подпись формально работает (пустой ключ), но это небезопасно:
логируем предупреждение один раз, чтобы это было заметно в проде.
"""
import hashlib
import hmac
import os
import time
from typing import Optional

from services import storage_service

_warned_no_secret = False


def _secret() -> bytes:
    """Секрет подписи. FILE_SIGNING_KEY → URTRUCK_API_SECRET → пусто (+warn)."""
    global _warned_no_secret
    key = os.getenv("FILE_SIGNING_KEY") or os.getenv("URTRUCK_API_SECRET") or ""
    if not key and not _warned_no_secret:
        print("[file_signing] ВНИМАНИЕ: FILE_SIGNING_KEY/URTRUCK_API_SECRET не "
              "заданы — подписи файлов небезопасны. Задайте FILE_SIGNING_KEY.",
              flush=True)
        _warned_no_secret = True
    return key.encode("utf-8")


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
    if not is_local_storage_path(url_or_key):
        return url_or_key
    key = extract_key(url_or_key)
    if not key:
        return url_or_key
    exp = int(time.time()) + int(ttl)
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
    expected = _compute_sig(str(key), exp_i)
    return hmac.compare_digest(expected, str(sig))
