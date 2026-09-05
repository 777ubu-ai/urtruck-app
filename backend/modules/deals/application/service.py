"""Deals/Bids V2 application service backed by the current SQLite schema.

This module is deliberately side-by-side with the legacy API. It owns status
mutations when an adapter explicitly selects it; no notification or Chat
side-effect is performed here.
"""
import hashlib
import json
import sqlite3
import uuid
from typing import Any

from .public_contract import Actor, CommandContext

try:
    from services.geo_normalize import is_international_route
except ImportError:  # repository-root imports used by tests
    from backend.services.geo_normalize import is_international_route


LIVE_DEAL_STATUSES = ("accepted", "in_progress", "at_border", "awaiting_confirmation", "delivered", "received")
ALLOWED_DEAL_TRANSITIONS = {
    "accepted": {"in_progress", "cancelled"},
    "in_progress": {"at_border", "delivered", "cancelled"},
    "at_border": {"delivered", "cancelled"},
    "delivered": {"received"},
    "received": {"completed"},
    "completed": set(),
    "cancelled": set(),
}
DRIVER_ONLY = {("accepted", "in_progress"), ("in_progress", "at_border"), ("in_progress", "delivered"), ("at_border", "delivered")}
SHIPPER_ONLY = {("delivered", "received"), ("received", "completed")}


class DomainError(Exception):
    def __init__(self, status_code: int, detail: Any):
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def payload_fingerprint(payload: Any) -> str:
    return hashlib.sha256(_json(payload).encode()).hexdigest()


