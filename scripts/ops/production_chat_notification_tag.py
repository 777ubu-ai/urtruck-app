"""Guarded compatibility patch: tag FCM chat notifications by room."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request

EXPECTED = "348ebc35817fa9f59381bd6a80dd6babddb059ea00d1598ca00782e7365055c5"
MARKER = "        try:\n            resp = httpx.post(\n                f\"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send\","
INSERT = """        # UrTruck room tag: OS-rendered FCM notifications may lose custom
        # data when Expo enumerates the tray. Keep room identity in native tag.
        room_id = (data or {}).get("room_id")
        if (data or {}).get("type") in ("chat_message", "chat_attachment") and isinstance(room_id, str):
            import re
            if re.fullmatch(r"[A-Za-z0-9_.-]{1,59}", room_id):
                payload["message"]["android"]["notification"]["tag"] = f"chat:{room_id}"
"""

def patched(source):
    if source.count(MARKER) != 1:
        raise ValueError("FCM marker mismatch")
    if "UrTruck room tag:" in source:
        raise ValueError("Already patched")
    result = source.replace(MARKER, INSERT + MARKER)
    compile(result, "push_gateway.py", "exec")
    return result

def restart():
    env = dict(os.environ)
    env["PATH"] = "/home/ubuntu/.nvm/versions/node/v22.15.0/bin:" + env.get("PATH", "")
    subprocess.run(["/home/ubuntu/.nvm/versions/node/v22.15.0/bin/pm2", "restart", "urtruck-security-api"],
                   env=env, check=True, stdout=subprocess.DEVNULL)
    for _ in range(20):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8001/api/v1/system/info", timeout=2) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(1)
    raise RuntimeError("API health failed")

def patched_badge(source):
    if '@notif_router.get("/badge")' in source:
        raise ValueError("Badge endpoint already present")
    result = source + '\n# Installed-client compatibility: same count as native push payloads.\n@notif_router.get("/badge")\ndef canonical_badge_count(user=Depends(require_level(1))):\n    from services.push_sender import _compute_recipient_badge\n    return {"badge": _compute_recipient_badge(user["id"])}\n'
    compile(result, "notifications.py", "exec")
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback")
    parser.add_argument("--badge-compat", action="store_true")
    args = parser.parse_args()
    path = Path("/home/ubuntu/urtruck/backend/api/notifications.py" if args.badge_compat else "/home/ubuntu/urtruck/backend/services/push_gateway.py")
    expected = "0b9fc184e5a2ae615d0d75be8b1a0c324efc49409f4a3ee8f5ebe261c8268838" if args.badge_compat else EXPECTED
    filename = path.name
    if args.rollback:
        backup = Path(args.rollback)
        meta = json.loads((backup / "manifest.json").read_text())
        if hashlib.sha256(path.read_bytes()).hexdigest() != meta["patched_sha256"]:
            raise SystemExit("Rollback source changed; refusing")
        shutil.copy2(backup / filename, path)
        restart()
        print("ROLLED_BACK")
        return
    source = path.read_text()
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit("Production source changed; refusing")
    result = patched_badge(source) if args.badge_compat else patched(source)
    after_hash = hashlib.sha256(result.encode()).hexdigest()
    if not args.apply:
        print("PREFLIGHT_PASS", after_hash)
        return
    backup = Path("/home/ubuntu/urtruck-push-recovery-backups") / time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    backup.mkdir(parents=True, mode=0o700, exist_ok=False)
    shutil.copy2(path, backup / filename)
    os.chmod(backup / filename, 0o600)
    (backup / "manifest.json").write_text(json.dumps({"before_sha256": expected, "patched_sha256": after_hash, "file": filename}))
    os.chmod(backup / "manifest.json", 0o600)
    try:
        path.write_text(result)
        restart()
    except Exception:
        shutil.copy2(backup / filename, path)
        restart()
        raise
    print("APPLIED", str(backup), after_hash)

if __name__ == "__main__":
    main()
