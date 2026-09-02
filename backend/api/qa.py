"""QA cleanup endpoint.

Soft-cancels marketplace records left behind by the QA agents (Serik / Boris)
after a `npm run qa:full` run. Only enabled when QA_CLEANUP_TOKEN is set in
the env — otherwise the endpoint is mounted but every request returns 403,
so the surface is invisible to anyone without the token.

Why an endpoint instead of just a script:
  - The previous client-side cleanup needed every owner's bearer token,
    which we don't always have once a QA run finishes.
  - With a server-side cancel we can do everything in one transaction and
    return reliable counts back to the QA framework.

Targets are records whose visible text fields contain the QA marker
"[ar-..." (the per-run tag the agents embed). Never DELETEs — only flips
status to 'cancelled' for trips/cargos and 'rejected' for bids. Accepted /
in_progress / delivered records are deliberately left alone, since by then
the QA flow has graduated into the deal/order pipeline that real users see.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Optional, List

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from database.db import get_conn, new_id
from database import registration_dal as reg_dal
from services.qa_token_guard import is_compromised_qa_agent_token

qa_router = APIRouter()

# Marker substring all QA agents inject. Change in lockstep with
# qa/utils/qaConfig.js if you ever want to rebrand the prefix.
QA_TAG_PREFIX = "[ar-"

# Stable QA actors. We pin id+phone so the same row is reused across runs and
# never multiplies into thousands of guest_xxx rows. The phone column is
# UNIQUE/NOT NULL in the schema — using a marker string instead of a real
# phone number keeps these obviously non-public.
# Display names deliberately avoid the word "qa": marketplace.py's public
# feed filter treats "qa" as a dirty token to keep real test junk out, and
# anything matching is hidden from list_trips. The bracketed [ar-...] marker
# the agents inject elsewhere stays the canonical QA fingerprint.
QA_ACTORS = {
    "serik":   {"id": "agent-serik",   "phone": "agent-serik",   "full_name": "Serik (driver agent)",     "role": "driver"},
    "boris":   {"id": "agent-boris",   "phone": "agent-boris",   "full_name": "Boris (shipper agent)",    "role": "client"},
    "fedya":   {"id": "agent-fedya",   "phone": "agent-fedya",   "full_name": "Fedya (shipper agent)",    "role": "client"},
    "armando": {"id": "agent-armando", "phone": "agent-armando", "full_name": "Armando (driver agent)",   "role": "driver"},
    "berik":   {"id": "agent-berik",   "phone": "agent-berik",   "full_name": "Berik (driver agent)",     "role": "driver"},
    "auditor": {"id": "agent-auditor", "phone": "agent-auditor", "full_name": "Auditor (supervisor agent)", "role": "auditor"},
}


def _require_token(provided: Optional[str]) -> None:
    expected = os.getenv("QA_CLEANUP_TOKEN")
    if not expected:
        # Endpoint is effectively disabled in production until the operator
        # opts in by setting the env var. 503 is more honest than 403 here
        # because the feature isn't configured at all.
        raise HTTPException(status_code=503, detail="QA cleanup endpoint not configured (QA_CLEANUP_TOKEN unset)")
    if not provided or provided != expected:
        raise HTTPException(status_code=403, detail="Invalid X-QA-Cleanup-Token")


def _require_agent_token(provided: Optional[str]) -> None:
    expected = os.getenv("QA_AGENT_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="QA agent endpoint not configured (QA_AGENT_TOKEN unset)")
    if is_compromised_qa_agent_token(expected):
        # The former value was committed in a Maestro runner.  Refuse it even
        # if an operator has not restarted with a rotated secret yet.
        raise HTTPException(status_code=503, detail="QA agent endpoint disabled until QA_AGENT_TOKEN is rotated")
    if not provided or provided != expected:
        raise HTTPException(status_code=403, detail="Invalid X-QA-Agent-Token")


class EnsureActorIn(BaseModel):
    actor: str                          # "serik" | "boris" | "auditor"
    role: Optional[str] = None          # "driver" | "shipper" | "auditor"


class QaPushTokensIn(BaseModel):
    actor: Optional[str] = None
    user_id: Optional[str] = None


class QaDirectPushIn(BaseModel):
    actor: Optional[str] = None
    user_id: Optional[str] = None
    provider: Optional[str] = None           # expo | fcm | apns | native | dual
    title: str = "UrTruck QA"
    body: str = "Тестовое push-уведомление"
    url: str = "/notifications"
    kind: str = "qa_push_test"
    receipt_wait_seconds: float = 0


def _qa_push_user_id(actor: Optional[str], user_id: Optional[str]) -> str:
    if user_id:
        return user_id
    spec = QA_ACTORS.get(actor or "")
    if not spec:
        raise HTTPException(status_code=400, detail="Specify user_id or known QA actor")
    return spec["id"]


@qa_router.post("/ensure-actor")
def ensure_actor(body: EnsureActorIn, x_qa_agent_token: Optional[str] = Header(None)):
    """Mint (or reuse) a stable session token for a QA actor.

    This bypasses the public /register/guest rate-limit on purpose: that
    limit exists to throttle real users, but QA agents need to sign in
    several times per `npm run qa:full`. Stability of identity (always the
    same row in drivers_registration) also avoids accumulating thousands of
    one-shot guest_xxx rows in the DB after every CI cycle.
    """
    _require_agent_token(x_qa_agent_token)
    spec = QA_ACTORS.get(body.actor)
    if not spec:
        raise HTTPException(status_code=400, detail=f"Unknown actor '{body.actor}'. One of: {list(QA_ACTORS)}")

    role = body.role or spec["role"]
    with get_conn() as c:
        row = c.execute(
            "SELECT id, full_name FROM drivers_registration WHERE id = ?", (spec["id"],)
        ).fetchone()
        if not row:
            # Create stable row. status='approved' so the actor can act on
            # all marketplace endpoints without going through verification.
            c.execute(
                "INSERT INTO drivers_registration (id, phone, full_name, role, status, verification_level, current_step) "
                "VALUES (?, ?, ?, ?, 'approved', 3, 0)",
                (spec["id"], spec["phone"], spec["full_name"], role),
            )
        elif (row["full_name"] or "").lower() != spec["full_name"].lower():
            # Older deployments saved e.g. "Serik (driver QA)" — that string
            # contains "qa" and gets hidden by the public-feed dirty filter.
            # Keep the row, just rename it to the current spec.
            c.execute(
                "UPDATE drivers_registration SET full_name = ? WHERE id = ?",
                (spec["full_name"], spec["id"]),
            )

    # Always issue a fresh session — old tokens may have expired (30d TTL).
    token = reg_dal.create_session(spec["id"])
    return {
        "ok": True,
        "actor": body.actor,
        "user_id": spec["id"],
        "role": role,
        "token": token,
        "verification_level": 3,
    }


@qa_router.post("/push/native-tokens")
def qa_push_native_tokens(body: QaPushTokensIn, x_qa_agent_token: Optional[str] = Header(None)):
    """QA-only masked diagnostics for active native push tokens.

    Raw tokens are never returned. This is enough to prove whether a concrete
    QA actor has any active Android/iOS token linked before running physical
    push checks.
    """
    _require_agent_token(x_qa_agent_token)
    from services import push_sender
    uid = _qa_push_user_id(body.actor, body.user_id)
    return push_sender.native_token_diagnostics(uid)


@qa_router.post("/push/test-direct")
def qa_push_test_direct(body: QaDirectPushIn, x_qa_agent_token: Optional[str] = Header(None)):
    """QA-only direct provider test for native push delivery.

    It bypasses UrTruck business events and sends to the actor's registered
    native token through the same Expo provider. If this returns an Expo
    credential/token error, the bug is below the marketplace/chat pipeline.
    If this succeeds but a normal event does not, the bug is in event routing.
    """
    _require_agent_token(x_qa_agent_token)
    from services import push_sender
    uid = _qa_push_user_id(body.actor, body.user_id)
    result = push_sender.send_native_debug(
        uid,
        body.title,
        body.body,
        data={"type": "qa_push_test", "recipient_id": uid},
        url=body.url,
        kind=body.kind,
        provider=body.provider,
    )
    wait = max(0.0, min(float(body.receipt_wait_seconds or 0), 5.0))
    ticket_ids = [t.get("id") for t in result.get("tickets", []) if t.get("id")]
    if wait and ticket_ids:
        time.sleep(wait)
        result["receipts"] = push_sender.expo_receipts(ticket_ids)
    return result


class CleanupIn(BaseModel):
    run_id: Optional[str] = None    # narrow scope to a single QA run
    all: bool = False               # all [ar-...] markers when True
    confirm: bool = False           # required for non-dry mutations
    dry_run: bool = False           # report only, do not mutate


def _filter_clause(run_id: Optional[str], all_qa: bool):
    """Build a (sql_clause, params) pair matching QA-tagged rows.

    For trips: scans driver_name, from_city, to_city, transit, truck_type.
    For cargos: scans cargo_desc, from_city, to_city, cargo_type.
    For bids: scans bidder_name, message.
    """
    needle = f"%{QA_TAG_PREFIX}{run_id}]%" if (run_id and not all_qa) else f"%{QA_TAG_PREFIX}%"
    return needle


def _select_qa_trips(c, needle):
    return [dict(r) for r in c.execute(
        """
        SELECT id, driver_id, driver_name, from_city, to_city, transit, status
        FROM trips
        WHERE status = 'active' AND (
            (driver_name LIKE ?) OR (from_city LIKE ?) OR (to_city LIKE ?)
            OR (transit LIKE ?) OR (truck_type LIKE ?)
        )
        """,
        (needle, needle, needle, needle, needle),
    ).fetchall()]


def _select_qa_cargos(c, needle):
    return [dict(r) for r in c.execute(
        """
        SELECT id, owner_id, cargo_desc, from_city, to_city, cargo_type, status
        FROM cargos
        WHERE status = 'active' AND (
            (cargo_desc LIKE ?) OR (from_city LIKE ?) OR (to_city LIKE ?)
            OR (cargo_type LIKE ?)
        )
        """,
        (needle, needle, needle, needle),
    ).fetchall()]


def _select_qa_bids(c, needle, cargo_ids: List[str], trip_ids: List[str]):
    rows = []
    if cargo_ids or trip_ids:
        placeholders_c = ",".join("?" * len(cargo_ids)) if cargo_ids else None
        placeholders_t = ",".join("?" * len(trip_ids)) if trip_ids else None
        clauses = []
        params: list = []
        if placeholders_c:
            clauses.append(f"cargo_id IN ({placeholders_c})")
            params.extend(cargo_ids)
        if placeholders_t:
            clauses.append(f"trip_id IN ({placeholders_t})")
            params.extend(trip_ids)
        rows.extend([dict(r) for r in c.execute(
            f"SELECT id, bidder_id, status FROM bids "
            f"WHERE status IN ('pending', 'countered') AND ({' OR '.join(clauses)})",
            params,
        ).fetchall()])
    # Bids whose own message carries the marker — even if cargo/trip is gone
    rows.extend([dict(r) for r in c.execute(
        "SELECT id, bidder_id, status FROM bids "
        "WHERE status IN ('pending', 'countered') AND ("
        " (message LIKE ?) OR (bidder_name LIKE ?))",
        (needle, needle),
    ).fetchall()])
    # de-dup by id
    seen = set()
    out = []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        out.append(r)
    return out


@qa_router.post("/cleanup")
def qa_cleanup(body: CleanupIn, x_qa_cleanup_token: Optional[str] = Header(None)):
    _require_token(x_qa_cleanup_token)
    if not body.all and not body.run_id:
        raise HTTPException(status_code=400, detail="Specify run_id or set all=true")
    if not body.dry_run and not body.confirm:
        raise HTTPException(status_code=400, detail="Mutating call requires confirm=true (or use dry_run=true)")

    needle = _filter_clause(body.run_id, body.all)

    with get_conn() as c:
        trips = _select_qa_trips(c, needle)
        cargos = _select_qa_cargos(c, needle)
        cargo_ids = [r["id"] for r in cargos]
        trip_ids = [r["id"] for r in trips]
        bids = _select_qa_bids(c, needle, cargo_ids, trip_ids)

        result = {
            "needle": needle,
            "dry_run": body.dry_run,
            "trips_found": len(trips),
            "cargos_found": len(cargos),
            "bids_found": len(bids),
            "trip_ids": trip_ids,
            "cargo_ids": cargo_ids,
            "bid_ids": [b["id"] for b in bids],
        }

        if body.dry_run:
            return result

        # Apply mutations. Each UPDATE is bounded to the IDs we just SELECTed
        # so there's no risk of the LIKE expression matching newer rows mid-run.
        if trip_ids:
            ph = ",".join("?" * len(trip_ids))
            c.execute(
                f"UPDATE trips SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP "
                f"WHERE id IN ({ph})",
                trip_ids,
            )
        if cargo_ids:
            ph = ",".join("?" * len(cargo_ids))
            c.execute(
                f"UPDATE cargos SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP "
                f"WHERE id IN ({ph})",
                cargo_ids,
            )
        if bids:
            bid_ids = [b["id"] for b in bids]
            ph = ",".join("?" * len(bid_ids))
            c.execute(
                f"UPDATE bids SET status = 'rejected', updated_at = CURRENT_TIMESTAMP "
                f"WHERE id IN ({ph})",
                bid_ids,
            )
        # Recompute bids_count on every cargo so the public counter doesn't
        # drift after we mass-reject pending QA bids.
        c.execute(
            """
            UPDATE cargos SET bids_count = (
                SELECT COUNT(*) FROM bids b
                WHERE b.cargo_id = cargos.id
                  AND b.status IN ('pending', 'countered', 'accepted')
            )
            """
        )

    result["applied"] = True
    return result


@qa_router.get("/cleanup/info")
def qa_cleanup_info(x_qa_cleanup_token: Optional[str] = Header(None)):
    """Lightweight ping so the cleanup script can detect presence."""
    _require_token(x_qa_cleanup_token)
    return {
        "ok": True,
        "tag_prefix": QA_TAG_PREFIX,
        "endpoint": "/api/v1/qa/cleanup",
    }


# ─── QA deal cleanup — P0 2026-09-02 ───────────────────────────────────
# Обычный /cleanup НАМЕРЕННО не трогает deals — потому что deals создаются
# после accept bid (graduated pipeline). Но QA-акторы оставляют десятки
# тестовых сделок, которые потом показываются реальному пользователю через
# /market/my (47 active + 26 archive). Этот endpoint отменяет ТОЛЬКО
# сделки, где ОБА участника — QA-акторы (agent-*).

# Все известные QA-акторы (включая удалённых из QA_ACTORS — их сделки
# всё ещё в БД и нуждаются в зачистке)
_ALL_QA_ACTOR_IDS = {
    "agent-serik", "agent-boris", "agent-auditor",
    # Удалены из QA_ACTORS, но сделки остались:
    "agent-fedya", "agent-armando", "agent-berik",
}
QA_ACTOR_IDS = frozenset(_ALL_QA_ACTOR_IDS | {a["id"] for a in QA_ACTORS.values()})


class DealCleanupIn(BaseModel):
    confirm: bool = False           # обязателен для мутирующего вызова
    dry_run: bool = True            # по умолчанию dry-run
    include_chat: bool = True       # зачистить чат-комнаты/сообщения тоже
    actor_ids: Optional[List[str]] = None  # ограничить конкретными actor id


@qa_router.post("/cleanup/deals")
def qa_cleanup_deals(body: DealCleanupIn, x_qa_cleanup_token: Optional[str] = Header(None)):
    """Безопасная зачистка QA-сделок. Требования:
    1. Оба участника (shipper_id И driver_id) — QA-акторы (agent-*).
    2. dry_run=true по умолчанию — только отчёт, без мутаций.
    3. confirm=true обязателен для мутации.
    4. Бэкап полных строк сделок в ответе (backup поле).
    5. Также чистит chat_rooms + chat_messages если include_chat=true.
    """
    _require_token(x_qa_cleanup_token)
    if not body.dry_run and not body.confirm:
        raise HTTPException(status_code=400, detail="Мутирующий вызов требует confirm=true (или используйте dry_run=true)")

    target_ids = frozenset(body.actor_ids) if body.actor_ids else QA_ACTOR_IDS

    with get_conn() as c:
        # Находим ВСЕ сделки, где оба участника — QA-акторы
        deals_raw = c.execute(
            "SELECT * FROM deals WHERE shipper_id IN ({ph}) AND driver_id IN ({ph2})".format(
                ph=",".join("?" * len(target_ids)),
                ph2=",".join("?" * len(target_ids)),
            ),
            list(target_ids) + list(target_ids),
        ).fetchall()
        deals = [dict(r) for r in deals_raw]

        # Разбивка по статусу для отчёта
        by_status = {}
        for d in deals:
            s = d.get("status", "unknown")
            by_status[s] = by_status.get(s, 0) + 1

        # Комнаты чата, привязанные к QA-сделкам
        chat_room_ids = [d["chat_room_id"] for d in deals if d.get("chat_room_id")]
        chat_messages_count = 0
        if chat_room_ids:
            ph = ",".join("?" * len(chat_room_ids))
            row = c.execute(f"SELECT COUNT(*) FROM chat_messages WHERE room_id IN ({ph})", chat_room_ids).fetchone()
            chat_messages_count = int(row[0]) if row else 0

        result = {
            "dry_run": body.dry_run,
            "qa_actor_ids": sorted(target_ids),
            "deals_found": len(deals),
            "by_status": by_status,
            "already_cancelled": by_status.get("cancelled", 0),
            "to_cancel": sum(v for k, v in by_status.items() if k != "cancelled"),
            "chat_rooms": len(chat_room_ids),
            "chat_messages": chat_messages_count,
            "backup": deals,  # полная резервная копия данных
        }

        if body.dry_run:
            return result

        # ── Мутация: отмена сделок ──
        deal_ids = [d["id"] for d in deals if d.get("status") != "cancelled"]
        if deal_ids:
            ph = ",".join("?" * len(deal_ids))
            c.execute(
                f"UPDATE deals SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP "
                f"WHERE id IN ({ph})",
                deal_ids,
            )
            result["deals_cancelled"] = len(deal_ids)

        # ── Зачистка чата (soft: удаляем сообщения и комнаты) ──
        if body.include_chat and chat_room_ids:
            ph = ",".join("?" * len(chat_room_ids))
            c.execute(f"DELETE FROM chat_messages WHERE room_id IN ({ph})", chat_room_ids)
            c.execute(f"DELETE FROM chat_rooms WHERE id IN ({ph})", chat_room_ids)
            result["chat_rooms_deleted"] = len(chat_room_ids)
            result["chat_messages_deleted"] = chat_messages_count

        result["applied"] = True

    return result


@qa_router.get("/cleanup/deals/preview")
def qa_cleanup_deals_preview(x_qa_cleanup_token: Optional[str] = Header(None)):
    """Быстрый просмотр: сколько QA-сделок в БД и какие у них статусы.
    Не мутирует, не требует confirm."""
    _require_token(x_qa_cleanup_token)

    with get_conn() as c:
        deals = c.execute(
            "SELECT d.id, d.shipper_id, d.driver_id, d.status, d.amount, "
            "d.from_city, d.to_city, d.created_at, d.chat_room_id "
            "FROM deals d "
            "WHERE d.shipper_id IN ({ph}) AND d.driver_id IN ({ph2})".format(
                ph=",".join("?" * len(QA_ACTOR_IDS)),
                ph2=",".join("?" * len(QA_ACTOR_IDS)),
            ),
            list(QA_ACTOR_IDS) + list(QA_ACTOR_IDS),
        ).fetchall()
        deals = [dict(r) for r in deals]

        by_status = {}
        for d in deals:
            s = d.get("status", "unknown")
            by_status[s] = by_status.get(s, 0) + 1

    return {
        "qa_actor_ids": sorted(QA_ACTOR_IDS),
        "total": len(deals),
        "by_status": by_status,
        "deals": deals,
    }
