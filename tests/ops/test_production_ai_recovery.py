import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("recovery",ROOT/"scripts/ops/recover_production_chat_ai.py")
        self.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.mod)
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.mod.BACKEND = self.root/"backend"
        self.mod.BACKUP_ROOT = self.root/"backups"
        (self.mod.BACKEND/"api").mkdir(parents=True)
        self.chat = self.mod.BACKEND/"api/chat.py"
        self.chat.write_text("# old production API\n")
        self.old = self.chat.read_bytes()
        (self.mod.BACKEND/".env").write_text("OPENAI_API_KEY=old-test-key\nTRANSLATE_MODEL=old-model\nKEEP_ME=yes\n")
        self.old_env = (self.mod.BACKEND/".env").read_bytes()
        self.credential = self.root/"credential.env"
        self.credential.write_text("OPENAI_API_KEY=existing-test-key\n")
        self.args = ["recover","--expected-chat-sha256",hashlib.sha256(self.old).hexdigest(),
                     "--credential-env",str(self.credential)]
        self.models = {"data":[{"id":"gpt-4o-mini"},{"id":"gpt-4o-mini-transcribe"}]}

    def tearDown(self):
        self.tmp.cleanup()

    def run_main(self, extra=()):
        with patch.object(sys,"argv",self.args+list(extra)), \
             patch.object(self.mod.urllib.request,"urlopen",return_value=io.BytesIO(json.dumps(self.models).encode())), \
             contextlib.redirect_stdout(io.StringIO()):
            self.mod.main()

    def test_read_only_does_not_write_or_restart(self):
        with patch.object(self.mod,"restart") as restart:
            self.run_main()
            restart.assert_not_called()
        self.assertEqual(self.chat.read_bytes(),self.old)
        self.assertEqual((self.mod.BACKEND/".env").read_bytes(),self.old_env)
        self.assertFalse(self.mod.BACKUP_ROOT.exists())

    def test_changed_source_rejected_before_network_or_mutation(self):
        self.chat.write_text("# concurrent update\n")
        with patch.object(self.mod.urllib.request,"urlopen") as network:
            with self.assertRaisesRegex(RuntimeError,"source changed"):
                self.run_main()
            network.assert_not_called()

    def test_unavailable_model_rejected_without_mutation(self):
        self.models = {"data":[]}
        with self.assertRaisesRegex(RuntimeError,"models"):
            self.run_main()
        self.assertEqual(self.chat.read_bytes(),self.old)
        self.assertEqual((self.mod.BACKEND/".env").read_bytes(),self.old_env)

    def test_restart_failure_rolls_back_code_and_credentials(self):
        process = [{"name":"urtruck-security-api","pm2_env":{"pm_cwd":str(self.mod.BACKEND)}}]
        with patch.object(self.mod,"pm2",return_value=json.dumps(process)), \
             patch.object(self.mod,"restart",side_effect=[RuntimeError("failed"),None]) as restart:
            with self.assertRaisesRegex(RuntimeError,"rolled back"):
                self.run_main(["--apply"])
            self.assertEqual(restart.call_count,2)
            self.assertEqual(restart.call_args.args[0]["OPENAI_API_KEY"],"old-test-key")
        self.assertEqual(self.chat.read_bytes(),self.old)
        self.assertEqual((self.mod.BACKEND/".env").read_bytes(),self.old_env)
        backup = next(self.mod.BACKUP_ROOT.iterdir())
        self.assertEqual((backup/"old-ai-env.json").stat().st_mode & 0o777,0o600)

if __name__ == "__main__":
    unittest.main()
