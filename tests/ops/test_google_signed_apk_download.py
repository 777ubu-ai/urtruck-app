import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import hashlib
import hmac
from cryptography.hazmat.primitives import hashes, serialization, padding as symmetric_padding
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

class DownloadTests(unittest.TestCase):
    def load(self):
        modules = {name: types.ModuleType(name) for name in ["google", "google.oauth2", "google.oauth2.service_account", "google.auth", "google.auth.transport", "google.auth.transport.requests"]}
        modules["google.oauth2.service_account"].Credentials = types.SimpleNamespace(from_service_account_info=lambda *a, **k: object())
        modules["google.auth.transport.requests"].AuthorizedSession = lambda c: self.session
        spec = importlib.util.spec_from_file_location("download", Path(__file__).parents[2] / "scripts/ops/download_google_signed_apk.py")
        mod = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, modules):
            spec.loader.exec_module(mod)
        return mod

    def test_roundtrip_authenticated_envelope_with_no_plaintext_artifact(self):
        payload = b"PK" + os.urandom(1500000)
        calls = []
        cert = "4424ed7c5650c9a569fcc6b55220767c3a7434f0d7c249b9c95ad9b1ec94fc4d"
        def get(url, **kw):
            calls.append((url, kw))
            if ":download" not in url:
                return types.SimpleNamespace(status_code=200, json=lambda: {"generatedApks": [{"certificateSha256Hash": cert, "generatedUniversalApk": {"downloadId": "test-download"}}]})
            return types.SimpleNamespace(status_code=200, iter_content=lambda n: (payload[i:i+n] for i in range(0, len(payload), n)))
        self.session = types.SimpleNamespace(get=get)
        mod = self.load()
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        with tempfile.TemporaryDirectory() as directory:
            previous = os.getcwd()
            try:
                os.chdir(directory)
                path = Path(".github/keys"); path.mkdir(parents=True)
                (path / "device-qa-apk-encryption.pub").write_bytes(key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
                with patch.dict(os.environ, {"PLAY_SERVICE_ACCOUNT_JSON": "{}"}), patch.object(sys, "argv", ["download", "--version", "213700000", "--source-sha", "a"*40, "--out", "encrypted"]):
                    mod.main()
                out = Path("encrypted")
                self.assertEqual({p.name for p in out.iterdir()}, {"manifest.json", "UrTruck.apk.enc", "UrTruck.apk.key.enc"})
                meta = json.loads((out / "manifest.json").read_text())
                material = key.decrypt((out / "UrTruck.apk.key.enc").read_bytes(), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
                cipher = (out / "UrTruck.apk.enc").read_bytes(); iv = bytes.fromhex(meta["iv_hex"])
                self.assertEqual(hmac.new(material[32:], iv+cipher, hashlib.sha256).hexdigest(), meta["hmac_sha256"])
                decryptor = Cipher(algorithms.AES(material[:32]), modes.CBC(iv)).decryptor()
                padded = decryptor.update(cipher)+decryptor.finalize()
                unpadder = symmetric_padding.PKCS7(128).unpadder()
                decoded = unpadder.update(padded)+unpadder.finalize()
                self.assertEqual(decoded, payload)
                self.assertEqual(hashlib.sha256(decoded).hexdigest(), meta["apk_sha256"])
                self.assertNotEqual(hmac.new(material[32:], iv+cipher[:-1]+bytes([cipher[-1]^1]), hashlib.sha256).hexdigest(), meta["hmac_sha256"])
            finally:
                os.chdir(previous)
        self.assertTrue(all(url.startswith("https://androidpublisher.googleapis.com/") and kw["allow_redirects"] is False for url,kw in calls))

    def test_invalid_source_rejected_before_api(self):
        self.session = None
        mod = self.load()
        with patch.object(sys, "argv", ["download", "--version", "213700000", "--source-sha", "bad", "--out", "unused"]), self.assertRaises(SystemExit):
            mod.main()

if __name__ == "__main__":
    unittest.main()
