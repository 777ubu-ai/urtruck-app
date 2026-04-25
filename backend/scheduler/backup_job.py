"""Автобэкап SQLite базы раз в час. Хранит последние 48 снапшотов (=2 суток)."""
import sys
import shutil
import sqlite3
from pathlib import Path
from datetime import datetime
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config

BACKUP_DIR = Path("/home/ubuntu/urtruck-security/backups")
MAX_BACKUPS = 48


def run_backup():
    """Снимок БД через sqlite3 .backup() — безопасен при активной записи."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    src = Path(config.DB_PATH)
    if not src.exists():
        print(f"[backup] source not found: {src}")
        return None

    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    dst = BACKUP_DIR / f"security-{ts}.db"

    try:
        # безопасный online backup через SQLite API
        src_conn = sqlite3.connect(str(src))
        dst_conn = sqlite3.connect(str(dst))
        with dst_conn:
            src_conn.backup(dst_conn)
        dst_conn.close()
        src_conn.close()

        # Ротация
        files = sorted(BACKUP_DIR.glob("security-*.db"))
        while len(files) > MAX_BACKUPS:
            oldest = files.pop(0)
            oldest.unlink(missing_ok=True)

        size_kb = dst.stat().st_size / 1024
        print(f"[backup] {dst.name} ({size_kb:.1f} KB) · total={len(files)+1}")
        return str(dst)
    except Exception as e:
        print(f"[backup] failed: {e}")
        return None


if __name__ == "__main__":
    run_backup()
