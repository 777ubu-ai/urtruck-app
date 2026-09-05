import sqlite3
import threading

from backend.modules.deals.application.public_contract import Actor, CommandContext
from backend.modules.deals.application.service import DealsBidsService, DomainError, ensure_v2_schema


SCHEMA = (
    open("backend/database/marketplace_schema.sql").read()
    + open("backend/database/deals_schema.sql").read()
    + open("backend/database/chat_schema.sql").read()
)


def room_factory(conn, shipper_id, driver_id, cargo_id, trip_id, bid_id):
    p1, p2 = sorted((shipper_id, driver_id))
    key = f"c:{cargo_id}:{p1}:{p2}" if cargo_id else f"t:{trip_id}:{p1}:{p2}"
    conn.execute(
        "INSERT INTO chat_rooms(id,participant_1,participant_2,owner_id,bidder_id,bid_id,cargo_id,trip_id,deal_key) "
        "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(deal_key) DO NOTHING",
        (f"room-{cargo_id or trip_id}", p1, p2, shipper_id, driver_id, bid_id, cargo_id, trip_id, key),
    )
    return conn.execute("SELECT id FROM chat_rooms WHERE deal_key=?", (key,)).fetchone()[0]


def seed(path):
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute("INSERT INTO cargos(id,owner_id,from_city,to_city,cargo_desc,status) VALUES ('c1','ship','A','B','x','active')")
    conn.execute("INSERT INTO bids(id,cargo_id,bidder_id,amount,status) VALUES ('b1','c1','drv',100,'pending')")
    conn.commit()
    conn.close()


def race(path, barrier, key):
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        barrier.wait()
        conn.execute("BEGIN IMMEDIATE")
        result = DealsBidsService(conn, ensure_schema=False, room_factory=room_factory).accept_bid(
            "b1", Actor("ship", "client"), CommandContext("op", "corr", key)
        )
        conn.commit()
        return "winner", result
    except DomainError as exc:
        conn.rollback()
        return "loser", exc.status_code
    finally:
        conn.close()


def test_actual_service_accept_race_has_one_winner_for_ten_runs(tmp_path):
    for iteration in range(10):
        path = str(tmp_path / f"race-{iteration}.sqlite")
        seed(path)
        setup = sqlite3.connect(path)
        setup.row_factory = sqlite3.Row
        ensure_v2_schema(setup)
        setup.commit()
        setup.close()
        barrier = threading.Barrier(2)
        results = []
        threads = [threading.Thread(target=lambda key=key: results.append(race(path, barrier, key)), args=()) for key in ("key-a", "key-b")]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(15)
        assert all(not thread.is_alive() for thread in threads)
        assert [item[0] for item in results].count("winner") == 1
        assert [item[0] for item in results].count("loser") == 1
        assert results and next(item for item in results if item[0] == "loser")[1] == 409
        conn = sqlite3.connect(path)
        assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM chat_rooms").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM bids WHERE status='accepted'").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM domain_outbox WHERE event_type='BidAccepted'").fetchone()[0] == 1
        conn.close()
