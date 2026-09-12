"""I18N-16 (2026-09-12/13): push locale defaults, against the REAL functions
and a real (temp) SQLite DB — not source-regex.

Covers exactly the push-side surface this track's DEFAULT_LOCALE RU→EN
change touches:

  - push_text() renders correctly in all 16 supported locales (expanded
    from 4) for a representative event.
  - normalize_locale() maps BCP-47 variants to the right 2-letter code,
    and falls back to the new default (EN, never RU) for anything
    unsupported/missing.
  - send_to_devices() localizes PER DEVICE using that device's own
    push_devices.locale, not one value picked for the whole user.
  - get_recipient_locale() reads the user's own device locale, and
    defaults to EN (never RU) only when there is truly no data at all.

Split out of tests/test_push_localization_and_retry_classification.py
(review PR #357, item 2 — that file's OTHER two root causes, retry/backoff
classification and FCM diagnostic reporting, are a separate, already-
existing "Push/Outbox/Localization repair (2026-09-11)" track that
predates and is unrelated to i18n-16; this PR (feat/push-default-locale-
en-*) isolates ONLY the DEFAULT_LOCALE RU→EN change, so only the tests
that actually exercise that change belong here).

CI contract: top-level `def test_*` (not a class) — see other push test
files in this directory for why.
"""
import os
import sys
import uuid
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_i18n_locale_defaults.db")
if not os.environ.get("URTRUCK_TEST_HARNESS_OWNS_DB"):
    Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database import registration_dal as reg_dal

ddb.init_db()
reg_dal.init_registration_schema()

from database.db import get_conn
from services import push_gateway
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


def test_01_push_text_covers_all_sixteen_supported_locales():
    # I18N-16 (2026-09-12): expanded from 4 to 16 supported locales
    # (feat/claude-i18n-16-locales-20260912) — SUPPORTED_LOCALES now
    # mirrors src/utils/localeRegistry.js exactly.
    assert set(SUPPORTED_LOCALES) == {
        "RU", "EN", "ZH", "KK", "UZ", "KY", "TG", "DE",
        "FR", "PL", "LT", "LV", "IT", "TR", "BE", "RO",
    }
    seen_titles = set()
    for loc in SUPPORTED_LOCALES:
        title, body = push_text("bid_accepted", loc, amount="$100")
        assert title and body, f"locale {loc} produced empty text"
        assert "$100" in body
        seen_titles.add(title)
    assert len(seen_titles) == 16, "all sixteen locales must render genuinely different text, not one reused for all"


def test_02_normalize_locale_maps_bcp47_variants_correctly():
    cases = {
        "ru-RU": "RU", "RU": "RU",
        "kk": "KK", "kk-KZ": "KK", "KZ": "KK",
        "zh-Hans-CN": "ZH", "zh": "ZH", "CN": "ZH",
        "en-US": "EN", "en": "EN",
        # I18N-16 (2026-09-12): 'fr-FR' used to be an "unsupported"
        # example (French wasn't a supported locale yet) — it is now a
        # real supported locale (FR), so it moved out of the
        # unsupported/missing group below. DEFAULT_LOCALE itself changed
        # from RU to EN in the same track (never silently fall back to
        # Russian for an international user — i18n expansion spec item 2).
        "fr-FR": "FR", "fr": "FR",
        "de-CH": "DE",  # a region subtag never drives the mapping alone (item 9) — resolves via the 'de' base subtag
        None: "EN", "": "EN", "xx-unsupported": "EN",  # truly unsupported/missing -> explicit EN default, never RU
    }
    for raw, expected in cases.items():
        assert normalize_locale(raw) == expected, f"{raw!r} -> expected {expected}, got {normalize_locale(raw)}"


def test_03_send_to_devices_localizes_per_device_not_per_user():
    """Two devices for the SAME user with DIFFERENT locales must each get
    their OWN device's language — never one language picked globally and
    applied to both."""
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
    # I18N-16 (2026-09-12): DEFAULT_LOCALE changed from RU to EN — a real
    # international user must never see Russian just because their
    # device reported no locale at all (i18n expansion spec item 2).
    assert push_gateway.get_recipient_locale(uid) == "EN", (
        "the documented DEFAULT_LOCALE is an explicit, named fallback for "
        "the zero-data case (EN, never RU) — not an accidental one"
    )
