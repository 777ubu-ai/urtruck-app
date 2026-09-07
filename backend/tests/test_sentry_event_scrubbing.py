"""Regression tests: Sentry telemetry payload не содержит raw секретов.

Root-cause guard RC-20260907: FastApiIntegration прикладывает request
headers/body/exception strings к Sentry event; до фикса ни один слой не
вычищал Authorization/Cookie/refresh_token из telemetry payload.
`sentry_scrub_event` (before_send) обязан редactить событие целиком тем
же контрактом, что и логи. Все значения в тестах синтетические.
"""
from security.log_redaction import sentry_scrub_event


def _assert_no_secret_leak(obj, needles):
    """Рекурсивно проверяет, что ни одна строка в объекте не содержит needles."""
    if isinstance(obj, dict):
        for v in obj.values():
            _assert_no_secret_leak(v, needles)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _assert_no_secret_leak(v, needles)
    elif isinstance(obj, str):
        for n in needles:
            assert n not in obj, f"secret leaked into telemetry: {n!r} in {obj!r}"


def test_sentry_event_headers_scrubbed():
    event = {
        "request": {
            "headers": {
                "Authorization": "Bearer synthetic-sentry-token-aaaa1111",
                "Cookie": "session=synthetic-sentry-cookie-bbbb2222",
                "User-Agent": "pytest",
            },
            "data": {"refresh_token": "synthetic-refresh-cccc3333", "ok": 1},
        }
    }
    out = sentry_scrub_event(event, None)
    assert out["request"]["headers"]["Authorization"] == "***"
    assert out["request"]["headers"]["Cookie"] == "***"
    assert out["request"]["data"]["refresh_token"] == "***"
    assert out["request"]["headers"]["User-Agent"] == "pytest"
    assert out["request"]["data"]["ok"] == 1
    _assert_no_secret_leak(out, [
        "synthetic-sentry-token", "synthetic-sentry-cookie", "synthetic-refresh",
    ])


def test_sentry_event_exception_strings_scrubbed():
    event = {
        "exception": {
            "values": [{
                "type": "HTTPError",
                "value": "401 calling provider with Bearer syntheticsentrydddd4444eeee",
            }]
        },
        "breadcrumbs": {
            "values": [{
                "message": "refresh via token=synthetic-crumb-ffff5555",
                "data": {"access_token": "synthetic-crumb-token-6666"},
            }]
        },
    }
    out = sentry_scrub_event(event, None)
    _assert_no_secret_leak(out, [
        "syntheticsentry", "synthetic-crumb",
    ])


def test_sentry_event_scrub_failure_drops_event(monkeypatch):
    """Fail-safe: если скраббер падает — событие дропается, секрет не уходит."""
    import security.log_redaction as lr

    def _boom(_):
        raise RuntimeError("synthetic scrub failure")

    monkeypatch.setattr(lr, "redact", _boom)
    assert sentry_scrub_event({"token": "synthetic-drop-me-7777"}, None) is None


def test_sentry_event_without_secrets_preserved():
    event = {"message": "deal accepted", "tags": {"deal": "42"}, "level": "info"}
    out = sentry_scrub_event(event, None)
    assert out["message"] == "deal accepted"
    assert out["tags"]["deal"] == "42"
    assert out["level"] == "info"
