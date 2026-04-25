"""Отправка webhook в основное приложение."""
import httpx
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config


def send_score_updated(user_id: str, score: int, color: str, components: dict):
    """Webhook: scoring обновлён."""
    payload = {
        "event": "score_updated",
        "user_id": user_id,
        "total_score": score,
        "color_code": color,
        "details": components,
    }
    try:
        httpx.post(config.APP_WEBHOOK_URL, json=payload, timeout=5.0)
    except Exception as e:
        print(f"[push_sender] webhook failed: {e}")


def send_security_alert(severity: str, driver_id: str, message: str, source: str = ""):
    payload = {
        "event": "security_alert",
        "severity": severity,
        "driver_id": driver_id,
        "message": message,
        "source": source,
        "action_required": severity in ("high", "critical"),
    }
    try:
        httpx.post(config.APP_WEBHOOK_URL, json=payload, timeout=5.0)
    except Exception as e:
        print(f"[push_sender] webhook failed: {e}")
