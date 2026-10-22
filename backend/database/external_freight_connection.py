"""Отдельное подключение SQLite внешней ленты, без бизнес-таблиц UrTruck."""
import os
import sqlite3
import stat
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import config


def _secure_database_files(path: Path):
    """Закрывает базу ленты и её файлы SQLite, включая уже созданные."""
    nofollow = getattr(os, "O_NOFOLLOW", 0)

    def secure_file(file_path: Path, *, create: bool):
        flags = os.O_RDWR | nofollow
        if create:
            flags |= os.O_CREAT
        try:
            fd = os.open(file_path, flags, 0o600)
        except FileNotFoundError:
            return
        try:
            if not stat.S_ISREG(os.fstat(fd).st_mode):
                raise RuntimeError("external_feed_database_file_not_regular")
            os.fchmod(fd, 0o600)
        finally:
            os.close(fd)

    secure_file(path, create=True)
    for suffix in ("-wal", "-shm", "-journal"):
        secure_file(Path(str(path) + suffix), create=False)


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
    _secure_database_files(path)
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
