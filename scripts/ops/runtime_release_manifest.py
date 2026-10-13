"""Проверка установленного кода: не импортирует приложение и не меняет его БД."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path, PurePosixPath

EXCLUDED = {"tests", "test", "venv", ".venv", "__pycache__", "backups", "storage", "models", ".pytest_cache"}
REQUIRED = {"api/notifications.py", "services/push_sender.py", "api/chat.py", "services/translate_service.py"}


def runtime_path(name: str) -> bool:
    p = PurePosixPath(name)
    return (not p.is_absolute() and ".." not in p.parts and not (set(p.parts) & EXCLUDED)
            and (p.suffix in {".py", ".sql"} or p.name in {"requirements.txt", "requirements-test.txt"}))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_file(root: Path, name: str) -> Path:
    if not name or not runtime_path(name) or str(PurePosixPath(name)) != name:
        raise ValueError("Invalid runtime path: " + name)
    target = root / name
    if not target.resolve().is_relative_to(root.resolve()) or target.is_symlink() or not target.is_file():
        raise ValueError("Missing or unsafe runtime file: " + name)
    return target


def make_manifest(root: Path, names: list[str], source_sha: str, environment: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40}", source_sha) or environment not in {"production", "qa2", "ci"}:
        raise ValueError("Invalid release identity")
    files = {name: digest(safe_file(root, name)) for name in sorted(set(names))}
    if not REQUIRED.issubset(files):
        raise ValueError("Required push/chat/translation modules missing")
    return {"schema": 1, "source_sha": source_sha, "environment": environment, "files": files}


def verify(root: Path, manifest: dict, environment: str, expected_sha: str | None = None) -> dict:
    if (environment not in {"production", "qa2", "ci"} or manifest.get("schema") != 1 or manifest.get("environment") != environment
            or not re.fullmatch(r"[0-9a-f]{40}", str(manifest.get("source_sha", "")))):
        raise ValueError("Release identity/environment mismatch")
    if expected_sha is not None and manifest["source_sha"] != expected_sha:
        raise ValueError("Source SHA mismatch")
    files = manifest.get("files")
    if not isinstance(files, dict) or not REQUIRED.issubset(files):
        raise ValueError("Incomplete runtime manifest")
    for name, wanted in files.items():
        if not isinstance(name, str) or not isinstance(wanted, str) or not re.fullmatch(r"[0-9a-f]{64}", wanted):
            raise ValueError("Invalid runtime hash")
        if digest(safe_file(root, name)) != wanted:
            raise ValueError("Runtime source drift: " + name)
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and runtime_path(p.relative_to(root).as_posix())}
    if actual != set(files):
        raise ValueError("Unexpected or untracked runtime files")
    return {"status": "verified", "source_sha": manifest["source_sha"], "environment": environment, "files": len(files)}


def verify_listener(root: Path, port: int) -> None:
    if not 1 <= port <= 65535:
        raise ValueError("Invalid listener port")
    output = subprocess.check_output(["ss", "-ltnpH", f"sport = :{port}"], text=True)
    pids = set(re.findall(r"pid=(\d+)", output))
    if len(pids) != 1:
        raise ValueError("Listener identity missing or ambiguous")
    cwd = Path(os.readlink(f"/proc/{next(iter(pids))}/cwd")).resolve()
    if cwd != root.resolve():
        raise ValueError("Live listener uses a different backend root")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["create", "verify"])
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--environment", choices=["production", "qa2", "ci"], required=True)
    parser.add_argument("--source-sha")
    parser.add_argument("--listener-port", type=int)
    args = parser.parse_args()
    if args.action == "create":
        repo = args.root.parent
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
        if sha != args.source_sha:
            raise ValueError("Checkout SHA differs from approved candidate")
        subprocess.run(["git", "diff", "--exit-code", "HEAD", "--", "backend"], cwd=repo, check=True, stdout=subprocess.DEVNULL)
        tracked = subprocess.check_output(["git", "ls-files", "-z", "--", "backend"], cwd=repo).decode().split("\0")
        names = [p.removeprefix("backend/") for p in tracked if p and runtime_path(p.removeprefix("backend/"))]
        manifest = make_manifest(args.root, names, sha, args.environment)
        proof = verify(args.root, manifest, args.environment, sha)
        if args.manifest.exists():
            raise ValueError("Refusing to overwrite a manifest")
        args.manifest.write_text(json.dumps(manifest, indent=2) + "\n")
    else:
        proof = verify(args.root, json.loads(args.manifest.read_text()), args.environment, args.source_sha)
        if args.listener_port is not None:
            verify_listener(args.root, args.listener_port)
    print(json.dumps(proof))


if __name__ == "__main__":
    main()
