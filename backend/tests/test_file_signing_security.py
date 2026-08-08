"""P0-3 (08.08.2026): подпись ссылок на приватные файлы должна быть
fail-closed в production.

Раньше `_secret()` при пустом FILE_SIGNING_KEY/URTRUCK_API_SECRET возвращал
b"" и только печатал warning → HMAC-SHA256 по публично известному алгоритму
`{key}|{exp}` вычислялся кем угодно, TTL подписанных ссылок на паспорта/
права/накладные становился фикцией. Теперь:
  * production + пустой ключ  → RuntimeError (не подписываем/не проверяем);
  * production + валидный ключ → работает;
  * подделанная/просроченная/чужая подпись → verify() = False.

Run from backend/:
    python -m tests.test_file_signing_security
Exit != 0 на любой ошибке. Совместим с pytest.
"""
import importlib
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def _reload_signing(env=None, file_key=None, api_secret=None):
    """Перечитывает модуль с заданным окружением (значения читаются через
    os.getenv в _secret() на каждый вызов, но env-переменные держим явно)."""
    for k, v in (("URTRUCK_ENV", env), ("FILE_SIGNING_KEY", file_key),
                 ("URTRUCK_API_SECRET", api_secret)):
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    import services.file_signing as fs
    importlib.reload(fs)
    return fs


def test_production_missing_key_raises_on_sign():
    fs = _reload_signing(env="production", file_key=None, api_secret=None)
    raised = False
    try:
        fs.sign("/security/storage/licenses/abc.jpg")
    except RuntimeError:
        raised = True
    assert raised, "production + пустой ключ должен бросать RuntimeError на sign()"


def test_production_missing_key_raises_on_verify():
    fs = _reload_signing(env="production", file_key=None, api_secret=None)
    raised = False
    try:
        fs.verify("licenses/abc.jpg", int(time.time()) + 60, "deadbeef")
    except RuntimeError:
        raised = True
    assert raised, "production + пустой ключ должен бросать RuntimeError на verify()"


def test_production_with_key_signs_and_verifies():
    fs = _reload_signing(env="production", file_key="test-signing-key-strong-123", api_secret=None)
    signed = fs.sign("/security/storage/licenses/abc.jpg", ttl=3600)
    assert signed and "sig=" in signed and "exp=" in signed, signed
    # вытащить exp/sig и key
    from urllib.parse import urlparse, parse_qs
    q = parse_qs(urlparse(signed).query)
    exp, sig = q["exp"][0], q["sig"][0]
    key = fs.extract_key(signed)
    assert fs.verify(key, exp, sig) is True, "валидная свежая подпись должна проходить"


def test_tampered_signature_denied():
    fs = _reload_signing(env="production", file_key="test-signing-key-strong-123")
    exp = int(time.time()) + 60
    good = fs._compute_sig("licenses/abc.jpg", exp)
    tampered = ("0" if good[0] != "0" else "1") + good[1:]
    assert fs.verify("licenses/abc.jpg", exp, tampered) is False


def test_expired_url_denied():
    fs = _reload_signing(env="production", file_key="test-signing-key-strong-123")
    past = int(time.time()) - 10
    sig = fs._compute_sig("licenses/abc.jpg", past)
    assert fs.verify("licenses/abc.jpg", past, sig) is False, "просроченная подпись не должна проходить"


def test_wrong_key_signature_denied():
    """Подпись, сделанную ключом A, нельзя проверить под ключом B — то есть
    злоумышленник без секрета не подделает валидную ссылку."""
    fs_a = _reload_signing(env="production", file_key="key-A-secret")
    exp = int(time.time()) + 60
    sig_a = fs_a._compute_sig("licenses/abc.jpg", exp)
    fs_b = _reload_signing(env="production", file_key="key-B-different")
    assert fs_b.verify("licenses/abc.jpg", exp, sig_a) is False


def test_dev_empty_key_does_not_raise():
    """Вне production пустой ключ не должен ронять локальную разработку/тесты
    (только warning) — иначе dev/CI без секрета не поднимется."""
    fs = _reload_signing(env=None, file_key=None, api_secret=None)
    # не бросает
    _ = fs.sign("/security/storage/licenses/abc.jpg")
    assert fs.signing_key_configured() is False


if __name__ == "__main__":
    fails = 0
    for fn in [test_production_missing_key_raises_on_sign,
               test_production_missing_key_raises_on_verify,
               test_production_with_key_signs_and_verifies,
               test_tampered_signature_denied,
               test_expired_url_denied,
               test_wrong_key_signature_denied,
               test_dev_empty_key_does_not_raise]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    # вернуть окружение в чистое состояние
    for k in ("URTRUCK_ENV", "FILE_SIGNING_KEY", "URTRUCK_API_SECRET"):
        os.environ.pop(k, None)
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
