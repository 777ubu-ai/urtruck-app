"""Route dates guard bid mutations independently of opportunistic cleanup."""
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from api import marketplace as market
from database import db


@pytest.fixture
def listing(monkeypatch, request):
    # Exercise handler checks even while the periodic expiry scan is throttled.
    monkeypatch.setattr(db, "_maybe_expire_marketplace", lambda conn: None)
    monkeypatch.setattr(market, "send_to_user", lambda *a, **kw: None)
    kind, days, date_format = request.param
    route_date = (datetime.utcnow() + timedelta(days=days)).strftime(date_format)
    listing_id, owner_id, bidder_id = db.new_id(), db.new_id(), db.new_id()
    with db.get_conn() as conn:
        if kind == "cargo":
            conn.execute(
                "INSERT INTO cargos(id,owner_id,from_city,to_city,cargo_desc,pickup_date,status,published_at) "
                "VALUES(?,?, 'Almaty','Moscow','Cargo',?,'active',CURRENT_TIMESTAMP)",
                (listing_id, owner_id, route_date),
            )
        else:
            conn.execute(
                "INSERT INTO trips(id,driver_id,from_city,to_city,departure,status,published_at) "
                "VALUES(?,?, 'Almaty','Moscow',?,'active',CURRENT_TIMESTAMP)",
                (listing_id, owner_id, route_date),
            )
    return kind, listing_id, owner_id, bidder_id


CASES = [(kind, days, fmt) for kind in ("cargo", "trip")
         for days in (-1, 0, 1) for fmt in ("%Y-%m-%d", "%d.%m.%Y")]


@pytest.mark.parametrize("listing", CASES, indirect=True)
def test_creation_obeys_route_date_without_expiring_listing(listing, request):
    kind, listing_id, owner_id, bidder_id = listing
    days = request.node.callspec.params["listing"][1]
    body = market.BidIn(**{f"{kind}_id": listing_id}, amount=900)
    user = {"id": bidder_id, "role": "driver" if kind == "cargo" else "client"}
    if days < 0:
        with pytest.raises(HTTPException) as caught:
            market.create_bid(body, user=user)
        assert caught.value.status_code == 409
        with db.get_conn() as conn:
            assert conn.execute("SELECT COUNT(*) FROM bids WHERE cargo_id=? OR trip_id=?", (listing_id, listing_id)).fetchone()[0] == 0
    else:
        assert market.create_bid(body, user=user)["ok"]
    with db.get_conn() as conn:
        assert conn.execute(f"SELECT status FROM {'cargos' if kind == 'cargo' else 'trips'} WHERE id=?", (listing_id,)).fetchone()[0] == "active"


@pytest.mark.parametrize("listing", [(k,-1,f) for k in ("cargo","trip") for f in ("%Y-%m-%d","%d.%m.%Y")], indirect=True)
@pytest.mark.parametrize("counter", [False, True])
def test_acceptance_rejects_past_route_before_any_deal_write(listing, counter):
    kind, listing_id, owner_id, bidder_id = listing
    bid_id = db.new_id()
    with db.get_conn() as conn:
        conn.execute(
            f"INSERT INTO bids(id,{kind}_id,bidder_id,amount,status,counter_amount) VALUES(?,?,?,?,?,?)",
            (bid_id, listing_id, bidder_id, 900, "countered" if counter else "pending", 950 if counter else None),
        )
    with pytest.raises(HTTPException) as caught:
        if counter:
            market.accept_counter(bid_id, user={"id": bidder_id})
        else:
            market.accept_bid(bid_id, user={"id": owner_id})
    assert caught.value.status_code == 409
    with db.get_conn() as conn:
        assert conn.execute(f"SELECT status FROM {'cargos' if kind == 'cargo' else 'trips'} WHERE id=?", (listing_id,)).fetchone()[0] == "active"
        assert conn.execute("SELECT status FROM bids WHERE id=?", (bid_id,)).fetchone()[0] == ("countered" if counter else "pending")
        assert conn.execute("SELECT COUNT(*) FROM deals WHERE bid_id=?", (bid_id,)).fetchone()[0] == 0


@pytest.mark.parametrize("listing", [(k,d,f) for k in ("cargo","trip") for d in (0,1) for f in ("%Y-%m-%d","%d.%m.%Y")], indirect=True)
@pytest.mark.parametrize("counter", [False, True])
def test_current_route_still_creates_deal_and_removes_public_status(listing, counter):
    kind, listing_id, owner_id, bidder_id = listing
    bid_id = db.new_id()
    with db.get_conn() as conn:
        conn.execute(
            f"INSERT INTO bids(id,{kind}_id,bidder_id,amount,status,counter_amount) VALUES(?,?,?,?,?,?)",
            (bid_id, listing_id, bidder_id, 900, "countered" if counter else "pending", 950 if counter else None),
        )
        bid = dict(conn.execute("SELECT * FROM bids WHERE id=?", (bid_id,)).fetchone())
        result = market._finalize_accept_inline(
            conn, {"id": owner_id}, bid, 950 if counter else None,
            expected_status="countered" if counter else "pending",
        )
        assert result["deal_id"]
        assert conn.execute(f"SELECT status FROM {'cargos' if kind == 'cargo' else 'trips'} WHERE id=?", (listing_id,)).fetchone()[0] == ("taken" if kind == "cargo" else "booked")
        assert conn.execute("SELECT status FROM bids WHERE id=?", (bid_id,)).fetchone()[0] == "accepted"


@pytest.mark.parametrize("value", [None, "", "unknown legacy date"])
def test_missing_legacy_date_preserves_existing_behavior(value):
    market._require_current_bid_route_date(value)
