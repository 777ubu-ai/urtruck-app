import inspect

from backend.api import marketplace
from backend.modules.deals.application.service import DealsBidsService


def test_all_counter_mutations_select_v2_before_legacy_sql():
    for name in ("accept_counter", "cancel_counter_as_owner", "decline_counter"):
        source = inspect.getsource(getattr(marketplace, name))
        assert "_run_deals_v2(" in source
        assert source.index("_run_deals_v2(") < source.index("with get_conn()")


def test_v2_transition_trip_adapter_is_the_old_bypass_gate():
    source = inspect.getsource(marketplace.update_trip_status)
    assert "service.transition_trip_status" in source
    assert "LIVE_DEAL_RESERVATION" not in source
    assert "_run_deals_v2(" in source


def test_v2_accept_has_no_inline_side_effect_boundary():
    source = inspect.getsource(DealsBidsService.accept_bid)
    assert "send_to_user" not in source
    assert "create_notification" not in source
    assert "chat_room" in source


def test_v2_rest_adapter_injects_canonical_chat_room_factory():
    source = inspect.getsource(marketplace._run_deals_v2)
    assert "room_factory=_v2_room_factory" in source
