"""Native providers do not use Expo receipt polling."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def test_receipt_polling_is_not_part_of_native_runtime():
    gateway = (ROOT / "backend/services/push_gateway.py").read_text(encoding="utf-8")
    sender = (ROOT / "backend/services/push_sender.py").read_text(encoding="utf-8")
    assert "poll_pending_receipts" not in gateway
    assert "ExpoPushProvider" not in gateway
    assert "_send_expo" not in sender
