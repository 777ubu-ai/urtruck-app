from backend.infrastructure.feature_flags import deals_v2_enabled
from backend.infrastructure.outbox.worker import OutboxWorker
from backend.modules.deals.domain.fsm import decide_transition


def test_deals_v2_is_off_by_default(monkeypatch):
    monkeypatch.delenv("DEALS_V2_ENABLED", raising=False)
    assert deals_v2_enabled() is False


def test_fsm_decision_is_conservative():
    assert decide_transition("accepted", "in_progress").allowed
    assert not decide_transition("accepted", "completed").allowed
    assert decide_transition("accepted", "accepted").reason == "idempotent"


def test_outbox_retry_is_exponential_and_bounded():
    assert OutboxWorker.retry_delay(1) == 1
    assert OutboxWorker.retry_delay(3) == 4
    assert OutboxWorker.retry_delay(99) == 3600
