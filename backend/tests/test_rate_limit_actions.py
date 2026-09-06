import pytest

from api import rate_limit


def test_expensive_action_limit_has_stable_retry_contract(monkeypatch):
    rate_limit._store.clear()
    monkeypatch.setenv("URTRUCK_RATE_TRANSLATION_MAX", "1")
    rate_limit.limit_action("translation", "user-a", 60)
    with pytest.raises(rate_limit.HTTPException) as exc:
        rate_limit.limit_action("translation", "user-a", 60)
    assert exc.value.status_code == 429
    assert exc.value.headers["Retry-After"]


def test_action_limits_are_isolated_by_user():
    rate_limit._store.clear()
    for user_id in ("user-a", "user-b"):
        rate_limit.limit_action(f"unit_{user_id}", user_id, 1)
