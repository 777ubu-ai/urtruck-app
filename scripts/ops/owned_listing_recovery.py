"""Адресная коррекция expired по проверенному allowlist; по умолчанию dry-run.

Не импортирует приложение, не делает HTTP, не создаёт/удаляет строки.
Review, backup/restore и порядок QA2→production проверяет оператор ДО --apply.
HTTP/API проверяют ПОСЛЕ commit; компенсация возможна только по неизменённому audit.
"""
import argparse
import hashlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

TABLES = {"cargos": ("owner_id", "cargo_id", "taken_by"),
          "trips": ("driver_id", "trip_id", "booked_by")}
SNAPSHOT_TABLES = (*TABLES, "bids", "deals", "drivers_registration")
FIELDS = {"status", "published_at", "updated_at"}


class RecoveryBlocked(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise RecoveryBlocked(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


def stamp(value):
    require(isinstance(value, str) and bool(value.strip()), "Отсутствует дата публикации")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def snapshot(connection):
    return {table: {row["id"]: dict(row) for row in connection.execute("SELECT * FROM " + table + " ORDER BY id")}
            for table in SNAPSHOT_TABLES}


def links(connection, table, listing_id):
    link = TABLES[table][1]
    return {target: [dict(row) for row in connection.execute(
        "SELECT * FROM " + target + " WHERE " + link + "=? ORDER BY id", (listing_id,))]
        for target in ("bids", "deals")}


def check_owner_and_links(connection, table, row):
    owner, _, occupied = TABLES[table]
    account = connection.execute("SELECT status,role FROM drivers_registration WHERE id=?", (row[owner],)).fetchone()
    require(account is not None and all(str(value or "").strip().lower() != "deleted" for value in account),
            "Владелец отсутствует или удалён")
    require(not row.get(occupied), "Объявление имеет ссылку занятости")
    related = links(connection, table, row["id"])
    require(not related["deals"], "Объявление связано со сделкой")
    require(not any(bid["status"] == "accepted" for bid in related["bids"]), "Есть принятая ставка")
    return related


def connect(database, write):
    database = Path(database)
    require(database.is_file() and not database.is_symlink(), "База отсутствует или является symlink")
    connection = sqlite3.connect(database.resolve().as_uri() + ("?mode=rw" if write else "?mode=ro"), uri=True, timeout=15)
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        if not write:
            connection.execute("PRAGMA query_only=ON")
        connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        require(connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "Нарушена целостность БД")
        # Не запускаем неизвестные триггеры с побочными изменениями данных.
        require(not connection.execute("SELECT 1 FROM sqlite_master WHERE type='trigger' AND tbl_name IN ('cargos','trips') LIMIT 1").fetchone(),
                "Триггеры объявлений требуют отдельного анализа")
        return connection
    except BaseException:
        connection.rollback()
        connection.close()
        raise


def write_audit(directory, name, value):
    path = directory / name
    with path.open("x", encoding="utf-8") as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())


def audit_directory(root):
    directory = Path(root) / ("address-recovery-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex)
    directory.mkdir(mode=0o700)
    return directory


def recover(database, allowlist, audit_root, apply=False, now=None):
    now = now or datetime.now(timezone.utc)
    require(now.tzinfo is not None, "Тестовое время должно содержать часовой пояс")
    entries = json.loads(Path(allowlist).read_text())
    require(isinstance(entries, list) and bool(entries), "Пустой или неверный allowlist")
    require(all(isinstance(entry, dict) and entry.get("table") in TABLES and isinstance(entry.get("id"), str) for entry in entries),
            "Неверный тип записи allowlist")
    require(len({(entry["table"], entry["id"]) for entry in entries}) == len(entries), "Повторы в allowlist")
    directory = audit_directory(audit_root)
    connection, committed = connect(database, apply), False
    try:
        before = snapshot(connection)
        changes, already = [], []
        for entry in entries:
            table, listing_id = entry["table"], entry["id"]
            row = before[table].get(listing_id)
            require(row is not None, "Запись allowlist отсутствует")
            owner = TABLES[table][0]
            require(row[owner] == entry["owner_id"] and entry["old_status"] == "expired", "Не совпадает владелец/исходный статус")
            related = check_owner_and_links(connection, table, row)
            old = {**row, "status": entry["old_status"], "published_at": entry["old_published_at"], "updated_at": entry["old_updated_at"]}
            require(digest(old) == entry["expected_row_sha256"], "Изменился полный предобраз записи")
            target = entry["planned_published_at"]
            published = stamp(entry["old_published_at"] or row["created_at"])
            expected_cycle = published + ((now - published) // timedelta(days=30)) * timedelta(days=30)
            require(stamp(target) == expected_cycle and stamp(target) <= now < stamp(target) + timedelta(days=30),
                    "План публикации не соответствует текущему циклу 30 суток")
            if row["status"] == "active" and row["published_at"] == target:
                already.append({"table": table, "id": listing_id})
                continue
            require(digest(row) == entry["expected_row_sha256"], "Изменились статус или даты объявления")
            after = {**row, "status": "active", "published_at": target, "updated_at": now.isoformat().replace("+00:00", "Z")}
            changes.append({"table": table, "before": row, "after": after, "links": related})
        write_audit(directory, "prepared.json", {"schema": 1, "database": str(Path(database).resolve()), "mode": "apply" if apply else "dry-run", "changes": changes, "already_matching": already})
        if apply:
            for change in changes:
                table, old, new = change["table"], change["before"], change["after"]
                cursor = connection.execute("UPDATE " + table + " SET status=?,published_at=?,updated_at=? WHERE id=? AND status=? AND published_at IS ? AND updated_at IS ?",
                                            (new["status"], new["published_at"], new["updated_at"], old["id"], old["status"], old["published_at"], old["updated_at"]))
                require(cursor.rowcount == 1, "Условная запись не затронула ровно одну строку")
        expected = {table: dict(rows) for table, rows in before.items()}
        if apply:
            for change in changes:
                expected[change["table"]][change["before"]["id"]] = change["after"]
        require(snapshot(connection) == expected, "Нарушены инварианты строк/связей/ID")
        if apply:
            connection.commit()
            committed = True
        else:
            connection.rollback()
        result = {"mode": "apply" if apply else "dry-run", "committed": committed,
                  "planned": {table: sum(item["table"] == table for item in changes) for table in TABLES},
                  "applied": {table: sum(item["table"] == table for item in changes) if apply else 0 for table in TABLES},
                  "already_matching": len(already), "audit": str(directory)}
        write_audit(directory, "result.json", result)
        return result
    except BaseException as error:
        if not committed:
            connection.rollback()
        else:
            raise RecoveryBlocked("COMMIT выполнен; ошибка после записи. Проверить приватный audit: " + str(directory)) from error
        raise
    finally:
        connection.close()


def compensate(database, audit, audit_root):
    directory = Path(audit)
    prepared = json.loads((directory / "prepared.json").read_text())
    receipt = directory / "result.json"
    result = json.loads(receipt.read_text()) if receipt.exists() else None
    require((result is None or result.get("committed") is True)
            and prepared.get("mode") == "apply" and prepared.get("schema") == 1, "Нет применимого audit")
    # При сбое записи receipt после COMMIT доказательством остаётся точное
    # совпадение каждой строки с сохранённым post-image и неизменность связей.
    require(prepared["database"] == str(Path(database).resolve()), "Audit относится к другой базе")
    output = audit_directory(audit_root)
    connection, committed = connect(database, True), False
    try:
        before = snapshot(connection)
        changes = prepared["changes"]
        for change in changes:
            table, old, new = change["table"], change["before"], change["after"]
            require(table in TABLES and old["id"] == new["id"] and old["status"] == "expired" and new["status"] == "active",
                    "Некорректный audit записи")
            require({key: value for key, value in old.items() if key not in FIELDS} == {key: value for key, value in new.items() if key not in FIELDS},
                    "Audit меняет поля вне разрешённых трёх")
            require(before[table].get(old["id"]) == new, "Запись изменилась после восстановления; компенсация остановлена")
            require(check_owner_and_links(connection, table, new) == change["links"], "Изменились связи; компенсация остановлена")
        write_audit(output, "compensation-prepared.json", {"source_audit": str(directory), "changes": changes})
        expected = {table: dict(rows) for table, rows in before.items()}
        for change in changes:
            table, old, new = change["table"], change["before"], change["after"]
            cursor = connection.execute("UPDATE " + table + " SET status=?,published_at=?,updated_at=? WHERE id=? AND status=? AND published_at IS ? AND updated_at IS ?",
                                        (old["status"], old["published_at"], old["updated_at"], old["id"], new["status"], new["published_at"], new["updated_at"]))
            require(cursor.rowcount == 1, "Компенсация не затронула ровно одну строку")
            expected[table][old["id"]] = old
        require(snapshot(connection) == expected, "Нарушены инварианты компенсации")
        connection.commit()
        committed = True
        outcome = {"mode": "compensate", "committed": True, "reverted": len(changes), "audit": str(output)}
        write_audit(output, "result.json", outcome)
        return outcome
    except BaseException as error:
        if not committed:
            connection.rollback()
        else:
            raise RecoveryBlocked("Компенсация COMMIT выполнена; проверить приватный audit: " + str(output)) from error
        raise
    finally:
        connection.close()


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--audit-root", required=True, type=Path)
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--allowlist", type=Path)
    actions.add_argument("--compensate", type=Path)
    parser.add_argument("--apply", action="store_true", help="Выполнить проверенную адресную запись, иначе dry-run")
    arguments = parser.parse_args()
    require(not arguments.compensate or arguments.apply, "Компенсация требует --apply")
    if arguments.compensate:
        result = compensate(arguments.database, arguments.compensate, arguments.audit_root)
    else:
        result = recover(arguments.database, arguments.allowlist, arguments.audit_root, arguments.apply)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
