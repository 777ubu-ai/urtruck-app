from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / "services" / "push_gateway.py"


def test_outbox_cutoff_is_read_only_and_applies_to_pending_selection():
    text = SOURCE.read_text(encoding="utf-8")
    assert "PUSH_OUTBOX_CUTOFF_ID" in text
    assert "def configured_outbox_cutoff_id" in text
    assert "WHERE status IN ('pending','retry') AND id > ?" in text
    assert "configured_outbox_cutoff_id(), bounded_limit" in text


def test_malformed_cutoff_falls_back_without_mutating_rows():
    text = SOURCE.read_text(encoding="utf-8")
    assert "except ValueError:" in text
    assert "return 0" in text
    assert "UPDATE push_outbox SET status='retry'" in text
