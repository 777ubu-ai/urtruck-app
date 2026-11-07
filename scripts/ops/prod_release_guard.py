#!/usr/bin/env python3
"""Паспорт кода Production backend и защита от затирания при деплое.

Паспорт (JSON) лежит на сервере вне каталога кода и описывает, какой коммит
сейчас на Production и какие у его файлов git-хеши (blob sha1):

    {"source_sha": "<коммит>", "tag": "backend-v1.2.0", "recorded_at": "...",
     "files": {"api/push.py": "<blob sha1>", ...}}

Команды (запускаются на сервере, только стандартная библиотека Python):

  verify  — сравнить живые файлы backend с паспортом. Любое расхождение
            (ручная правка, лишний или пропавший файл кода) = отказ (код 3).
            Нет паспорта = отказ (код 2): без паспорта деплой не разрешён.
            При успехе печатает строку ``PROD_RELEASE_SHA=<sha>``; проверку
            «новый коммит содержит этот sha» делает раннер через git.
  record  — записать паспорт по живым файлам после успешного деплоя
            (атомарно, права 600).

Секреты, базы, бэкапы, venv и прочие данные в паспорт не попадают.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_MANIFEST = "/home/ubuntu/urtruck/runtime/prod-release.json"

# Каталоги верхнего уровня backend, которые не являются кодом.
SKIP_TOP_DIRS = {"backups", "storage", "storage_local", "data", "logs", "secrets", "venv", ".venv"}
SKIP_TOP_PREFIXES = (".payments-bk",)
# Файлы, которые не являются кодом (секреты, базы, журналы, кеши).
SKIP_FILE_RE = re.compile(
    r"(^|/)(\.env[^/]*|[^/]*\.(db|pyc|log|pid)|[^/]*\.db-(wal|shm)|[^/]*\.sqlite3[^/]*)$"
)
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def git_blob_sha1(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def code_files(backend_dir: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for root, dirs, files in os.walk(backend_dir):
        rel_root = Path(root).relative_to(backend_dir)
        if rel_root == Path("."):
            dirs[:] = [d for d in dirs if d not in SKIP_TOP_DIRS and not d.startswith(SKIP_TOP_PREFIXES)]
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for name in files:
            rel = (rel_root / name).as_posix()
            if SKIP_FILE_RE.search(rel):
                continue
            path = Path(root) / name
            if path.is_symlink() or not path.is_file():
                continue
            result[rel] = git_blob_sha1(path.read_bytes())
    return dict(sorted(result.items()))


def load_manifest(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not SHA_RE.match(str(data.get("source_sha", ""))) or not isinstance(data.get("files"), dict):
        raise ValueError("invalid_manifest")
    return data


def diff(expected: dict[str, str], live: dict[str, str]) -> dict[str, list[str]]:
    return {
        "changed": sorted(p for p in expected if p in live and live[p] != expected[p]),
        "missing": sorted(p for p in expected if p not in live),
        "extra": sorted(p for p in live if p not in expected),
    }


def cmd_verify(args) -> int:
    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        print("PROD_RELEASE_GUARD=BLOCKED_NO_MANIFEST")
        print(f"::error::Нет паспорта Production ({manifest_path}). Деплой запрещён.")
        return 2
    try:
        manifest = load_manifest(manifest_path)
    except (OSError, ValueError, json.JSONDecodeError):
        print("PROD_RELEASE_GUARD=BLOCKED_BAD_MANIFEST")
        return 2
    delta = diff(manifest["files"], code_files(Path(args.backend_dir)))
    if any(delta.values()):
        print("PROD_RELEASE_GUARD=BLOCKED_DRIFT")
        print(f"::error::Код Production изменён вне Git относительно {manifest.get('tag') or manifest['source_sha']}. "
              "Сначала зафиксируйте эти файлы в Git и перезапишите паспорт.")
        for kind, paths in delta.items():
            for path in paths[:50]:
                print(f"  {kind}: {path}")
        return 3
    print(f"PROD_RELEASE_TAG={manifest.get('tag') or ''}")
    print(f"PROD_RELEASE_SHA={manifest['source_sha']}")
    print("PROD_RELEASE_GUARD=OK")
    return 0


def cmd_record(args) -> int:
    if not SHA_RE.match(args.source_sha):
        print("::error::--source-sha должен быть полным sha коммита")
        return 2
    manifest_path = Path(args.manifest)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "source_sha": args.source_sha,
        "tag": args.tag or "",
        "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "files": code_files(Path(args.backend_dir)),
    }
    fd, tmp = tempfile.mkstemp(dir=str(manifest_path.parent), prefix=".prod-release.", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1, sort_keys=True)
        os.chmod(tmp, 0o600)
        os.replace(tmp, manifest_path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    print(f"PROD_RELEASE_RECORDED sha={args.source_sha} tag={args.tag or ''} files={len(data['files'])}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("verify", "record"):
        p = sub.add_parser(name)
        p.add_argument("--backend-dir", required=True)
        p.add_argument("--manifest", default=os.getenv("URTRUCK_RELEASE_MANIFEST", DEFAULT_MANIFEST))
        if name == "record":
            p.add_argument("--source-sha", required=True)
            p.add_argument("--tag", default="")
    args = parser.parse_args(argv)
    return cmd_verify(args) if args.command == "verify" else cmd_record(args)


if __name__ == "__main__":
    sys.exit(main())
