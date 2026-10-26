#!/usr/bin/env python3
"""Dry-run or apply the seven-day TTL to eligible QA2 external-feed cards."""
import argparse
import json
import sqlite3
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path


HOURS = 168
QA2_DATABASE = Path("/home/ubuntu/urtruck-qa2/runtime/external-freight.sqlite3")


def _date(value):
    if not value:
        return None
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def migrate(database, *, apply=False, now=None):
    now = now or datetime.now(timezone.utc)
    path = Path(database)
    uri = path.resolve().as_uri() + ("?mode=rw" if apply else "?mode=ro")
    connection = sqlite3.connect(uri, uri=True, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=" + ("OFF" if apply else "ON"))
    connection.execute("BEGIN IMMEDIATE" if apply else "BEGIN")
    try:
        rows = connection.execute("""SELECT id,kind,status,source_published_at,expires_at
            FROM external_freight_items WHERE status IN ('active','expired')
            AND source_published_at IS NOT NULL""").fetchall()
        changes = []
        summary = Counter()
        for row in rows:
            published = _date(row["source_published_at"])
            expiry = published + timedelta(hours=HOURS)
            new_status = "active" if expiry > now else "expired"
            expiry_text = expiry.isoformat()
            if expiry_text == row["expires_at"] and new_status == row["status"]:
                continue
            changes.append((expiry_text, new_status, row["id"], row["status"], row["kind"], row["source_published_at"]))
            summary[f"{row['kind']}:{row['status']}->{new_status}"] += 1
        if apply:
            if not changes:
                connection.commit()
                return {"mode": "apply", "updated": 0, "changes": {}}
            for expiry, status, item_id, old_status, kind, published in changes:
                connection.execute("UPDATE external_freight_items SET expires_at=?,status=?,updated_at=? WHERE id=?",
                                   (expiry, status, now.isoformat(), item_id))
                details = json.dumps({"from_hours": 120, "to_hours": HOURS,
                                      "source_published_at": published,
                                      "old_status": old_status, "new_status": status}, separators=(",", ":"))
                connection.execute("""INSERT INTO external_freight_audit
                    (id,item_id,actor,action,created_at,details) VALUES(?,?,?,?,?,?)""",
                    (uuid.uuid4().hex, item_id, "retention-migration", "retention_extended", now.isoformat(), details))
            connection.commit()
        else:
            connection.rollback()
        return {"mode": "apply" if apply else "dry_run", "updated": len(changes), "changes": dict(sorted(summary.items()))}
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", default=str(QA2_DATABASE), help="путь к базе внешней ленты QA2")
    parser.add_argument("--apply", action="store_true", help="применить изменения; без флага выполняется только dry-run")
    args = parser.parse_args()
    path = Path(args.database).resolve()
    if args.apply and path != QA2_DATABASE.resolve():
        parser.error("--apply разрешён только для фиксированной базы QA2")
    try:
        result = migrate(path, apply=args.apply)
    except (OSError, sqlite3.Error, ValueError) as exc:
        parser.error(type(exc).__name__)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
