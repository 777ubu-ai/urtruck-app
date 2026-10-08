"""Guarded production recovery. Default is read-only; --apply changes only chat API and AI config."""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request

KEYS = ["OPENAI_API_KEY", "TRANSLATE_PROVIDER", "TRANSCRIBE_PROVIDER", "TRANSLATE_MODEL", "TRANSCRIBE_MODEL"]
PM2 = "/home/ubuntu/.nvm/versions/node/v22.15.0/bin/pm2"
NODE_BIN = str(Path(PM2).parent)
BACKEND = Path("/home/ubuntu/urtruck/backend")
BACKUP_ROOT = Path("/home/ubuntu/urtruck-ai-recovery-backups")

def parse_env(path):
    return dict((k.strip(), v.strip()) for line in path.read_text().splitlines()
                if "=" in line and not line.lstrip().startswith("#")
                for k, v in [line.split("=", 1)])

def pm2(args, updates=None):
    env = dict(os.environ, PATH=NODE_BIN+":"+os.environ.get("PATH",""))
    env.update(updates or {})
    result = subprocess.run([PM2, *args], env=env, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("PM2 operation failed; inspect private server logs")
    return result.stdout

def restart(updates):
    pm2(["restart", "urtruck-security-api", "--update-env"], updates)
    for _ in range(20):
        time.sleep(1)
        try:
            with urllib.request.urlopen("http://127.0.0.1:8001/api/v1/system/info", timeout=3) as r:
                if r.status == 200:
                    pm2(["save"])
                    return
        except Exception:
            pass
    raise RuntimeError("Production health did not recover")

def restore(backup):
    for name, target in [("chat.py", BACKEND/"api/chat.py"), ("backend.env",BACKEND/".env")]:
        shutil.copy2(backup/name, target)
    state = json.loads((backup/"old-ai-env.json").read_text())
    restart(state)
    print("ROLLBACK_OK", str(backup))

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--expected-chat-sha256")
    p.add_argument("--credential-env", type=Path, default=Path("/home/ubuntu/urtruck-qa2/.env"))
    p.add_argument("--apply", action="store_true")
    p.add_argument("--rollback", type=Path)
    args = p.parse_args()
    if args.rollback:
        restore(args.rollback)
        return
    chat = BACKEND/"api/chat.py"
    original = chat.read_bytes()
    digest = hashlib.sha256(original).hexdigest()
    if not args.expected_chat_sha256 or digest != args.expected_chat_sha256:
        raise RuntimeError("Production chat source changed; review again")
    if b'@chat_router.get("/voice/{message_id}/text")' in original:
        raise RuntimeError("Voice text endpoint already exists; no patch needed")
    snippet = Path(__file__).with_name("production_voice_text_compat.py").read_bytes()
    patched = original+b"\n"+snippet
    ast.parse(patched.decode())
    old = parse_env(BACKEND/".env")
    credential = parse_env(args.credential_env).get("OPENAI_API_KEY","")
    if not credential or credential.startswith(("'", '"')):
        raise RuntimeError("Credential missing or quoted; review without exposing it")
    request = urllib.request.Request("https://api.openai.com/v1/models",
                                     headers={"Authorization": "Bearer "+credential})
    with urllib.request.urlopen(request, timeout=15) as r:
        models = {item["id"] for item in json.load(r)["data"]}
    if not {"gpt-4o-mini","gpt-4o-mini-transcribe"}.issubset(models):
        raise RuntimeError("Required models are not available to the existing credential")
    updates = dict(OPENAI_API_KEY=credential, TRANSLATE_PROVIDER="openai",
                   TRANSCRIBE_PROVIDER="openai", TRANSLATE_MODEL="gpt-4o-mini",
                   TRANSCRIBE_MODEL="gpt-4o-mini-transcribe")
    print("PRECHECK_OK source="+digest+" credential_valid=true models_available=true")
    if not args.apply:
        print("READ_ONLY: no files or processes changed; no inference requested")
        return
    entries = json.loads(pm2(["jlist"]))
    process = next(item for item in entries if item["name"] == "urtruck-security-api")
    if process["pm2_env"].get("pm_cwd") != str(BACKEND):
        raise RuntimeError("Production process cwd changed; review again")
    effective = {key: str(process["pm2_env"].get(key, old.get(key, ""))) for key in KEYS}
    backup = BACKUP_ROOT/time.strftime("%Y%m%dT%H%M%SZ",time.gmtime())
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    backup.parent.chmod(0o700)
    shutil.copy2(chat, backup/"chat.py")
    shutil.copy2(BACKEND/".env", backup/"backend.env")
    (backup/"old-ai-env.json").write_text(json.dumps(effective))
    for path in backup.iterdir():
        path.chmod(0o600)
    lines = [line for line in (BACKEND/".env").read_text().splitlines()
             if line.split("=",1)[0].strip() not in updates]
    new_env = "\n".join(lines+[key+"="+value for key,value in updates.items()])+"\n"
    try:
        chat.write_bytes(patched)
        (BACKEND/".env").write_text(new_env)
        (BACKEND/".env").chmod(0o600)
        restart(updates)
        print("APPLIED backup="+str(backup))
    except Exception:
        restore(backup)
        raise RuntimeError("Recovery failed and was rolled back") from None

if __name__ == "__main__":
    main()
