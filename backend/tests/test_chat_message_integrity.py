"""QA release-pass regression (chat track): content integrity, ordering and
pagination for GET /chat/messages and POST /chat/send.

Covers, against the real chat.py functions (same direct-call harness as
test_deal_rooms.py — send_message()/get_messages() called directly, bypassing
FastAPI's Depends layer by passing `user=` explicitly):

  1. Message text round-trips byte-for-byte through persist+fetch for RU,
     ZH, EN, KK, emoji, multiline and long text — no silent truncation,
     mangling or drop. sender_id/room_id/mine/created_at are all correct on
     read-back.
  2. Canonical ordering (created_at then id, see chat.py get_messages'
     "P3: tiebreak по id" comment) survives pagination: no message appears
     on two pages, no message is skipped, and the reassembled multi-page
     order matches a single full-history fetch.
  3. Re-fetching the same page twice ("reload") returns byte-identical
     ordering and content — reading is idempotent, not just insertion.
"""
import os
import uuid
from pathlib import Path

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_chat_message_integrity.db")
if not os.environ.get("URTRUCK_TEST_HARNESS_OWNS_DB"):
    Path(os.environ["DB_PATH"]).unlink(missing_ok=True)

from database import db as dbm
from database import registration_dal
dbm.init_db()
registration_dal.init_registration_schema()

from database.db import get_conn
from api.chat import get_or_create_deal_room, send_message, get_messages, SendMessageIn


def _u(uid):
    return {"id": uid, "full_name": uid, "phone": "+7" + uid[:6]}


def _mk_users(*uids):
    with get_conn() as c:
        for u in uids:
            try:
                c.execute("INSERT INTO drivers_registration (id, full_name, phone) VALUES (?,?,?)",
                          (u, u, "+7" + u[:6]))
            except Exception:
                pass


def _mk_accepted_deal(cargo, owner, driver, room):
    deal_id = "deal_" + uuid.uuid4().hex[:8]
    with get_conn() as c:
        c.execute(
            "INSERT INTO deals (id, cargo_id, trip_id, bid_id, shipper_id, driver_id, "
            "from_city, to_city, amount, status, chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (deal_id, cargo, None, "bid_" + uuid.uuid4().hex[:8], owner, driver,
             "Almaty", "Astana", 1000, "accepted", room),
        )
    return deal_id


def _setup_room():
    o, d = "own_" + uuid.uuid4().hex[:6], "drv_" + uuid.uuid4().hex[:6]
    cargo = "cg_" + uuid.uuid4().hex[:6]
    _mk_users(o, d)
    room = get_or_create_deal_room(cargo, o, d)
    deal_id = _mk_accepted_deal(cargo, o, d, room)
    return room, o, d, deal_id


# ─────────────────── 1. multilingual / emoji / multiline / long text ───────

SAMPLE_TEXTS = {
    "ru": "Привет! Когда сможете загрузиться? Адрес: г. Алматы, ул. Абая, 150.",
    "zh": "你好！货物什么时候能装车？地址：阿拉木图市阿拜街150号。",
    "en": "Hello! When can you load? Address: 150 Abay St, Almaty.",
    "kk": "Сәлеметсіз бе! Жүкті қашан тиейсіз? Мекенжай: Алматы қ., Абай көш., 150.",
    "emoji": "🚛💨 ОК 👍 еду 🇰🇿→🇨🇳 груз готов 📦✅",
    "multiline": "Строка 1: адрес погрузки\nСтрока 2: контакт +7 700 000 00 00\n\nСтрока 4 после пустой",
    "long": "A" * 4000 + " конец " + "Б" * 4000,
}


def test_multilingual_emoji_multiline_long_text_round_trip():
    room, o, d, deal_id = _setup_room()
    sent_ids = {}
    for key, text in SAMPLE_TEXTS.items():
        result = send_message(
            SendMessageIn(room_id=room, text=text, client_msg_id=f"integrity-{key}"),
            user=_u(d),
        )
        assert result["ok"] is True, f"{key} send failed: {result}"
        sent_ids[key] = result["message_id"]

    fetched = get_messages(room, user=_u(o))["messages"]
    by_id = {m["id"]: m for m in fetched}

    for key, text in SAMPLE_TEXTS.items():
        mid = sent_ids[key]
        assert mid in by_id, f"{key} message (id={mid}) missing from fetch — silent drop"
        row = by_id[mid]
        assert row["text"] == text, f"{key} text mangled: {row['text']!r} != {text!r}"
        assert row["room_id"] == room
        assert row["sender_id"] == d
        assert row["mine"] is False  # fetched as the OTHER participant (o)
        assert row["created_at"]


