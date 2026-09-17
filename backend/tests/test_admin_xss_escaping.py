"""Regression test for the admin-dashboard stored-XSS fix (Track B / B3).

Confirmed defect (pre-fix, found by the 2026-09-08 audit): backend/api/admin.py
rendered driver full_name, blacklist reason, Telegram message_text and other
attacker-controlled fields directly into `innerHTML` with no escaping. A driver
registering with full_name = "<img src=x onerror=...>" would execute arbitrary
JS inside the moderator's authenticated Basic Auth session on the next 30s
auto-refresh of the pending-review queue (renderPending()).

This test extracts the *actual* client-side esc()/safeUrl()/renderPending()
functions embedded in api.admin.HTML and executes them under Node with a
malicious payload, asserting the payload comes back HTML-entity-encoded and
is never emitted as a live tag or javascript: URL. It also statically
re-checks the other three render paths (blacklist, Telegram mentions, alerts)
still wrap every user-controlled field in esc(...) — those aren't exercised
via Node here because they're inline in load(), not standalone functions.

If this test ever needs to change because someone reworked admin.py's
rendering approach, the reviewer must confirm by hand that the replacement
still HTML-escapes every attacker-controlled field before it reaches
innerHTML — do not just relax the assertions to make it pass.
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent  # repo root
sys.path.insert(0, str(ROOT / "backend"))

from api.admin import HTML  # noqa: E402

XSS_PAYLOAD = "<img src=x onerror=alert(1)>"


def _extract_script():
    m = re.search(r"<script>(.*)</script>", HTML, re.S)
    assert m, "admin.py HTML must contain a <script> block"
    body = m.group(1)
    # Strip the page's own auto-run/auto-refresh calls (load(); +
    # setInterval(load, 30000);) — they touch document/fetch, which don't
    # exist under plain Node and would crash the harness. renderPending()
    # itself never touches document/fetch, so this is safe to drop for the
    # purpose of this test.
    # Keep the extraction independent from formatting/comments around the
    # browser-only auto-refresh bootstrap. The regression target is
    # renderPending(), not DOM/network startup.
    body = re.sub(r"^\s*load\(\);\s*$", "", body, flags=re.M)
    body = re.sub(r"^\s*setInterval\(load,\s*30000\);.*$", "", body, flags=re.M)
    return body


SCRIPT = _extract_script()


def test_esc_and_safe_url_helpers_are_defined():
    assert "function esc(" in SCRIPT
    assert "function safeUrl(" in SCRIPT


def test_render_pending_escapes_full_name_xss_payload():
    """The exact vector from the audit: a driver's own full_name field."""
    if not shutil.which("node"):
        pytest.skip("node not available in this environment")

    driver = {
        "id": "abc123",
        "full_name": XSS_PAYLOAD,
        "phone": "+70000000000",
        "iin": "000000000000",
        "vehicle_brand": "Volvo",
        "vehicle_year": "2020",
        "vehicle_plate": "A123AA",
        "vehicle_type": "tent",
        "security_score": 50,
        "security_color": "yellow",
        "manual_review_reason": XSS_PAYLOAD,
        "selfie_url": "javascript:alert(1)",  # must be dropped by safeUrl()
        "face_quality": 0.9,
        "face_match_score": 0.9,
        "verification_level": 2,
    }

    harness = f"{SCRIPT}\nconst out = renderPending({json.dumps(driver)});\nprocess.stdout.write(out);\n"
    result = subprocess.run(
        ["node", "-e", harness],
        capture_output=True, text=True, timeout=15,
    )
    assert result.returncode == 0, f"node harness failed: {result.stderr}"
    out = result.stdout

    # The raw payload must never survive as a live, executable tag.
    assert XSS_PAYLOAD not in out
    assert "<img" not in out
    # It must still be visible to the moderator, just as inert text.
    assert "&lt;img src=x onerror=alert(1)&gt;" in out
    # A javascript: URL must be dropped entirely by safeUrl(), never echoed
    # into an href/src where it could execute on click/load.
    assert "javascript:" not in out


@pytest.mark.parametrize("field", [
    "e.phone", "e.plate_number", "e.full_name", "e.reason",
    "e.source", "e.severity",
])
def test_blacklist_row_escapes_every_user_field(field):
    assert f"esc({field})" in SCRIPT, (
        f"blacklist render lost esc() around {field} — reintroduces stored XSS"
    )


@pytest.mark.parametrize("field", [
    "m.chat_name", "m.mentioned_phone", "m.mentioned_plate",
    "m.sentiment", "m.message_text",
])
def test_telegram_mentions_row_escapes_every_user_field(field):
    assert f"esc({field})" in SCRIPT, (
        f"Telegram mentions render lost esc() around {field} — reintroduces stored XSS"
    )


@pytest.mark.parametrize("field", [
    "a.alert_type", "a.severity", "a.driver_id", "a.message",
])
def test_alerts_row_escapes_every_user_field(field):
    assert f"esc({field})" in SCRIPT, (
        f"alerts render lost esc() around {field} — reintroduces stored XSS"
    )
