"""Отдельное подключение SQLite внешней ленты, без бизнес-таблиц UrTruck."""
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import config


def database_path():
    primary = Path(config.DB_PATH).expanduser().resolve()
    configured = os.getenv("EXTERNAL_FREIGHT_DB_PATH", "").strip()
    path = Path(configured).expanduser().resolve() if configured else primary.with_name("external-freight.sqlite3")
    if path == primary or (path.exists() and primary.exists() and path.samefile(primary)):
        raise RuntimeError("external_feed_database_must_be_separate")
    return path


@contextmanager
def get_conn():
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        with conn:
            yield conn
    finally:
        conn.close()


def new_id():
    return str(uuid4())
