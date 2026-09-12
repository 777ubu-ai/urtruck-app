"""Push/Outbox/Localization repair (2026-09-11).

Covers the three root causes this track fixed, against the REAL functions
and a real (temp) SQLite DB — not source-regex:

  1. Localization (item 4): push_text() renders correctly in all 4
     supported locales for a representative event; send_to_devices()
     localizes PER DEVICE using that device's own push_devices.locale, not
     a single value picked for the whole user; a device whose ONLY
     registration predates push_devices (the "no locale info available at
     all" case that used to always silently default to RU) gets
     auto-migrated into push_devices by the legacy fallback so the NEXT
     send for it is locale-capable.

  2. Retry/backoff classification (item 2/3): a permanently-failing
     provider (FCM with no real credentials — "FCM mode = MOCK" in
     runtime terms) now goes straight to 'dead' instead of burning all
     MAX_OUTBOX_ATTEMPTS of exponential backoff first; a genuinely
     transient failure (Expo rate-limiting, or any error code Expo has
     not documented as permanent) still retries exactly as before.

  3. FCM diagnostic reporting (item 3): services.push_sender.info()'s
     native.fcm.mode reflects the REAL gateway (push_gateway.FCMProvider,
     HTTP v1 / OAuth2 service account) configured-state, not the dead
     legacy FCM_SERVER_KEY/FCM Legacy HTTP API flag (shut down by Google
     in June 2024, unreachable in production regardless of this env var).

CI contract: top-level `def test_*` (not a class) — see other push test
files in this directory for why.
"""
import os
import sys
import uuid
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_localization.db")
if not os.environ.get("URTRUCK_TEST_HARNESS_OWNS_DB"):
    Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database import registration_dal as reg_dal

ddb.init_db()
reg_dal.init_registration_schema()

from database.db import get_conn
from services import push_gateway, push_sender
from services.push_i18n import push_text, normalize_locale, SUPPORTED_LOCALES
import api.push as push_api  # noqa: F401 — import runs _init_schema() (push_outbox etc.)


def _new_user():
    guest = reg_dal.create_guest()
    return guest["id"] if isinstance(guest, dict) else guest


def _add_device(uid, locale=None, provider="expo", platform="android"):
    token = f"ExponentPushToken[{uuid.uuid4().hex}]"
    device_id = uuid.uuid4().hex
    with get_conn() as c:
        c.execute(
            "INSERT INTO push_devices (user_id, device_id, platform, push_provider, push_token, locale, enabled) "
            "VALUES (?,?,?,?,?,?,1)",
            (uid, device_id, platform, provider, token, locale),
        )
    return token, device_id


def _always_ok(tokens, title, body, data, badge=None):
    return {"sent": len(tokens), "tickets": [{"status": "ok", "id": f"t-{i}"} for i in range(len(tokens))]}


# ───────────────────────── 1. Localization ─────────────────────────

def test_01_push_text_covers_all_four_supported_locales():
    assert set(SUPPORTED_LOCALES) == {"RU", "KK", "ZH", "EN"}
    seen_titles = set()
    for loc in SUPPORTED_LOCALES:
        title, body = push_text("bid_accepted", loc, amount="$100")
        assert title and body, f"locale {loc} produced empty text"
        assert "$100" in body
        seen_titles.add(title)
    assert len(seen_titles) == 4, "all four locales must render genuinely different text, not one reused for all"


def test_02_normalize_locale_maps_bcp47_variants_correctly():
    cases = {
        "ru-RU": "RU", "RU": "RU",
        "kk": "KK", "kk-KZ": "KK", "KZ": "KK",
        "zh-Hans-CN": "ZH", "zh": "ZH", "CN": "ZH",
        "en-US": "EN", "en": "EN",
        "fr-FR": "RU", None: "RU", "": "RU",  # unsupported/missing -> explicit default, not silent EN/garbage
    }
    for raw, expected in cases.items():
        assert normalize_locale(raw) == expected, f"{raw!r} -> expected {expected}, got {normalize_locale(raw)}"


