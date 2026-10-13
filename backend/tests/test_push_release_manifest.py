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

    def test_dangling_runtime_symlink_blocks_current_baseline(self):
        path = self.root / "services/new_gateway.py"
        path.symlink_to(self.root.parent / "absent.py")
        with self.assertRaisesRegex(ValueError, "symlink"):
            gate.verify(self.root, self.manifest, "production", SHA)
        self.assertTrue(path.is_symlink())

    def test_runtime_directory_symlink_blocks_current_baseline(self):
        outside = self.root.parent / "outside"
        outside.mkdir()
        path = self.root / "new_runtime"
        path.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            gate.verify(self.root, self.manifest, "production", SHA)
        self.assertTrue(path.is_symlink())

    def test_candidate_dangling_file_symlink_blocks_transition(self):
        path = self.root / "services/new_gateway.py"
        path.symlink_to(self.root.parent / "absent.py")
        candidate = copy.deepcopy(self.manifest)
        candidate["files"]["services/new_gateway.py"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "symlink"):
            gate.verify_transition(self.manifest, candidate, "production", self.root)
        self.assertTrue(path.is_symlink())
        self.assertFalse((self.root.parent / "absent.py").exists())

    def test_candidate_parent_symlinks_block_transition(self):
        for target in (self.root / "services", self.root.parent / "absent_directory"):
            with self.subTest(target=target):
                parent = self.root / "new_runtime"
                parent.symlink_to(target, target_is_directory=True)
                try:
                    candidate = copy.deepcopy(self.manifest)
                    candidate["files"]["new_runtime/nested/gateway.py"] = "0" * 64
                    with self.assertRaisesRegex(ValueError, "symlink"):
                        gate.verify_transition(self.manifest, candidate, "production", self.root)
                    self.assertTrue(parent.is_symlink())
                finally:
                    parent.unlink()

    def test_candidate_file_parent_and_directory_leaf_block_transition(self):
        for name, collision in (("new_runtime/gateway.py", "new_runtime"), ("services/gateway.py", "services/gateway.py")):
            with self.subTest(name=name):
                path = self.root / collision
                if collision == "new_runtime":
                    path.write_text("protected pre-existing file")
                else:
                    path.mkdir()
                candidate = copy.deepcopy(self.manifest)
                candidate["files"][name] = "0" * 64
                with self.assertRaisesRegex(ValueError, "destination"):
                    gate.verify_transition(self.manifest, candidate, "production", self.root)
                self.assertTrue(path.exists())

    def test_candidate_missing_parent_addition_is_read_only_and_allowed(self):
        candidate = copy.deepcopy(self.manifest)
        candidate["files"]["new_runtime/nested/gateway.py"] = "0" * 64
        gate.verify_transition(self.manifest, candidate, "production", self.root)
        self.assertFalse((self.root / "new_runtime").exists())

    def test_excluded_storage_and_venv_symlinks_remain_protected(self):
        for name in ("storage", "venv"):
            (self.root / name).symlink_to(self.root.parent / ("private_" + name), target_is_directory=True)
        gate.verify(self.root, self.manifest, "production", SHA)
        self.assertTrue((self.root / "storage").is_symlink())
        self.assertTrue((self.root / "venv").is_symlink())

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

    def test_removed_runtime_file_blocks_before_overlay(self):
        candidate = copy.deepcopy(self.manifest)
        del candidate["files"]["services/push_gateway.py"]
        with self.assertRaisesRegex(ValueError, "staged migration before production writes"):
            gate.verify_transition(self.manifest, candidate, "production", self.root)
        gate.verify(self.root, self.manifest, "production", SHA)

    def test_renamed_runtime_file_blocks_before_overlay(self):
        candidate = copy.deepcopy(self.manifest)
        candidate["files"]["services/new_gateway.py"] = candidate["files"].pop("services/push_gateway.py")
        with self.assertRaisesRegex(ValueError, "staged migration"):
            gate.verify_transition(self.manifest, candidate, "production", self.root)

    def test_overlay_addition_without_removal_is_supported(self):
        candidate = copy.deepcopy(self.manifest)
        candidate["files"]["services/new_gateway.py"] = "b" * 64
        gate.verify_transition(self.manifest, candidate, "production", self.root)

    def test_transition_cannot_use_other_environment(self):
        candidate = copy.deepcopy(self.manifest)
        candidate["environment"] = "qa2"
        with self.assertRaisesRegex(ValueError, "candidate transition"):
            gate.verify_transition(self.manifest, candidate, "production", self.root)

    def test_explicit_recovery_accepts_stopped_named_process_in_same_root(self):
        state = [{"name":"urtruck-security-api", "pid":0, "pm2_env":{"status":"errored", "pm_cwd":str(self.root)}}]
        with patch.object(gate.subprocess, "check_output", return_value=""), patch.object(gate, "pm2_output", return_value=__import__("json").dumps(state)):
            gate.verify_listener(self.root, 8001, "urtruck-security-api", True)

    def test_normal_deploy_never_accepts_missing_listener(self):
        with patch.object(gate.subprocess, "check_output", return_value=""):
            with self.assertRaisesRegex(ValueError, "missing or ambiguous"):
                gate.verify_listener(self.root, 8001, "urtruck-security-api")

    def test_recovery_rejects_unknown_running_foreign_or_duplicate_pm2(self):
        valid = {"name":"urtruck-security-api", "pid":0, "pm2_env":{"status":"stopped", "pm_cwd":str(self.root)}}
        states = [[], [valid,valid], [{**valid,"pid":123}], [{**valid,"pm2_env":{"status":"online", "pm_cwd":str(self.root)}}], [{**valid,"pm2_env":{"status":"stopped", "pm_cwd":str(self.root.parent)}}]]
        for state in states:
            with patch.object(gate.subprocess, "check_output", return_value=""), patch.object(gate, "pm2_output", return_value=__import__("json").dumps(state)):
                with self.assertRaises(ValueError):
                    gate.verify_listener(self.root, 8001, "urtruck-security-api", True)

    def test_recovery_does_not_bypass_an_existing_foreign_listener(self):
        with patch.object(gate.subprocess, "check_output", return_value="pid=123"), patch.object(gate, "pm2_pid", return_value="456"):
            with self.assertRaisesRegex(ValueError, "not the named PM2"):
                gate.verify_listener(self.root, 8001, "urtruck-security-api", True)

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
        preflight = workflow[guard:workflow.index("Backup current production")]
        self.assertIn("--candidate-manifest", preflight)
        self.assertIn("production-runtime-manifest.json", preflight)
        self.assertNotIn("continue-on-error: true", workflow)

    def test_source_verification_precedes_backend_restart(self):
        workflow = (ROOT / ".github/workflows/production-deploy-execute.yml").read_text()
        section = workflow.split("- name: Deploy backend and verify PM2 health", 1)[1].split("- name:", 1)[0]
        self.assertLess(section.index("--source-sha '$DEPLOY_SHA'"), section.index("bash /tmp/urtruck_health.sh"))
        self.assertEqual(section.count("--source-sha '$DEPLOY_SHA'"), 2)
        final = section.split("bash /tmp/urtruck_health.sh", 1)[1]
        self.assertNotIn("$RECOVERY_ARG", final)
        self.assertIn("RECOVER_STOPPED: ${{ inputs.break_glass }}", section)

    def test_shared_ci_preserves_both_push_and_translation_contracts(self):
        workflow = (ROOT / ".github/workflows/quality-gate-reusable.yml").read_text()
        for token in ["Runtime identity and mixed-deployment regression lock", "Push/Bell critical subset", "Translation and STT regression boundary", "onesignal", "badge", "translation", "--source-sha"]:
            self.assertIn(token, workflow)
        self.assertNotIn("continue-on-error: true", workflow)


if __name__ == "__main__":
    unittest.main()
