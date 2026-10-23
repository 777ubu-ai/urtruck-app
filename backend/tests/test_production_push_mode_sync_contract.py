import hashlib
import json
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.ops.production_push_mode_sync_preflight import validate_preflight


def _fixture(tmp_path):
    root = tmp_path / "backend"
    (root / "services").mkdir(parents=True)
    (root / ".env").write_text("APP_ENV=production\nPUSH_PROVIDER_MODE=dual\n", encoding="utf-8")
    expected = {}
    for name, payload in (
        ("services/push_gateway.py", b"known production gateway"),
        ("services/push_sender.py", b"known production sender"),
    ):
        (root / name).write_bytes(payload)
        expected[name] = hashlib.sha256(payload).hexdigest()
    rows = [
        {"name": "urtruck-security-api", "pid": 1101, "pm2_env": {
            "status": "online", "PUSH_PROVIDER_MODE": "native", "pm_cwd": str(root),
        }},
        {"name": "urtruck-security-scheduler", "pid": 1102, "pm2_env": {
            "status": "online", "PUSH_PROVIDER_MODE": "native", "pm_cwd": str(root),
        }},
    ]
    listener = 'LISTEN 0 2048 0.0.0.0:8001 0.0.0.0:* users:(("python",pid=1101,fd=14))\n'
    return root, expected, json.dumps(rows), listener


