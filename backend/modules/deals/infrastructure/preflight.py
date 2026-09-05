"""Read-only legacy data checks before enabling V2 constraints."""
import sqlite3


LIVE = "'accepted','in_progress','at_border','awaiting_confirmation','delivered','received'"


def run_preflight(conn: sqlite3.Connection) -> dict[str, list[dict]]:
    def rows(sql: str) -> list[dict]:
        return [dict(row) for row in conn.execute(sql).fetchall()]

    return {
        "duplicate_live_deals_by_cargo": rows(f"SELECT cargo_id, COUNT(*) AS count FROM deals WHERE cargo_id IS NOT NULL AND status IN ({LIVE}) GROUP BY cargo_id HAVING count > 1"),
        "duplicate_live_deals_by_trip": rows(f"SELECT trip_id, COUNT(*) AS count FROM deals WHERE trip_id IS NOT NULL AND status IN ({LIVE}) GROUP BY trip_id HAVING count > 1"),
        "orphan_bid_cargo": rows("SELECT b.id, b.cargo_id FROM bids b LEFT JOIN cargos c ON c.id=b.cargo_id WHERE b.cargo_id IS NOT NULL AND c.id IS NULL"),
        "orphan_bid_trip": rows("SELECT b.id, b.trip_id FROM bids b LEFT JOIN trips t ON t.id=b.trip_id WHERE b.trip_id IS NOT NULL AND t.id IS NULL"),
        "orphan_deal_bid": rows("SELECT d.id, d.bid_id FROM deals d LEFT JOIN bids b ON b.id=d.bid_id WHERE d.bid_id IS NOT NULL AND b.id IS NULL"),
        "inconsistent_accepted_bid_deal": rows("SELECT b.id AS bid_id FROM bids b LEFT JOIN deals d ON d.bid_id=b.id WHERE b.status='accepted' AND d.id IS NULL"),
    }
