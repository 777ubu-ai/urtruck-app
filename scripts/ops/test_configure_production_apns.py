"""Проверки изоляции конфигурации, read-only и автоматического rollback."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import configure_production_apns as ops

class APNsConfigTests(unittest.TestCase):
    def values(self):
        return dict(APNS_KEY_ID="A"*10, APNS_TEAM_ID="B"*10,
                    APNS_BUNDLE_ID="com.urtruck.app", APNS_AUTH_KEY_P8="private\nkey\n",
                    APNS_USE_SANDBOX="false")

    def test_preserves_other_env_lines_and_escapes_pem(self):
        old = b"# keep\nOPENAI_API_KEY=do-not-change\nAPNS_KEY_ID=old\nOTHER='x=y'\n"
        new = ops.env_with_apns(old, self.values())
        self.assertIn(b"# keep\nOPENAI_API_KEY=do-not-change\nOTHER='x=y'\n", new)
        self.assertEqual(new.count(b"APNS_KEY_ID="), 1)
        self.assertIn(b"APNS_AUTH_KEY_P8=private\\nkey\\n\n", new)

    def test_rejects_other_bundle_or_sandbox(self):
        for key, value in [("APNS_BUNDLE_ID", "com.other.app"), ("APNS_USE_SANDBOX", "true")]:
            vals = self.values()
            vals[key] = value
            with self.assertRaisesRegex(RuntimeError, "Wrong APNs"):
                ops.validate(vals)

    def fixture(self, root):
        backend = root / "backend"
        backend.mkdir()
        (backend / ".env").write_bytes(b"OPENAI_API_KEY=unchanged\n")
        cred = root / "credentials.json"
        cred.write_text(json.dumps(self.values()))
        cred.chmod(0o600)
        proc = {"name": ops.PROCESS, "pid": 10,
                "pm2_env": {"pm_cwd": str(backend), "OPENAI_API_KEY": "unchanged"}}
        return backend, cred, proc

    def test_changed_env_refuses_before_process_or_mutation(self):
        with tempfile.TemporaryDirectory() as d:
            backend, cred, proc = self.fixture(Path(d))
            with patch.object(ops, "BACKEND", backend), patch.object(ops, "SOURCE_HASHES", {}), \
                 patch.object(ops, "processes") as processes, \
                 patch("sys.argv", ["ops", "--credentials", str(cred), "--expected-env-sha256", "wrong"]):
                with self.assertRaisesRegex(RuntimeError, "env changed"):
                    ops.main()
                processes.assert_not_called()
                self.assertEqual((backend / ".env").read_bytes(), b"OPENAI_API_KEY=unchanged\n")

    def test_default_is_read_only(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            backend, cred, proc = self.fixture(root)
            before = (backend / ".env").read_bytes()
            with patch.object(ops, "BACKEND", backend), patch.object(ops, "BACKUPS", root / "backups"), \
                 patch.object(ops, "SOURCE_HASHES", {}), patch.object(ops, "validate"), \
                 patch.object(ops, "processes", return_value=[proc]), patch.object(ops, "restart") as restart, \
                 patch("sys.argv", ["ops", "--credentials", str(cred), "--expected-env-sha256", ops.sha(before)]):
                ops.main()
                restart.assert_not_called()
                self.assertFalse((root / "backups").exists())
                self.assertEqual((backend / ".env").read_bytes(), before)

    def test_failed_restart_restores_env_and_previous_apns_values(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            backend, cred, proc = self.fixture(root)
            before = (backend / ".env").read_bytes()
            with patch.object(ops, "BACKEND", backend), patch.object(ops, "BACKUPS", root / "backups"), \
                 patch.object(ops, "SOURCE_HASHES", {}), patch.object(ops, "validate"), \
                 patch.object(ops, "processes", return_value=[proc]), patch.object(ops, "pm2"), \
                 patch.object(ops, "restart", side_effect=[RuntimeError("health failed"), None]) as restart, \
                 patch("sys.argv", ["ops", "--credentials", str(cred), "--expected-env-sha256", ops.sha(before), "--apply"]):
                with self.assertRaisesRegex(RuntimeError, "rolled back"):
                    ops.main()
                self.assertEqual((backend / ".env").read_bytes(), before)
                self.assertEqual(restart.call_count, 2)
                self.assertEqual(restart.call_args.args[0], {k: "" for k in ops.KEYS})
                backup = next((root / "backups").iterdir())
                self.assertEqual(backup.stat().st_mode & 0o777, 0o700)
                self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in backup.iterdir()))

    def test_rollback_refuses_changed_live_config(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            backend, _, _ = self.fixture(root)
            backup = root / "backups" / "test"
            backup.mkdir(parents=True)
            (backup / "manifest.json").write_text(json.dumps({"applied_env_sha256": "different"}))
            with patch.object(ops, "BACKEND", backend), patch.object(ops, "BACKUPS", root / "backups"), \
                 patch.object(ops, "restart") as restart:
                with self.assertRaisesRegex(RuntimeError, "changed after apply"):
                    ops.restore(backup)
                restart.assert_not_called()

if __name__ == "__main__":
    unittest.main()