def test_03_send_to_devices_localizes_per_device_not_per_user():
    """The actual regression this track fixes: two devices for the SAME
    user with DIFFERENT locales must each get their OWN device's language
    — never one language picked globally and applied to both."""
    uid = _new_user()
    _add_device(uid, locale="KK")
    _add_device(uid, locale="ZH")
    delivered = []

    def capture(tokens, title, body, data, badge=None):
        delivered.append((title, body))
        return _always_ok(tokens, title, body, data, badge)

    result = push_gateway.send_to_devices(
        uid, "fallback title", "fallback body",
        {"i18n_event": "bid_accepted", "i18n_params": {"amount": "$50"}},
        badge=0, expo_send_one=capture,
    )
    assert result["sent"] == 2
    titles = {t for t, _ in delivered}
    kk_title, _ = push_text("bid_accepted", "KK", amount="$50")
    zh_title, _ = push_text("bid_accepted", "ZH", amount="$50")
    assert kk_title in titles, f"KK device did not get KK text: {delivered}"
    assert zh_title in titles, f"ZH device did not get ZH text: {delivered}"
    assert kk_title != zh_title


def test_04_get_recipient_locale_reads_the_users_own_device():
    uid = _new_user()
    _add_device(uid, locale="KK")
    assert push_gateway.get_recipient_locale(uid) == "KK"


def test_05_get_recipient_locale_defaults_only_when_truly_no_data():
    uid = _new_user()  # no device registered at all
    assert push_gateway.get_recipient_locale(uid) == "RU", (
        "the documented DEFAULT_LOCALE is an explicit, named fallback for "
        "the zero-data case — not an accidental one"
    )


def test_06_legacy_only_device_is_backfilled_into_push_devices():
    """Root cause of 'device locale = KK but push arrived RU': a token
    whose ONLY registration predates push_devices (this test's stand-in
    for that historical state) has literally no locale column to read —
    get_recipient_locale() correctly (and unavoidably) falls back to
    DEFAULT_LOCALE for THIS send. What must not happen is this staying
    permanent: _send_native_legacy() must migrate the token into
    push_devices so every SUBSEQUENT send for it goes through the real,
    per-device-locale-aware gateway path instead of repeating this blind
    spot forever."""
    uid = _new_user()
    token = f"ExponentPushToken[{uuid.uuid4().hex}]"
    with get_conn() as c:
        c.execute(
            "INSERT INTO push_tokens_native (user_id, token, provider, platform) VALUES (?,?,?,?)",
            (uid, token, "expo", "android"),
        )
    assert push_gateway.active_devices(uid) == [], "precondition: nothing in push_devices yet"

    import services.push_sender as ps
    real_send_expo = ps._send_expo
    ps._send_expo = lambda tokens, title, body, data, badge=None: len(tokens)
    try:
        sent, total = ps._send_native_legacy(uid, "T", "B", {})
    finally:
        ps._send_expo = real_send_expo
    assert (sent, total) == (1, 1)

    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM push_devices WHERE user_id = ? AND push_token = ?", (uid, token)
        ).fetchone()
    assert row is not None, "the legacy-only token must be backfilled into push_devices after being used"
    assert row["push_provider"] == "expo"


def test_07_push_sender_info_reports_real_gateway_fcm_state_not_dead_legacy_flag():
    """This is the exact diagnostic the task's runtime observation ('FCM
    mode = MOCK') was read from. It must answer 'is the gateway actually
    configured' (push_gateway.info()['fcm']['configured']), not the
    legacy FCM_SERVER_KEY flag that gates code no longer reachable in
    normal operation and talks to an API Google shut down in June 2024."""
    info = push_sender.info()
    gateway_configured = bool(info["native"]["gateway"]["fcm"]["configured"])
    assert info["native"]["fcm"]["mode"] == ("REAL" if gateway_configured else "MOCK")
    # The dead legacy flag is still surfaced (transparency), just no longer
    # the thing "mode" answers with.
    assert "legacy_fcm_server_key_set" in info["native"]["fcm"]


# ───────────────────────── 2. Retry/backoff classification ─────────────────────────

def _make_fcm_user_unconfigured():
    """FCM_PROJECT_ID/credentials are unset in this test process (matches
    real "FCM mode = MOCK" — no service account configured) — this device
    is therefore guaranteed provider_not_configured on every attempt,
    exactly like the runtime state under investigation."""
    uid = _new_user()
    _add_device(uid, provider="fcm", platform="android")
    return uid


