"""Личный блокнот водителя: без сообщений в чат, платежей и GPS."""
import hashlib
import json
from datetime import date
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.verification_gate import require_level
from database.db import get_conn, new_id

router = APIRouter()
verified_user = require_level(1)


def expense_owner(user=Depends(verified_user)):
    # BETA_MODE не разрешает гостю хранить личные финансовые записи.
    if user.get("role") != "driver" or int(user.get("verification_level") or 0) < 1:
        raise HTTPException(status_code=403, detail="driver_account_required")
    return user["id"]


def init_expenses_schema():
    with get_conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS driver_expenses (
          id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL,
          client_id TEXT NOT NULL, create_fingerprint TEXT NOT NULL,
          deal_id TEXT, vehicle_id TEXT, vehicle_plate TEXT NOT NULL DEFAULT '',
          deal_label TEXT NOT NULL DEFAULT '',
          amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
          currency TEXT NOT NULL, category TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '', spent_on TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT,
          UNIQUE(owner_user_id, client_id)
        );
        CREATE INDEX IF NOT EXISTS idx_expenses_owner_date
          ON driver_expenses(owner_user_id, deleted_at, spent_on DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_expenses_owner_vehicle
          ON driver_expenses(owner_user_id, vehicle_id, deleted_at);
        CREATE INDEX IF NOT EXISTS idx_expenses_owner_deal
          ON driver_expenses(owner_user_id, deal_id, deleted_at);
        """)


class ExpenseBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: str = Field(min_length=8, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    amount: Decimal = Field(gt=0, le=Decimal("999999999.99"), max_digits=11, decimal_places=2)
    currency: Literal["KZT", "USD", "RUB", "CNY", "EUR", "KGS", "UZS", "BYN"]
    category: Literal["fuel", "food", "parking", "daily", "repair", "other"]
    description: str = Field(default="", max_length=500)
    spent_on: date
    deal_id: Optional[str] = Field(default=None, min_length=1, max_length=100)
    vehicle_id: Optional[str] = Field(default=None, min_length=1, max_length=100)
    version: Optional[int] = Field(default=None, ge=1)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return value.strip()

    @field_validator("spent_on")
    @classmethod
    def reasonable_date(cls, value):
        if not date(2000, 1, 1) <= value <= date(2100, 12, 31):
            raise ValueError("invalid expense date")
        return value


def _deal(c, owner, deal_id):
    row = c.execute("SELECT * FROM deals WHERE id=? AND driver_id=?", (deal_id, owner)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="expense_deal_not_found")
    return dict(row)


def _bindings(c, owner, body):
    deal = _deal(c, owner, body.deal_id) if body.deal_id else None
    bound_vehicle = deal.get("vehicle_id") if deal else None
    if bound_vehicle and body.vehicle_id and body.vehicle_id != bound_vehicle:
        raise HTTPException(status_code=409, detail="expense_vehicle_mismatch")
    vehicle_id = bound_vehicle or body.vehicle_id
    vehicle = c.execute("SELECT license_plate FROM vehicles WHERE id=? AND owner_user_id=?",
                        (vehicle_id, owner)).fetchone() if vehicle_id else None
    if vehicle_id and not vehicle:
        # Историческая сделка сохраняет свой snapshot после удаления машины.
        if not (deal and bound_vehicle == vehicle_id and deal.get("vehicle_plate_snapshot")):
            raise HTTPException(status_code=404, detail="expense_vehicle_not_found")
    return (vehicle_id, vehicle["license_plate"] if vehicle else (deal or {}).get("vehicle_plate_snapshot") or "",
            " → ".join(filter(None, [deal.get("from_city"), deal.get("to_city")])) if deal else "")


def _item(row):
    result = dict(row)
    result["amount"] = format(Decimal(result.pop("amount_minor")) / 100, ".2f")
    for key in ("owner_user_id", "client_id", "create_fingerprint", "deleted_at"):
        result.pop(key, None)
    return result


@router.get("/options")
def options(deal_id: Optional[str] = None, owner=Depends(expense_owner)):
    with get_conn() as c:
        vehicles = [dict(r) for r in c.execute(
            "SELECT id,license_plate FROM vehicles WHERE owner_user_id=? ORDER BY updated_at DESC", (owner,))]
        deals = [dict(r) for r in c.execute(
            "SELECT id,from_city,to_city,vehicle_id,vehicle_plate_snapshot FROM deals "
            "WHERE driver_id=? ORDER BY created_at DESC,id DESC LIMIT 200", (owner,))]
        if deal_id and not any(d["id"] == deal_id for d in deals):
            d = _deal(c, owner, deal_id)
            deals.insert(0, {k: d.get(k) for k in ("id", "from_city", "to_city", "vehicle_id", "vehicle_plate_snapshot")})
    return {"ok": True, "vehicles": vehicles, "deals": deals}


@router.get("")
def list_expenses(deal_id: Optional[str] = None, vehicle_id: Optional[str] = None,
                  limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0),
                  owner=Depends(expense_owner)):
    where = "owner_user_id=? AND deleted_at IS NULL"
    values = [owner]
    for field, value in (("deal_id", deal_id), ("vehicle_id", vehicle_id)):
        if value:
            where += f" AND {field}=?"
            values.append(value)
    with get_conn() as c:
        rows = c.execute(f"SELECT * FROM driver_expenses WHERE {where} ORDER BY spent_on DESC,id DESC LIMIT ? OFFSET ?",
                         (*values, limit, offset)).fetchall()
        count = c.execute(f"SELECT COUNT(*) FROM driver_expenses WHERE {where}", values).fetchone()[0]
        totals = [{"currency": r["currency"], "amount": format(Decimal(r["total"]) / 100, ".2f")}
                  for r in c.execute(f"SELECT currency,SUM(amount_minor) AS total FROM driver_expenses WHERE {where} GROUP BY currency ORDER BY currency", values)]
    return {"ok": True, "expenses": [_item(r) for r in rows], "total": count, "totals": totals}


@router.post("")
def create_expense(body: ExpenseBody, owner=Depends(expense_owner)):
    canonical = body.model_dump(mode="json", exclude={"client_id", "version"})
    canonical["amount"] = format(body.amount, ".2f")
    fingerprint = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
    with get_conn() as c:
        if not c.in_transaction:
            c.execute("BEGIN IMMEDIATE")
        existing = c.execute("SELECT * FROM driver_expenses WHERE owner_user_id=? AND client_id=?", (owner, body.client_id)).fetchone()
        if existing:
            if existing["deleted_at"] or existing["create_fingerprint"] != fingerprint:
                raise HTTPException(status_code=409, detail="expense_retry_conflict")
            return {"ok": True, "expense": _item(existing), "deduplicated": True}
        vehicle_id, plate, label = _bindings(c, owner, body)
        expense_id = new_id()
        c.execute("INSERT INTO driver_expenses (id,owner_user_id,client_id,create_fingerprint,deal_id,vehicle_id,vehicle_plate,deal_label,amount_minor,currency,category,description,spent_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (expense_id, owner, body.client_id, fingerprint, body.deal_id, vehicle_id, plate, label,
                   int(body.amount * 100), body.currency, body.category, body.description, body.spent_on.isoformat()))
        row = c.execute("SELECT * FROM driver_expenses WHERE id=?", (expense_id,)).fetchone()
    return {"ok": True, "expense": _item(row)}


@router.put("/{expense_id}")
def edit_expense(expense_id: str, body: ExpenseBody, owner=Depends(expense_owner)):
    if body.version is None:
        raise HTTPException(status_code=422, detail="expense_version_required")
    with get_conn() as c:
        if not c.in_transaction:
            c.execute("BEGIN IMMEDIATE")
        row = c.execute("SELECT * FROM driver_expenses WHERE id=? AND owner_user_id=? AND deleted_at IS NULL", (expense_id, owner)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="expense_not_found")
        if row["version"] != body.version:
            raise HTTPException(status_code=409, detail="expense_changed")
        vehicle_id, plate, label = _bindings(c, owner, body)
        c.execute("UPDATE driver_expenses SET deal_id=?,vehicle_id=?,vehicle_plate=?,deal_label=?,amount_minor=?,currency=?,category=?,description=?,spent_on=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_user_id=?",
                  (body.deal_id, vehicle_id, plate, label, int(body.amount * 100), body.currency, body.category,
                   body.description, body.spent_on.isoformat(), expense_id, owner))
        result = c.execute("SELECT * FROM driver_expenses WHERE id=?", (expense_id,)).fetchone()
    return {"ok": True, "expense": _item(result)}


@router.delete("/{expense_id}")
def delete_expense(expense_id: str, version: int = Query(ge=1), owner=Depends(expense_owner)):
    with get_conn() as c:
        if not c.in_transaction:
            c.execute("BEGIN IMMEDIATE")
        row = c.execute("SELECT version,deleted_at FROM driver_expenses WHERE id=? AND owner_user_id=?", (expense_id, owner)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="expense_not_found")
        if row["deleted_at"]:
            return {"ok": True}
        if row["version"] != version:
            raise HTTPException(status_code=409, detail="expense_changed")
        c.execute("UPDATE driver_expenses SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=? AND owner_user_id=?", (expense_id, owner))
    return {"ok": True}
