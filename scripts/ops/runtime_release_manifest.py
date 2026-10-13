"""Проверка установленного кода: не импортирует приложение и не меняет его БД."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import shutil
from pathlib import Path, PurePosixPath

EXCLUDED = {"tests", "test", "venv", ".venv", "__pycache__", "backups", "storage", "models", ".pytest_cache"}
REQUIRED = {"api/notifications.py", "services/push_sender.py", "api/chat.py", "services/translate_service.py"}


def runtime_path(name: str) -> bool:
    p = PurePosixPath(name)
    return (not p.is_absolute() and ".." not in p.parts and not (set(p.parts) & EXCLUDED)
            and (p.suffix in {".py", ".sql"} or (p.parent == PurePosixPath("qa_ai_service/translation_memory/data") and p.suffix == ".jsonl") or p.name in {"requirements.txt", "requirements-test.txt"}))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_destination(root: Path, name: str) -> Path:
    if not name or not runtime_path(name) or str(PurePosixPath(name)) != name:
        raise ValueError("Invalid runtime path: " + name)
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Missing or unsafe backend root")
    # Проверить даже отсутствующий файл кандидата: dangling symlink и любой
    # symlink-родитель нельзя принимать перед scp overlay.
    current = root
    parts = PurePosixPath(name).parts
    for index, part in enumerate(parts):
        current = current / part
        if current.is_symlink():
            raise ValueError("Missing or unsafe runtime file (symlink): " + name)
        if current.exists():
            expected_kind = current.is_file() if index == len(parts) - 1 else current.is_dir()
            if not expected_kind:
                raise ValueError("Unsafe runtime destination: " + name)
    return root / name


def safe_file(root: Path, name: str) -> Path:
    target = safe_destination(root, name)
    if not target.resolve().is_relative_to(root.resolve()) or target.is_symlink() or not target.is_file():
        raise ValueError("Missing or unsafe runtime file: " + name)
    return target


def runtime_inventory(root: Path) -> set[str]:
    actual = set()
    def fail_scan(error):
        raise error
    for directory, dirs, files in os.walk(root, followlinks=False, onerror=fail_scan):
        parent = Path(directory)
        dirs[:] = [name for name in dirs if name not in EXCLUDED]
        for name in dirs:
            if (parent / name).is_symlink():
                raise ValueError("Unsafe runtime directory symlink: " + (parent / name).relative_to(root).as_posix())
        for name in files:
            path = (parent / name).relative_to(root).as_posix()
            if runtime_path(path):
                safe_file(root, path)
                actual.add(path)
    return actual


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
    actual = runtime_inventory(root)
    if actual != set(files):
        raise ValueError("Unexpected or untracked runtime files")
    return {"status": "verified", "source_sha": manifest["source_sha"], "environment": environment, "files": len(files)}


def verify_transition(current: dict, candidate: dict, environment: str, root: Path) -> None:
    # Overlay deploy не умеет безопасно удалять файлы. Остановить ДО writes,
    # вместо rm в live backend или частично установленной версии.
    files = candidate.get("files")
    if (candidate.get("schema") != 1 or candidate.get("environment") != environment
            or not re.fullmatch(r"[0-9a-f]{40}", str(candidate.get("source_sha", "")))
            or not isinstance(files, dict) or not REQUIRED.issubset(files)):
        raise ValueError("Invalid candidate transition manifest")
    for name, wanted in files.items():
        if (not isinstance(name, str) or not runtime_path(name) or str(PurePosixPath(name)) != name
                or not isinstance(wanted, str) or not re.fullmatch(r"[0-9a-f]{64}", wanted)):
            raise ValueError("Invalid candidate runtime entry")
        safe_destination(root, name)
    if set(current["files"]) - set(files):
        raise ValueError("Runtime file removals require a staged migration before production writes")


def pm2_output(arguments: list[str]) -> str:
    executable = shutil.which("pm2")
    if executable is None:
        candidates = sorted((Path.home() / ".nvm/versions/node").glob("*/bin/pm2"))
        candidates += [Path.home() / ".local/bin/pm2", Path.home() / ".local/share/pnpm/pm2", Path("/usr/local/bin/pm2"), Path("/usr/bin/pm2")]
        executable = next((str(p) for p in candidates if p.is_file() and os.access(p, os.X_OK)), None)
    if executable is None:
        raise ValueError("PM2 executable missing")
    env = os.environ.copy()
    env["PATH"] = str(Path(executable).parent) + os.pathsep + env.get("PATH", "")
    return subprocess.check_output([executable, *arguments], text=True, env=env)


def pm2_pid(name: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
        raise ValueError("Invalid PM2 process name")
    lines = pm2_output(["pid", name]).splitlines()
    if len(lines) != 1 or not re.fullmatch(r"[1-9][0-9]*", lines[0]):
        raise ValueError("PM2 process identity missing or ambiguous")
    return lines[0]


def verify_stopped_pm2(root: Path, name: str) -> None:
    # Не печатать jlist: он содержит environment. Только проверки в памяти.
    processes = json.loads(pm2_output(["jlist"]))
    matches = [p for p in processes if p.get("name") == name]
    if len(matches) != 1:
        raise ValueError("Stopped PM2 identity missing or ambiguous")
    process = matches[0]
    env = process.get("pm2_env", {})
    if process.get("pid") != 0 or env.get("status") not in {"stopped", "errored"}:
        raise ValueError("Recovery requires a stopped PM2 process")
    cwd = env.get("pm_cwd")
    if not isinstance(cwd, str) or Path(cwd).resolve() != root.resolve():
        raise ValueError("Stopped PM2 uses a different backend root")


def verify_listener(root: Path, port: int, pm2_process: str | None = None, recover_stopped: bool = False) -> None:
    if not 1 <= port <= 65535:
        raise ValueError("Invalid listener port")
    output = subprocess.check_output(["ss", "-ltnpH", f"sport = :{port}"], text=True)
    if not output.strip() and recover_stopped:
        if not pm2_process:
            raise ValueError("Recovery requires a named PM2 process")
        verify_stopped_pm2(root, pm2_process)
        return
    pids = set(re.findall(r"pid=(\d+)", output))
    if len(pids) != 1:
        raise ValueError("Listener identity missing or ambiguous")
    pid = next(iter(pids))
    if pm2_process is not None and pid != pm2_pid(pm2_process):
        raise ValueError("Listener is not the named PM2 process")
    cwd = Path(os.readlink(f"/proc/{pid}/cwd")).resolve()
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
    parser.add_argument("--pm2-process")
    parser.add_argument("--candidate-manifest", type=Path)
    parser.add_argument("--recover-stopped", action="store_true")
    args = parser.parse_args()
    if args.recover_stopped and (args.action != "verify" or args.listener_port is None or args.candidate_manifest is None):
        raise ValueError("Recovery is allowed only for candidate preflight with listener identity")
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
        current = json.loads(args.manifest.read_text())
        proof = verify(args.root, current, args.environment, args.source_sha)
        if args.candidate_manifest is not None:
            verify_transition(current, json.loads(args.candidate_manifest.read_text()), args.environment, args.root)
        if args.listener_port is not None:
            verify_listener(args.root, args.listener_port, args.pm2_process, args.recover_stopped)
    print(json.dumps(proof))


if __name__ == "__main__":
    main()
