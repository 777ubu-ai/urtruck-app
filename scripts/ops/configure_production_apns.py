"""Настройка существующего APNs-ключа. По умолчанию только preflight."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request

BACKEND = Path("/home/ubuntu/urtruck/backend")
BACKUPS = Path("/home/ubuntu/urtruck-apns-recovery-backups")
PM2 = "/home/ubuntu/.nvm/versions/node/v22.15.0/bin/pm2"
PROCESS = "urtruck-security-api"
KEYS = ("APNS_KEY_ID", "APNS_TEAM_ID", "APNS_BUNDLE_ID", "APNS_AUTH_KEY_P8", "APNS_USE_SANDBOX")
AI_KEYS = ("OPENAI_API_KEY", "TRANSLATE_PROVIDER", "TRANSCRIBE_PROVIDER", "TRANSLATE_MODEL", "TRANSCRIBE_MODEL")
SOURCE_HASHES = {
    "api/chat.py": "80619b090b46559587ceb6d3722c1cd308cbd44345d24e4748f7e1fe6ecef080",
    "api/notifications.py": "235871e8dc7ba05d4f43b7e5deb9b52f96bc13ce7797edaa8a37050f6f7ee084",
    "services/push_gateway.py": "cbda81eb8a8e5b9c62a617fb5010c9af5577643da1b8543da498d4ce846afe56",
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def env_with_apns(original, values):
    # Сохраняем все остальные строки, включая комментарии и AI-конфигурацию.
    lines = original.decode().splitlines(keepends=True)
    lines = [line for line in lines if line.split("=", 1)[0].strip() not in KEYS]
    base = "".join(lines)
    if base and not base.endswith("\n"):
        base += "\n"
    return (base + "".join(k + "=" + values[k].replace("\n", "\\n") + "\n" for k in KEYS)).encode()

def validate(values):
    if set(values) != set(KEYS) or not all(isinstance(values[k], str) and values[k] for k in KEYS):
        raise RuntimeError("Invalid APNs input fields")
    if not re.fullmatch(r"[A-Z0-9]{10}", values["APNS_KEY_ID"]) or not re.fullmatch(r"[A-Z0-9]{10}", values["APNS_TEAM_ID"]):
        raise RuntimeError("Invalid APNs identifiers")
    if values["APNS_BUNDLE_ID"] != "com.urtruck.app" or values["APNS_USE_SANDBOX"] != "false":
        raise RuntimeError("Wrong APNs app/environment")
    from cryptography.hazmat.primitives.serialization import load_pem_private_key
    from cryptography.hazmat.primitives.asymmetric import ec
    key = load_pem_private_key(values["APNS_AUTH_KEY_P8"].encode(), None)
    if not isinstance(key, ec.EllipticCurvePrivateKey) or key.curve.name != "secp256r1":
        raise RuntimeError("Invalid APNs P-256 key")
    import jwt
    import httpx
    token = jwt.encode({"iss": values["APNS_TEAM_ID"], "iat": int(time.time())},
                       values["APNS_AUTH_KEY_P8"], algorithm="ES256",
                       headers={"kid": values["APNS_KEY_ID"]})
    if not isinstance(token, str) or len(token.split(".")) != 3:
        raise RuntimeError("APNs signing unavailable")
    with httpx.Client(http2=True):
        pass

def pm2(args, updates=None):
    env = dict(os.environ)
    env["PATH"] = str(Path(PM2).parent) + ":" + env.get("PATH", "")
    env.update(updates or {})
    r = subprocess.run([PM2, *args], env=env, text=True, capture_output=True)
    if r.returncode:
        raise RuntimeError("PM2 failed; inspect private server logs")
    return r.stdout

def processes():
    return json.loads(pm2(["jlist"]))

def current(items):
    matches = [p for p in items if p["name"] == PROCESS]
    if len(matches) != 1 or matches[0]["pm2_env"].get("pm_cwd") != str(BACKEND):
        raise RuntimeError("Production process identity changed")
    return matches[0]

def protected_sources():
    if any(sha((BACKEND / name).read_bytes()) != digest for name, digest in SOURCE_HASHES.items()):
        raise RuntimeError("Protected production source changed")

def restart(values):
    pm2(["restart", PROCESS, "--update-env"], values)
    for _ in range(20):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8001/api/v1/system/info", timeout=2) as r:
                if r.status == 200:
                    return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("Production health failed")

def restore(backup):
    if backup.parent.resolve() != BACKUPS.resolve():
        raise RuntimeError("Unexpected rollback path")
    meta = json.loads((backup / "manifest.json").read_text())
    path = BACKEND / ".env"
    if sha(path.read_bytes()) != meta["applied_env_sha256"]:
        raise RuntimeError("Environment changed after apply; refusing rollback")
    protected_sources()
    shutil.copy2(backup / "backend.env", path)
    restart(json.loads((backup / "old-apns-env.json").read_text()))
    pm2(["save"])
    print("ROLLBACK_OK", str(backup), flush=True)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--credentials", type=Path)
    p.add_argument("--expected-env-sha256")
    p.add_argument("--apply", action="store_true")
    p.add_argument("--rollback", type=Path)
    a = p.parse_args()
    if a.rollback:
        restore(a.rollback)
        return
    protected_sources()
    path = BACKEND / ".env"
    original = path.read_bytes()
    if not a.expected_env_sha256 or sha(original) != a.expected_env_sha256:
        raise RuntimeError("Production env changed; refusing")
    if not a.credentials or (a.credentials.stat().st_mode & 0o077):
        raise RuntimeError("Missing/private credential file required")
    values = json.loads(a.credentials.read_text())
    validate(values)
    before = processes()
    proc = current(before)
    old = {k: str(proc["pm2_env"].get(k, "")) for k in KEYS}
    ai = {k: proc["pm2_env"].get(k) for k in AI_KEYS}
    others = {p["name"]: (p["pid"], p["pm2_env"].get("restart_time")) for p in before if p["name"] != PROCESS}
    patched = env_with_apns(original, values)
    print("PREFLIGHT_OK signing=true http2=true protected_sources=true", flush=True)
    if not a.apply:
        print("READ_ONLY no files/processes changed", flush=True)
        return
    backup = BACKUPS / time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    BACKUPS.chmod(0o700)
    shutil.copy2(path, backup / "backend.env")
    (backup / "old-apns-env.json").write_text(json.dumps(old))
    (backup / "manifest.json").write_text(json.dumps({
        "before_env_sha256": sha(original), "applied_env_sha256": sha(patched), "source_hashes": SOURCE_HASHES,
    }))
    for f in backup.iterdir():
        f.chmod(0o600)
    print("BACKUP", str(backup), flush=True)
    try:
        path.write_bytes(patched)
        path.chmod(0o600)
        restart(values)
        after = processes()
        effective = current(after)["pm2_env"]
        if any(effective.get(k) != values[k] for k in KEYS):
            raise RuntimeError("APNs effective environment mismatch")
        if any(effective.get(k) != ai[k] for k in AI_KEYS):
            raise RuntimeError("Protected AI environment changed")
        if {p["name"]: (p["pid"], p["pm2_env"].get("restart_time")) for p in after if p["name"] != PROCESS} != others:
            raise RuntimeError("Unrelated process changed")
        protected_sources()
        pm2(["save"])
    except Exception:
        # Только собственное изменение env можно автоматически откатить.
        restore(backup)
        raise RuntimeError("APNs apply failed and was rolled back") from None
    print("APPLIED health=200 ai_preserved=true other_processes_preserved=true backup=" + str(backup), flush=True)

if __name__ == "__main__":
    main()
