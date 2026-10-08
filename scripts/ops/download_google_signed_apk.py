"""Read-only Google Play APK retrieval; encrypted artifact only."""
import argparse, hashlib, hmac, json, os, re, time
from pathlib import Path
from urllib.parse import quote
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
from cryptography.hazmat.primitives import hashes, serialization, padding as symmetric_padding
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

CERT = "4424ed7c5650c9a569fcc6b55220767c3a7434f0d7c249b9c95ad9b1ec94fc4d"
BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.urtruck.app/generatedApks/"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9]{1,10}", args.version) or not re.fullmatch(r"[0-9a-f]{40}", args.source_sha):
        raise SystemExit("Invalid version/source")
    info = json.loads(os.environ["PLAY_SERVICE_ACCOUNT_JSON"])
    creds = service_account.Credentials.from_service_account_info(info, scopes=["https://www.googleapis.com/auth/androidpublisher"])
    session = AuthorizedSession(creds)
    group = None
    for attempt in range(12):
        response = session.get(BASE + args.version, timeout=30, allow_redirects=False)
        if response.status_code == 200:
            group = next((g for g in response.json().get("generatedApks", [])
                          if str(g.get("certificateSha256Hash", "")).replace(":", "").lower() == CERT
                          and g.get("generatedUniversalApk", {}).get("downloadId")), None)
            if group:
                break
        elif response.status_code not in (404, 409, 429, 500, 503):
            raise SystemExit(f"Generated APK metadata HTTP {response.status_code}")
        time.sleep(15)
    if not group:
        raise SystemExit("No compatible Google-signed universal APK ready")
    download_id = group["generatedUniversalApk"]["downloadId"]
    response = session.get(BASE + args.version + "/downloads/" + quote(download_id, safe="") + ":download?alt=media",
                           timeout=(30, 120), stream=True, allow_redirects=False)
    if response.status_code != 200:
        raise SystemExit(f"APK download HTTP {response.status_code}; redirects not followed")
    out = Path(args.out); out.mkdir(mode=0o700, parents=True, exist_ok=True)
    key, mac_key, iv = os.urandom(32), os.urandom(32), os.urandom(16)
    encryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    padder = symmetric_padding.PKCS7(128).padder()
    sha, cipher_sha = hashlib.sha256(), hashlib.sha256()
    mac = hmac.new(mac_key, iv, hashlib.sha256)
    size = 0
    with (out / "UrTruck.apk.enc").open("wb") as f:
        for chunk in response.iter_content(1024 * 1024):
            if not chunk: continue
            if not size and not chunk.startswith(b"PK"):
                raise SystemExit("Downloaded response is not an APK ZIP")
            size += len(chunk); sha.update(chunk)
            encrypted = encryptor.update(padder.update(chunk))
            f.write(encrypted); cipher_sha.update(encrypted); mac.update(encrypted)
        encrypted = encryptor.update(padder.finalize()) + encryptor.finalize()
        f.write(encrypted); cipher_sha.update(encrypted); mac.update(encrypted)
    pub = serialization.load_pem_public_key(Path(".github/keys/device-qa-apk-encryption.pub").read_bytes())
    encrypted_key = pub.encrypt(key + mac_key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    (out / "UrTruck.apk.key.enc").write_bytes(encrypted_key)
    manifest = {"source_sha": args.source_sha, "apk_sha256": sha.hexdigest(), "ciphertext_sha256": cipher_sha.hexdigest(),
                "iv_hex": iv.hex(), "hmac_sha256": mac.hexdigest(), "package": "com.urtruck.app", "version_code": int(args.version),
                "certificate_sha256": CERT, "downloaded_bytes": size, "origin": "Google Play generatedapks API"}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print("Google-signed APK encrypted:", args.version, size, sha.hexdigest())

if __name__ == "__main__":
    main()
