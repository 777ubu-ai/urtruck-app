"""Deploy обязан отклонять смешанный код push/перевода, старый SHA и чужой сайт."""
import copy
import importlib.util
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("runtime_release_manifest", ROOT / "scripts/ops/runtime_release_manifest.py")
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)
SHA = "a" * 40


class TestPushReleaseIdentity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "backend"
        for name in gate.REQUIRED | {"services/push_gateway.py", "qa_ai_service/quality.py", "database/schema.sql", "requirements.txt"}:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("approved source\n")
        self.names = [p.relative_to(self.root).as_posix() for p in self.root.rglob("*") if p.is_file()]
        self.manifest = gate.make_manifest(self.root, self.names, SHA, "production")

    def test_exact_release_passes(self):
        self.assertEqual(gate.verify(self.root, self.manifest, "production", SHA)["status"], "verified")

    def test_old_push_sender_cannot_pass_after_translation_update(self):
        (self.root / "services/push_sender.py").write_text("old sender\n")
        with self.assertRaisesRegex(ValueError, "source drift"):
            gate.verify(self.root, self.manifest, "production", SHA)

    def test_translation_change_cannot_be_hidden_by_healthy_push(self):
        (self.root / "qa_ai_service/quality.py").write_text("unexpected translation gate\n")
        with self.assertRaisesRegex(ValueError, "source drift"):
            gate.verify(self.root, self.manifest, "production", SHA)

    def test_qa2_manifest_is_not_production_evidence(self):
        candidate = gate.make_manifest(self.root, self.names, SHA, "qa2")
        with self.assertRaisesRegex(ValueError, "environment mismatch"):
            gate.verify(self.root, candidate, "production", SHA)

    def test_previous_commit_cannot_count_as_current_release(self):
        with self.assertRaisesRegex(ValueError, "SHA mismatch"):
            gate.verify(self.root, self.manifest, "production", "b" * 40)

    def test_missing_push_gateway_blocks_release(self):
        (self.root / "services/push_gateway.py").unlink()
        with self.assertRaises(ValueError):
            gate.verify(self.root, self.manifest, "production", SHA)

    def test_untracked_runtime_module_blocks_release(self):
        (self.root / "services/old_sender.py").write_text("unreviewed code\n")
        with self.assertRaisesRegex(ValueError, "untracked runtime"):
            gate.verify(self.root, self.manifest, "production", SHA)

    def test_env_database_and_storage_are_not_inventoried_or_changed(self):
        extras = {".env": "private configuration", "database/live.db": "business data", "storage/upload.py": "uploaded file", "venv/lib/vendor.py": "installed dependency"}
        for name, content in extras.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        gate.verify(self.root, self.manifest, "production", SHA)
        for name, content in extras.items():
            self.assertEqual((self.root / name).read_text(), content)

    def test_database_schema_drift_is_detected_without_running_migration(self):
        path = self.root / "database/schema.sql"
        path.write_text("ALTER TABLE forbidden;\n")
        with self.assertRaisesRegex(ValueError, "source drift"):
            gate.verify(self.root, self.manifest, "production", SHA)
        self.assertEqual(path.read_text(), "ALTER TABLE forbidden;\n")

    def test_incomplete_manifest_fails_closed(self):
        candidate = copy.deepcopy(self.manifest)
        del candidate["files"]["api/notifications.py"]
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            gate.verify(self.root, candidate, "production", SHA)

    def test_manifest_path_traversal_fails_closed(self):
        candidate = copy.deepcopy(self.manifest)
        candidate["files"]["../outside.py"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "Invalid runtime path"):
            gate.verify(self.root, candidate, "production", SHA)

    def test_symlink_outside_runtime_root_fails_closed(self):
        outside = Path(self.temp.name) / "outside.py"
        outside.write_text("outside source\n")
        path = self.root / "services/push_sender.py"
        path.unlink()
        path.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "unsafe runtime file"):
            gate.verify(self.root, self.manifest, "production", SHA)

    def test_malformed_hash_is_not_accepted(self):
        candidate = copy.deepcopy(self.manifest)
        candidate["files"]["services/push_sender.py"] = "not-a-sha256"
        with self.assertRaisesRegex(ValueError, "Invalid runtime hash"):
            gate.verify(self.root, candidate, "production", SHA)

    def test_unknown_identity_is_not_accepted(self):
        candidate = copy.deepcopy(self.manifest)
        candidate["source_sha"] = "UNKNOWN"
        with self.assertRaisesRegex(ValueError, "identity"):
            gate.verify(self.root, candidate, "production")

    def test_verified_files_in_unused_folder_do_not_prove_live_release(self):
        with patch.object(gate.subprocess, "check_output", return_value='users:(("python",pid=123,fd=4))'), patch.object(gate.os, "readlink", return_value=str(self.root.parent / "other-backend")):
            with self.assertRaisesRegex(ValueError, "different backend root"):
                gate.verify_listener(self.root, 8001)

    def test_listener_root_must_match_deployment_root(self):
        with patch.object(gate.subprocess, "check_output", return_value='users:(("python",pid=123,fd=4))'), patch.object(gate.os, "readlink", return_value=str(self.root)):
            gate.verify_listener(self.root, 8001)

    def test_unidentifiable_listener_fails_closed(self):
        with patch.object(gate.subprocess, "check_output", return_value='LISTEN without visible pid'):
            with self.assertRaisesRegex(ValueError, "missing or ambiguous"):
                gate.verify_listener(self.root, 8001)

    def test_multiple_listener_processes_fail_closed(self):
        with patch.object(gate.subprocess, "check_output", return_value='pid=123,pid=456'):
            with self.assertRaisesRegex(ValueError, "missing or ambiguous"):
                gate.verify_listener(self.root, 8001)

    def test_translation_memory_content_drift_blocks_release(self):
        path = self.root / "qa_ai_service/translation_memory/data/terminology.jsonl"
        path.parent.mkdir(parents=True)
        path.write_text('{"approved":true}\n')
        names = self.names + ["qa_ai_service/translation_memory/data/terminology.jsonl"]
        manifest = gate.make_manifest(self.root, names, SHA, "production")
        path.write_text('{"stale":true}\n')
        with self.assertRaisesRegex(ValueError, "source drift"):
            gate.verify(self.root, manifest, "production", SHA)

    def test_extra_translation_memory_asset_blocks_release(self):
        path = self.root / "qa_ai_service/translation_memory/data/unreviewed.jsonl"
        path.parent.mkdir(parents=True)
        path.write_text('{}\n')
        with self.assertRaisesRegex(ValueError, "untracked runtime"):
            gate.verify(self.root, self.manifest, "production", SHA)

    def test_same_directory_old_listener_is_not_restarted_pm2_process(self):
        with patch.object(gate.subprocess, "check_output", return_value='pid=123'), patch.object(gate, "pm2_pid", return_value="456"), patch.object(gate.os, "readlink", return_value=str(self.root)):
            with self.assertRaisesRegex(ValueError, "not the named PM2"):
                gate.verify_listener(self.root, 8001, "urtruck-security-api")

    def test_named_pm2_process_owns_listener(self):
        with patch.object(gate.subprocess, "check_output", return_value='pid=123'), patch.object(gate, "pm2_pid", return_value="123"), patch.object(gate.os, "readlink", return_value=str(self.root)):
            gate.verify_listener(self.root, 8001, "urtruck-security-api")

    def test_missing_or_duplicate_pm2_pid_blocks_release(self):
        for output in ["0\n", "123\n456\n", "", "[PM2] starting daemon\n123\n"]:
            with patch.object(gate.shutil, "which", return_value="/usr/bin/pm2"), patch.object(gate.subprocess, "check_output", return_value=output):
                with self.assertRaisesRegex(ValueError, "identity missing or ambiguous"):
                    gate.pm2_pid("urtruck-security-api")

    def cli_repo(self):
        repo = self.root.parent
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        subprocess.run(["git", "add", "backend"], cwd=repo, check=True)
        subprocess.run(["git", "-c", "user.name=Regression", "-c", "user.email=regression@example.invalid", "commit", "-qm", "fixture"], cwd=repo, check=True)
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
        out = repo / "runtime.json"
        command = [sys.executable, str(ROOT / "scripts/ops/runtime_release_manifest.py"), "create", "--root", str(self.root), "--manifest", str(out), "--environment", "ci", "--source-sha", sha]
        return sha, out, command

    def test_cli_manifest_is_bound_to_actual_clean_checkout(self):
        sha, out, command = self.cli_repo()
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(out.exists())
        self.assertIn(sha, result.stdout)

    def test_cli_refuses_dirty_push_code(self):
        _, out, command = self.cli_repo()
        (self.root / "services/push_sender.py").write_text("uncommitted sender\n")
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(out.exists())

    def test_cli_refuses_wrong_declared_sha(self):
        _, out, command = self.cli_repo()
        command[-1] = "b" * 40
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(out.exists())

    def test_production_baseline_gate_precedes_all_production_writes(self):
        workflow = (ROOT / ".github/workflows/production-deploy-execute.yml").read_text()
        guard = workflow.index("Require verified current backend before production writes")
        for step in ["Backup current production", "Deploy frontend", "Bootstrap secure server-only environment", "Deploy backend and verify PM2 health"]:
            self.assertLess(guard, workflow.index(step))
        self.assertIn("--listener-port 8001", workflow)
        self.assertEqual(workflow.count("--pm2-process '$PM2_PROC'"), 3)
        self.assertNotIn("continue-on-error: true", workflow)

    def test_source_verification_precedes_backend_restart(self):
        workflow = (ROOT / ".github/workflows/production-deploy-execute.yml").read_text()
        section = workflow.split("- name: Deploy backend and verify PM2 health", 1)[1].split("- name:", 1)[0]
        self.assertLess(section.index("--source-sha '$DEPLOY_SHA'"), section.index("bash /tmp/urtruck_health.sh"))
        self.assertEqual(section.count("--source-sha '$DEPLOY_SHA'"), 2)

    def test_shared_ci_preserves_both_push_and_translation_contracts(self):
        workflow = (ROOT / ".github/workflows/quality-gate-reusable.yml").read_text()
        for token in ["Runtime identity and mixed-deployment regression lock", "Push/Bell critical subset", "Translation and STT regression boundary", "onesignal", "badge", "translation", "--source-sha"]:
            self.assertIn(token, workflow)
        self.assertNotIn("continue-on-error: true", workflow)


if __name__ == "__main__":
    unittest.main()