def _inventory_hash(hashes):
    canonical = "\n".join(f"{name} {digest}" for name, digest in sorted(hashes.items()))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class PushModePreflightTests(unittest.TestCase):
    def test_accepts_exact_dual_env_and_native_named_processes(self):
        with __import__("tempfile").TemporaryDirectory() as directory:
            root, expected, processes, listener = _fixture(Path(directory))

            result = validate_preflight(
                root, processes, listener, expected, len(expected), _inventory_hash(expected)
            )

            self.assertEqual(result["configured_mode"], "dual")
            self.assertEqual(result["current_process_mode"], "native")
            self.assertEqual(result["listener_pid"], 1101)
            self.assertEqual(len(result["source_sha256"]), 2)


    def test_fails_closed_on_mode_identity_or_source_drift(self):
        mutations = [
            ("env_native", "configured push mode"),
            ("api_mode_dual", "expected source mode"),
            ("scheduler_offline", "expected source mode"),
            ("wrong_listener", "not owned by the named API"),
            ("source_drift", "compatibility baseline"),
            ("unrelated_source_drift", "runtime source inventory"),
            ("duplicate_api", "missing or ambiguous"),
        ]
        for mutation, message in mutations:
            with self.subTest(mutation=mutation), __import__("tempfile").TemporaryDirectory() as directory:
                root, expected, processes, listener = _fixture(Path(directory))
                rows = json.loads(processes)

                if mutation == "env_native":
                    (root / ".env").write_text("PUSH_PROVIDER_MODE=native\n", encoding="utf-8")
                elif mutation == "api_mode_dual":
                    rows[0]["pm2_env"]["PUSH_PROVIDER_MODE"] = "dual"
                    processes = json.dumps(rows)
                elif mutation == "scheduler_offline":
                    rows[1]["pm2_env"]["status"] = "stopped"
                    processes = json.dumps(rows)
                elif mutation == "wrong_listener":
                    listener = listener.replace("pid=1101", "pid=9999")
                elif mutation == "source_drift":
                    (root / "services/push_gateway.py").write_text("unreviewed source", encoding="utf-8")
                elif mutation == "unrelated_source_drift":
                    (root / "api").mkdir()
                    (root / "api/unreviewed.py").write_text("unexpected source", encoding="utf-8")
                elif mutation == "duplicate_api":
                    processes = json.dumps(rows + [rows[0]])

                with self.assertRaisesRegex(ValueError, message):
                    expected_count = len(expected) + 1 if mutation == "unrelated_source_drift" else len(expected)
                    validate_preflight(
                        root, processes, listener, expected, expected_count, _inventory_hash(expected)
                    )


    def test_refuses_symlinked_backend_root(self):
        with __import__("tempfile").TemporaryDirectory() as directory:
            base = Path(directory)
            root, expected, processes, listener = _fixture(base)
            alias = base / "backend-link"
            alias.symlink_to(root, target_is_directory=True)

            with self.assertRaisesRegex(ValueError, "backend root"):
                validate_preflight(
                    alias, processes, listener, expected, len(expected), _inventory_hash(expected)
                )


    def test_sync_workflow_is_an_operation_of_the_single_guarded_writer(self):
        writer = (ROOT / ".github/workflows/production-deploy-execute.yml").read_text(encoding="utf-8")
        caller = (ROOT / ".github/workflows/sync-production-push-mode.yml").read_text(encoding="utf-8")

        self.assertIn('default: "deploy"', writer)
        self.assertIn("if: ${{ inputs.operation == 'deploy' && inputs.deploy_scope == 'full' }}", writer)
        self.assertIn("if: ${{ inputs.operation == 'sync_push_mode' && inputs.deploy_scope == 'full' }}", writer)
        self.assertIn("refs/heads/main", writer)
        self.assertIn("REQUESTED_SHA", writer)
        self.assertIn("CALLER_SHA", writer)
        self.assertIn("SERVER_SSH_KNOWN_HOSTS", writer)
        self.assertIn('URTRUCK_REQUIRE_KEY: "1"', writer)
        self.assertIn("production-deploy-execute.yml", caller)
        self.assertIn("deploy_sha: ${{ github.sha }}", caller)
        self.assertIn("operation: sync_push_mode", caller)
        sync_job = writer.split("  sync_push_mode:\n", 1)[1]
        self.assertNotIn("runtime_release_manifest.py", sync_job)
        self.assertNotIn("remote_bootstrap_secure_env.sh", sync_job)
        self.assertNotIn("scp -C -r backend/*", sync_job)
        self.assertIn("production_push_mode_sync_preflight.py", sync_job)
        self.assertIn("production_push_mode_backup.py", sync_job)
        self.assertIn("remote_health_check.sh", sync_job)
        self.assertIn("--run-id", sync_job)
        self.assertLess(sync_job.index("production_push_mode_sync_preflight.py"), sync_job.index("production_push_mode_backup.py"))
        self.assertNotIn("SERVER_SSH_KEY:", sync_job.split("steps:", 1)[0])
        self.assertNotIn("SERVER_SSH_KNOWN_HOSTS:", sync_job.split("steps:", 1)[0])
        preflight = (ROOT / "scripts/ops/production_push_mode_sync_preflight.py").read_text()
        self.assertIn("PUSH_PROVIDER_MODE", preflight)
        self.assertIn("EXPECTED_RUNTIME_INVENTORY_SHA256", preflight)

    def test_mode_transition_backups_and_persists_pm2_state_with_exact_rollback(self):
        health = (ROOT / "scripts/remote_health_check.sh").read_text(encoding="utf-8")
        backup = (ROOT / "scripts/ops/production_push_mode_backup.py").read_text(encoding="utf-8")
        self.assertIn('"$PM2_BIN" save', health)
        self.assertIn('PUSH_MODE_PERSISTED=$PUSH_MODE', health)
        self.assertIn('restore --backup-dir "$BACKUP_DIR"', health)
        self.assertIn('verify --backup-dir "$BACKUP_DIR"', health)
        self.assertIn('src.backup(dst', backup)
        self.assertIn('PRAGMA query_only=ON', backup)
        self.assertIn('os.chmod(target, 0o700)', backup)
        self.assertIn('chmod(0o600)', backup)
        self.assertIn('saved PM2 application configuration changed outside the reviewed mode', backup)

    def test_sync_caller_uses_protected_writer_and_explicit_minimal_secrets(self):
        caller = (ROOT / ".github/workflows/sync-production-push-mode.yml").read_text(encoding="utf-8")
        self.assertIn(
            "777ubu-ai/urtruck-app/.github/workflows/production-deploy-execute.yml@main",
            caller,
        )
        self.assertNotIn("uses: ./.github/workflows/production-deploy-execute.yml", caller)
        self.assertNotIn("secrets: inherit", caller)
        for name in ("SERVER_HOST", "SERVER_USER", "SERVER_SSH_KEY", "SERVER_SSH_KNOWN_HOSTS", "BACKEND_DIR"):
            self.assertIn(f"{name}: ${{{{ secrets.{name} }}}}", caller)
        self.assertIn("secrets: inherit", (ROOT / ".github/workflows/secure-production-deploy.yml").read_text(encoding="utf-8"))
        execute = (ROOT / ".github/workflows/production-deploy-execute.yml").read_text(encoding="utf-8")
        for name in ("SERVER_HOST", "SERVER_USER", "SERVER_SSH_KEY", "SERVER_SSH_KNOWN_HOSTS", "BACKEND_DIR"):
            self.assertIn(f"      {name}:\n        required: false", execute)


if __name__ == "__main__":
    unittest.main()