def test_08_permanently_unconfigured_fcm_goes_dead_on_first_attempt():
    # Matches the runtime state under investigation (gateway.mode = dual) —
    # in the test env's own default ("expo", no PUSH_PROVIDER_MODE set) an
    # fcm-provider device would be filtered out before ever being attempted
    # at all, which is a different (and already-correct) code path from the
    # one this test exists to prove.
    real_mode = push_gateway.PUSH_PROVIDER_MODE
    push_gateway.PUSH_PROVIDER_MODE = "dual"
    try:
        uid = _make_fcm_user_unconfigured()
        ek = f"evt-fcm-perm-{uuid.uuid4().hex}"
        push_gateway.enqueue_event(ek, "test.event", uid, {"title": "T", "body": "B", "data": {}})
        stats = push_gateway.process_pending_once(_always_ok, limit=10)
    finally:
        push_gateway.PUSH_PROVIDER_MODE = real_mode
    assert stats["dead"] == 1, f"an unconfigured provider must not retry: {stats}"
    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM push_outbox WHERE event_id=? AND recipient_user_id=?", (ek, uid)
        ).fetchone()
    assert row["status"] == "dead"
    assert row["attempt_count"] == 1, "must go dead on the FIRST attempt, not after burning the full backoff ladder"
    assert "permanent" in (row["last_error"] or "")


def test_09_transient_expo_failure_still_retries_with_backoff():
    """Regression guard for the fix itself: making the ladder respect
    `retryable` must not turn EVERY failure into an immediate dead — Expo
    rate-limiting (or any code not on the documented-permanent list) must
    keep its existing bounded-backoff behavior."""
    uid = _new_user()
    _add_device(uid, provider="expo")
    ek = f"evt-expo-transient-{uuid.uuid4().hex}"
    push_gateway.enqueue_event(ek, "test.event", uid, {"title": "T", "body": "B", "data": {}})

    def rate_limited(tokens, title, body, data, badge=None):
        return {"sent": 0, "tickets": [{"status": "error", "details": {"error": "MessageRateExceeded"}}]}

    stats = push_gateway.process_pending_once(rate_limited, limit=10)
    assert stats["failed"] == 1, f"a transient Expo error must retry, not go dead: {stats}"
    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM push_outbox WHERE event_id=? AND recipient_user_id=?", (ek, uid)
        ).fetchone()
    assert row["status"] == "pending"
    assert row["attempt_count"] == 1


def test_10_expo_device_not_registered_is_classified_permanent():
    """Expo's own documented permanent error code must skip the backoff
    ladder too, symmetric to the FCM case."""
    uid = _new_user()
    _add_device(uid, provider="expo")
    ek = f"evt-expo-dnr-{uuid.uuid4().hex}"
    push_gateway.enqueue_event(ek, "test.event", uid, {"title": "T", "body": "B", "data": {}})

    def device_not_registered(tokens, title, body, data, badge=None):
        return {"sent": 0, "tickets": [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]}

    stats = push_gateway.process_pending_once(device_not_registered, limit=10)
    assert stats["dead"] == 1
    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM push_outbox WHERE event_id=? AND recipient_user_id=?", (ek, uid)
        ).fetchone()
    assert row["attempt_count"] == 1


def test_11_mixed_devices_one_permanent_one_retryable_keeps_retrying():
    """A row is only allowed to skip straight to dead when EVERY
    undelivered device this attempt touched was permanently unreachable —
    if even one device might still succeed on retry, the row must keep
    its normal backoff, so that device is not abandoned."""
    real_mode = push_gateway.PUSH_PROVIDER_MODE
    push_gateway.PUSH_PROVIDER_MODE = "dual"  # so the fcm device is actually attempted — see test_08
    uid = _new_user()
    _add_device(uid, provider="fcm")   # permanently unconfigured
    _add_device(uid, provider="expo")  # will succeed
    ek = f"evt-mixed-{uuid.uuid4().hex}"
    push_gateway.enqueue_event(ek, "test.event", uid, {"title": "T", "body": "B", "data": {}})

    try:
        stats = push_gateway.process_pending_once(_always_ok, limit=10)
    finally:
        push_gateway.PUSH_PROVIDER_MODE = real_mode
    # The Expo device succeeds, the FCM device fails permanently -> not
    # fully delivered, but NOT "all permanent" either (one delivered) ->
    # normal retry, never abandoned outright as 'dead' on attempt 1.
    assert stats["failed"] == 1, stats
    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM push_outbox WHERE event_id=? AND recipient_user_id=?", (ek, uid)
        ).fetchone()
    assert row["status"] == "pending"