def test_sender_perspective_mine_flag_correct():
    room, o, d, deal_id = _setup_room()
    send_message(SendMessageIn(room_id=room, text="from driver", client_msg_id="mine-1"), user=_u(d))
    driver_view = get_messages(room, user=_u(d))["messages"]
    owner_view = get_messages(room, user=_u(o))["messages"]
    msg_driver = next(m for m in driver_view if m["text"] == "from driver")
    msg_owner = next(m for m in owner_view if m["text"] == "from driver")
    assert msg_driver["mine"] is True
    assert msg_owner["mine"] is False


# ─────────────────── 2. ordering survives pagination ───────────────────────

def test_ordering_survives_pagination_no_dupes_no_gaps():
    """GET /chat/messages pages newest-first (offset=0 = the most recent N
    messages — see the endpoint's `ORDER BY created_at DESC, id DESC LIMIT ?
    OFFSET ?`, matching a normal chat UI that loads the latest page first and
    pages backward into history). Each returned page is itself presented
    oldest-to-newest (the endpoint reverses its DESC-ordered SQL rows before
    returning — see chat.py's "for r in reversed(rows)"). So concatenating
    pages in the order they'd be REQUESTED (offset 0, then higher) and
    reversing that page sequence must reproduce the exact full-history order,
    with no message repeated across pages and none skipped.
    """
    room, o, d, deal_id = _setup_room()
    N = 25
    sent_order = []
    for i in range(N):
        sender = d if i % 2 == 0 else o
        result = send_message(
            SendMessageIn(room_id=room, text=f"msg-{i:03d}", client_msg_id=f"page-{i:03d}"),
            user=_u(sender),
        )
        sent_order.append(result["message_id"])

    # Full-history fetch (single page) — ground truth ordering.
    full = get_messages(room, limit=1000, offset=0, user=_u(o))["messages"]
    full_ids = [m["id"] for m in full]
    assert full_ids == sent_order, "chronological order must match send order (created_at, id tiebreak)"

    # Now page through (newest page first, per the endpoint's contract) in
    # chunks of 10 and reassemble into chronological order.
    page_size = 10
    pages = []
    seen_ids = set()
    offset = 0
    while True:
        page = get_messages(room, limit=page_size, offset=offset, user=_u(o))["messages"]
        if not page:
            break
        for m in page:
            assert m["id"] not in seen_ids, f"message id {m['id']} appeared on two pages — duplicate-across-pages"
            seen_ids.add(m["id"])
        page_ids = [m["id"] for m in page]
        assert page_ids == sorted(page_ids), "each page itself must be oldest-to-newest, per created_at/id tiebreak"
        pages.append(page)
        offset += page_size
        if offset > N + page_size:  # safety valve against infinite loop on a bug
            break

    # Oldest page was fetched LAST (highest offset) — reverse the fetch
    # order to lay pages out chronologically before concatenating.
    reassembled_ids = [m["id"] for page in reversed(pages) for m in page]
    assert reassembled_ids == sent_order, (
        "paginated reassembly (oldest page first) must reproduce the exact same order as the full fetch — "
        f"got {reassembled_ids} expected {sent_order}"
    )
    assert len(seen_ids) == N, f"expected {N} unique messages across pages, saw {len(seen_ids)}"


def test_reload_is_idempotent_no_reorder():
    room, o, d, deal_id = _setup_room()
    for i in range(6):
        send_message(SendMessageIn(room_id=room, text=f"reload-{i}", client_msg_id=f"reload-{i}"), user=_u(d))

    first_read = [(m["id"], m["text"]) for m in get_messages(room, user=_u(o))["messages"]]
    second_read = [(m["id"], m["text"]) for m in get_messages(room, user=_u(o))["messages"]]
    third_read = [(m["id"], m["text"]) for m in get_messages(room, user=_u(d))["messages"]]

    assert first_read == second_read, "re-reading (simulated reload) must not reorder or duplicate"
    assert first_read == third_read, "both participants must see the identical canonical order"