def ensure_v2_schema(conn: sqlite3.Connection) -> None:
    """Create additive tables and indexes; refuse silently unsafe legacy data."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS domain_outbox (
            event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL,
            aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
            payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            processed_at TEXT, attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at TEXT, claimed_at TEXT,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','processing','processed','failed'))
        );
        CREATE INDEX IF NOT EXISTS idx_domain_outbox_pending
            ON domain_outbox(status, next_attempt_at, created_at);
        CREATE TABLE IF NOT EXISTS idempotency_records (
            operation_key TEXT PRIMARY KEY, operation_name TEXT NOT NULL,
            payload_fingerprint TEXT NOT NULL, result_payload TEXT,
            status TEXT NOT NULL DEFAULT 'reserved'
                CHECK(status IN ('reserved','completed','failed')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS deal_transitions (
            transition_id TEXT PRIMARY KEY, deal_id TEXT NOT NULL,
            actor_id TEXT NOT NULL, from_status TEXT NOT NULL, to_status TEXT NOT NULL,
            operation_id TEXT NOT NULL, correlation_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(domain_outbox)").fetchall()}
    if "claimed_at" not in columns:
        conn.execute("ALTER TABLE domain_outbox ADD COLUMN claimed_at TEXT")
    for table in ("bids", "deals"):
        table_columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if "version" not in table_columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN version INTEGER NOT NULL DEFAULT 0")
    live = "'accepted','in_progress','at_border','awaiting_confirmation','delivered','received'"
    for column, index_name in (("cargo_id", "idx_deals_live_cargo_v2"), ("trip_id", "idx_deals_live_trip_v2")):
        duplicate = conn.execute(
            f"SELECT {column}, COUNT(*) AS n FROM deals WHERE {column} IS NOT NULL AND status IN ({live}) GROUP BY {column} HAVING n > 1 LIMIT 1"
        ).fetchone()
        if duplicate:
            raise DomainError(503, {"error": "invariant_preflight_failed", "column": column, "value": duplicate[0]})
        conn.execute(f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} ON deals({column}) WHERE {column} IS NOT NULL AND status IN ({live})")


class DealsBidsService:
    def __init__(self, conn: sqlite3.Connection, ensure_schema: bool = True):
        self.conn = conn
        if ensure_schema:
            ensure_v2_schema(conn)

    def _idempotent(self, operation: str, key: str | None, payload: Any) -> dict | None:
        if not key:
            return None
        fingerprint = payload_fingerprint(payload)
        row = self.conn.execute("SELECT * FROM idempotency_records WHERE operation_key = ?", (key,)).fetchone()
        if row:
            if row["operation_name"] != operation or row["payload_fingerprint"] != fingerprint:
                raise DomainError(409, {"error": "idempotency_key_conflict"})
            if row["status"] == "completed" and row["result_payload"]:
                return json.loads(row["result_payload"])
            raise DomainError(409, {"error": "idempotency_operation_in_progress"})
        self.conn.execute(
            "INSERT INTO idempotency_records(operation_key, operation_name, payload_fingerprint) VALUES (?,?,?)",
            (key, operation, fingerprint),
        )
        return None

    def _complete(self, key: str | None, result: dict) -> None:
        if key:
            self.conn.execute(
                "UPDATE idempotency_records SET status='completed', result_payload=?, completed_at=CURRENT_TIMESTAMP WHERE operation_key=?",
                (_json(result), key),
            )

    def _event(self, event_type: str, aggregate_type: str, aggregate_id: str, payload: dict) -> None:
        self.conn.execute(
            "INSERT INTO domain_outbox(event_id,event_type,aggregate_type,aggregate_id,payload) VALUES (?,?,?,?,?)",
            (str(uuid.uuid4()), event_type, aggregate_type, aggregate_id, _json(payload)),
        )

    def create_bid(self, payload: dict, actor: Actor, context: CommandContext) -> dict:
        replay = self._idempotent("bid.create", context.idempotency_key, payload)
        if replay:
            return replay
        cargo_id, trip_id, amount = payload.get("cargo_id"), payload.get("trip_id"), payload.get("amount")
        if not amount or amount <= 0 or (not cargo_id and not trip_id):
            raise DomainError(400, {"error": "invalid_bid"})
        if cargo_id:
            row = self.conn.execute("SELECT status, owner_id FROM cargos WHERE id=?", (cargo_id,)).fetchone()
            if not row:
                raise DomainError(404, "Груз не найден")
            if row["owner_id"] == actor.user_id:
                raise DomainError(403, {"error": "self_bid_forbidden"})
            if row["status"] not in (None, "active"):
                raise DomainError(409, "Груз больше не доступен для ставок")
        if trip_id:
            row = self.conn.execute("SELECT status, driver_id FROM trips WHERE id=?", (trip_id,)).fetchone()
            if not row:
                raise DomainError(404, "Рейс не найден")
            if row["driver_id"] == actor.user_id:
                raise DomainError(403, {"error": "self_bid_forbidden"})
            if row["status"] not in (None, "active"):
                raise DomainError(409, "Рейс больше не доступен для ставок")
        duplicate = self.conn.execute(
            "SELECT id FROM bids WHERE bidder_id=? AND status IN ('pending','countered') AND ((cargo_id IS NOT NULL AND cargo_id=?) OR (trip_id IS NOT NULL AND trip_id=?)) LIMIT 1",
            (actor.user_id, cargo_id, trip_id),
        ).fetchone()
        if duplicate:
            raise DomainError(409, {"error": "duplicate_bid", "existing_bid_id": duplicate["id"]})
        bid_id = str(uuid.uuid4())
        self.conn.execute(
            "INSERT INTO bids(id,cargo_id,trip_id,bidder_id,bidder_name,bidder_phone,amount,message) VALUES (?,?,?,?,?,?,?,?)",
            (bid_id, cargo_id, trip_id, actor.user_id, payload.get("bidder_name"), payload.get("bidder_phone"), amount, payload.get("message")),
        )
        if cargo_id:
            self.conn.execute("UPDATE cargos SET bids_count=bids_count+1 WHERE id=?", (cargo_id,))
        result = {"id": bid_id, "ok": True}
        self._complete(context.idempotency_key, result)
        return result

    def _bid(self, bid_id: str) -> sqlite3.Row:
        row = self.conn.execute("SELECT * FROM bids WHERE id=?", (bid_id,)).fetchone()
        if not row:
            raise DomainError(404, "Ставка не найдена")
        return row

    def _owner(self, bid: sqlite3.Row) -> str | None:
        if bid["cargo_id"]:
            row = self.conn.execute("SELECT owner_id FROM cargos WHERE id=?", (bid["cargo_id"],)).fetchone()
            return row["owner_id"] if row else None
        if bid["trip_id"]:
            row = self.conn.execute("SELECT driver_id FROM trips WHERE id=?", (bid["trip_id"],)).fetchone()
            return row["driver_id"] if row else None
        return None

    def _route_countries(self, deal: sqlite3.Row) -> tuple[str | None, str | None]:
        source = ("cargos", deal["cargo_id"]) if deal["cargo_id"] else (("trips", deal["trip_id"]) if deal["trip_id"] else None)
        if not source:
            return None, None
        columns = {row["name"] for row in self.conn.execute(f"PRAGMA table_info({source[0]})").fetchall()}
        if "from_country" not in columns or "to_country" not in columns:
            return None, None
        row = self.conn.execute(f"SELECT from_country,to_country FROM {source[0]} WHERE id=?", (source[1],)).fetchone()
        return (row["from_country"], row["to_country"]) if row else (None, None)

    def update_bid(self, bid_id: str, payload: dict, actor: Actor, context: CommandContext) -> dict:
        replay = self._idempotent("bid.update", context.idempotency_key, {"bid_id": bid_id, **payload})
        if replay:
            return replay
        bid = self._bid(bid_id)
        if bid["bidder_id"] != actor.user_id:
            raise DomainError(403, "Можно редактировать только свою ставку")
        if bid["status"] != "pending":
            raise DomainError(409, f"Ставку нельзя изменить в статусе {bid['status']}")
        amount = payload.get("amount", bid["amount"])
        if amount <= 0:
            raise DomainError(400, "amount должен быть > 0")
        if payload.get("amount") is not None and bid["amount"] and amount < bid["amount"] * 0.1:
            raise DomainError(400, "Слишком большая скидка: цену нельзя снижать более чем на 90%")
        expected_version = payload.get("version")
        if expected_version is None:
            cur = self.conn.execute("UPDATE bids SET amount=?, message=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", (amount, payload.get("message", bid["message"]), bid_id))
        else:
            cur = self.conn.execute("UPDATE bids SET amount=?, message=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending' AND version=?", (amount, payload.get("message", bid["message"]), bid_id, expected_version))
        if cur.rowcount != 1:
            raise DomainError(409, "Ставка уже изменена")
        result = {"ok": True, "bid": dict(self._bid(bid_id))}
        self._complete(context.idempotency_key, result)
        return result

    def counter_bid(self, bid_id: str, payload: dict, actor: Actor, context: CommandContext) -> dict:
        replay = self._idempotent("bid.counter", context.idempotency_key, {"bid_id": bid_id, **payload})
        if replay:
            return replay
        bid = self._bid(bid_id)
        if self._owner(bid) != actor.user_id:
            raise DomainError(403, "Только владелец может отправить контр-оффер")
        if bid["status"] != "pending" or not payload.get("amount") or payload["amount"] <= 0:
            raise DomainError(409, "Контр-оффер недоступен")
        self.conn.execute("UPDATE bids SET status='countered',counter_amount=?,counter_message=?,counter_by='owner',counter_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", (payload["amount"], payload.get("message"), bid_id))
        result = {"ok": True, "bid": dict(self._bid(bid_id))}
        self._complete(context.idempotency_key, result)
        return result

    def reject_or_cancel(self, bid_id: str, action: str, actor: Actor, context: CommandContext) -> dict:
        replay = self._idempotent(f"bid.{action}", context.idempotency_key, {"bid_id": bid_id})
        if replay:
            return replay
        bid = self._bid(bid_id)
        owner = self._owner(bid)
        if action == "cancel":
            if bid["bidder_id"] != actor.user_id:
                raise DomainError(403, "Можно отменить только свою ставку")
        elif owner != actor.user_id:
            raise DomainError(403, "Только владелец может отклонить ставку")
        if bid["status"] not in ("pending", "countered"):
            raise DomainError(409, f"Ставку нельзя обработать в статусе {bid['status']}")
        status = "cancelled" if action == "cancel" else "rejected"
        cur = self.conn.execute("UPDATE bids SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','countered')", (status, bid_id))
        if cur.rowcount != 1:
            raise DomainError(409, "Ставка уже обработана")
        if bid["cargo_id"]:
            self.conn.execute("UPDATE cargos SET bids_count=MAX(0,bids_count-1) WHERE id=?", (bid["cargo_id"],))
        result = {"ok": True, "bid_id": bid_id, "status": status}
        self._complete(context.idempotency_key, result)
        return result

    def accept_bid(self, bid_id: str, actor: Actor, context: CommandContext, amount: int | None = None) -> dict:
        payload = {"bid_id": bid_id, "amount": amount}
        replay = self._idempotent("bid.accept", context.idempotency_key, payload)
        if replay:
            return replay
        bid = self._bid(bid_id)
        if bid["status"] != "pending":
            raise DomainError(409, f"Ставку нельзя принять в статусе {bid['status']}")
        owner = self._owner(bid)
        if owner != actor.user_id:
            raise DomainError(403, "Только владелец может принять ставку")
        if not bid["cargo_id"] and not bid["trip_id"]:
            raise DomainError(409, "Ставку без объявления принять нельзя")
        final_amount = amount or bid["amount"]
        cargo = self.conn.execute("SELECT * FROM cargos WHERE id=?", (bid["cargo_id"],)).fetchone() if bid["cargo_id"] else None
        trip = self.conn.execute("SELECT * FROM trips WHERE id=?", (bid["trip_id"],)).fetchone() if bid["trip_id"] else None
        if bid["cargo_id"] and (not cargo or cargo["status"] not in (None, "active")):
            raise DomainError(409, "Груз уже занят или недоступен")
        if bid["trip_id"] and (not trip or trip["status"] not in (None, "active")):
            raise DomainError(409, "Рейс уже занят или недоступен")
        live = "'accepted','in_progress','at_border','awaiting_confirmation','delivered','received'"
        parent_checks = [("cargo_id", bid["cargo_id"]), ("trip_id", bid["trip_id"])]
        for column, value in parent_checks:
            if value and self.conn.execute(f"SELECT 1 FROM deals WHERE {column}=? AND status IN ({live}) LIMIT 1", (value,)).fetchone():
                raise DomainError(409, "Для объявления уже существует активная сделка")
        shipper_id = cargo["owner_id"] if cargo else bid["bidder_id"]
        driver_id = bid["bidder_id"] if cargo else trip["driver_id"]
        from_city = (cargo or trip)["from_city"]
        to_city = (cargo or trip)["to_city"]
        updated = self.conn.execute("UPDATE bids SET amount=?,status='accepted',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", (final_amount, bid_id))
        if updated.rowcount != 1:
            raise DomainError(409, "Ставка уже обработана")
        if bid["cargo_id"]:
            claimed = self.conn.execute("UPDATE cargos SET status='taken',taken_by=? WHERE id=? AND (status='active' OR status IS NULL)", (driver_id, bid["cargo_id"]))
            if claimed.rowcount != 1:
                raise DomainError(409, "Груз уже занят")
        if bid["trip_id"]:
            claimed = self.conn.execute("UPDATE trips SET status='booked',booked_by=? WHERE id=? AND (status='active' OR status IS NULL)", (shipper_id, bid["trip_id"]))
            if claimed.rowcount != 1:
                raise DomainError(409, "Рейс уже занят")
        siblings = self.conn.execute("SELECT id FROM bids WHERE id<>? AND (cargo_id=? OR trip_id=?) AND status IN ('pending','countered')", (bid_id, bid["cargo_id"], bid["trip_id"])).fetchall()
        self.conn.execute("UPDATE bids SET status='rejected',updated_at=CURRENT_TIMESTAMP WHERE id<>? AND (cargo_id=? OR trip_id=?) AND status IN ('pending','countered')", (bid_id, bid["cargo_id"], bid["trip_id"]))
        deal_id = str(uuid.uuid4())
        self.conn.execute("INSERT INTO deals(id,cargo_id,trip_id,bid_id,shipper_id,driver_id,from_city,to_city,amount,status) VALUES (?,?,?,?,?,?,?,?,?,?)", (deal_id, bid["cargo_id"], bid["trip_id"], bid_id, shipper_id, driver_id, from_city, to_city, final_amount, "accepted"))
        transition_id = str(uuid.uuid4())
        self.conn.execute("INSERT INTO deal_transitions(transition_id,deal_id,actor_id,from_status,to_status,operation_id,correlation_id) VALUES (?,?,?,?,?,?,?)", (transition_id, deal_id, actor.user_id, "none", "accepted", context.operation_id, context.correlation_id))
        self._event("BidAccepted", "bid", bid_id, {"deal_id": deal_id, "amount": final_amount})
        self._event("DealCreated", "deal", deal_id, {"bid_id": bid_id, "cargo_id": bid["cargo_id"], "trip_id": bid["trip_id"], "amount": final_amount})
        result = {
            "ok": True,
            "deal_id": deal_id,
            "chat_room_id": None,
            "from_city": from_city,
            "to_city": to_city,
            "shipper_id": shipper_id,
            "driver_id": driver_id,
            "rejected_siblings": [row["id"] for row in siblings],
            "rejected_bid_ids": [row["id"] for row in siblings],
        }
        self._complete(context.idempotency_key, result)
        return result

    def transition_deal(self, deal_id: str, target: str, actor: Actor, context: CommandContext) -> dict:
        replay = self._idempotent("deal.transition", context.idempotency_key, {"deal_id": deal_id, "target": target})
        if replay:
            return replay
        deal = self.conn.execute("SELECT * FROM deals WHERE id=?", (deal_id,)).fetchone()
        if not deal:
            raise DomainError(404, "Сделка не найдена")
        current = deal["status"] or "accepted"
        if actor.user_id not in (deal["shipper_id"], deal["driver_id"]):
            raise DomainError(403, "Участник сделки не найден")
        if target == current:
            result = {"ok": True, "status": target}
            self._complete(context.idempotency_key, result)
            return result
        if target not in ALLOWED_DEAL_TRANSITIONS.get(current, set()):
            raise DomainError(409, {"error": "INVALID_STATUS_TRANSITION"})
        if (current, target) in DRIVER_ONLY and actor.user_id != deal["driver_id"]:
            raise DomainError(403, "Переход доступен только водителю")
        if (current, target) in SHIPPER_ONLY and actor.user_id != deal["shipper_id"]:
            raise DomainError(403, "Переход доступен только грузовладельцу")
        if current == "in_progress" and target in ("at_border", "delivered"):
            from_country, to_country = self._route_countries(deal)
            international, reason = is_international_route(from_country, to_country)
            if international is None:
                raise DomainError(409, {"error": reason, "message": "Уточните страны маршрута перед продолжением"})
            if not international and target == "at_border":
                raise DomainError(409, {"error": "ROUTE_NOT_INTERNATIONAL"})
            if international and target == "delivered":
                raise DomainError(409, {"error": "ROUTE_REQUIRES_BORDER_STEP"})
        expected_version = context.expected_version
        if expected_version is None:
            changed = self.conn.execute("UPDATE deals SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?", (target, deal_id, current))
        else:
            changed = self.conn.execute("UPDATE deals SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=? AND version=?", (target, deal_id, current, expected_version))
        if changed.rowcount != 1:
            raise DomainError(409, "Статус сделки уже изменён")
        if target == "completed" and deal["cargo_id"]:
            self.conn.execute("UPDATE cargos SET status='completed' WHERE id=?", (deal["cargo_id"],))
        if target == "cancelled" and deal["cargo_id"]:
            self.conn.execute("UPDATE cargos SET status='active',taken_by=NULL WHERE id=?", (deal["cargo_id"],))
        trip_status = {"in_progress": "in_transit", "at_border": "in_transit", "delivered": "delivered", "received": "delivered", "completed": "completed", "cancelled": "cancelled"}.get(target)
        if trip_status and deal["trip_id"]:
            self.conn.execute("UPDATE trips SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (trip_status, deal["trip_id"]))
        transition_id = str(uuid.uuid4())
        self.conn.execute("INSERT INTO deal_transitions(transition_id,deal_id,actor_id,from_status,to_status,operation_id,correlation_id) VALUES (?,?,?,?,?,?,?)", (transition_id, deal_id, actor.user_id, current, target, context.operation_id, context.correlation_id))
        self._event("DealCancelled" if target == "cancelled" else "DealStatusChanged", "deal", deal_id, {"from_status": current, "to_status": target, "actor_id": actor.user_id})
        result = {"ok": True, "status": target}
        self._complete(context.idempotency_key, result)
        return result

    def transition_trip_status(self, trip_id: str, target: str, actor: Actor, context: CommandContext) -> dict:
        """Compatibility adapter that cannot reactivate a live reservation."""
        trip = self.conn.execute("SELECT * FROM trips WHERE id=?", (trip_id,)).fetchone()
        if not trip:
            raise DomainError(404, "Рейс не найден")
        if trip["driver_id"] != actor.user_id:
            raise DomainError(403, "Только водитель может менять статус")
        live = "'accepted','in_progress','at_border','awaiting_confirmation','delivered','received'"
        deal = self.conn.execute("SELECT * FROM deals WHERE trip_id=? AND status IN (" + live + ") ORDER BY created_at LIMIT 1", (trip_id,)).fetchone()
        if deal:
            if target == "active":
                raise DomainError(409, {"error": "LIVE_DEAL_RESERVATION"})
            mapped = {"in_transit": "in_progress", "delivered": "delivered", "cancelled": "cancelled"}.get(target)
            if mapped:
                return self.transition_deal(deal["id"], mapped, actor, context)
            if target == "booked":
                return {"ok": True, "status": target}
        changed = self.conn.execute("UPDATE trips SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND driver_id=?", (target, trip_id, actor.user_id))
        if changed.rowcount != 1:
            raise DomainError(409, "Рейс уже изменён")
        result = {"ok": True, "status": target}
        self._complete(context.idempotency_key, result)
        return result
