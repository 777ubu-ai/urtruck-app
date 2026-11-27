"""Safety tests for the production-only, two-module CGR overlay."""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.ops import deploy_cgr_online_board_overlay as overlay

WORKFLOW = ROOT / ".github/workflows/deploy-cgr-online-board-production.yml"


class CGRProductionOverlayContractTests(unittest.TestCase):
    def test_source_and_allowlist_are_fixed_to_pr_732(self):
        self.assertEqual(overlay.SOURCE_SHA, "65c7370810593fbaadff5cf39a0eb9a9878ed9a8")
        self.assertEqual(set(overlay.FILES), {"api/borders.py", "cgr/scoreboard_service.py"})
        self.assertEqual(len(overlay.FILES), 2)
        for rel, expected in overlay.FILES.items():
            self.assertEqual(overlay.sha256(ROOT / "backend" / rel), expected)

    def test_workflow_uses_protected_environment_and_pinned_ssh_only(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("environment: production", text)
        self.assertIn('URTRUCK_REQUIRE_KEY: "1"', text)
        self.assertIn("SERVER_SSH_KNOWN_HOSTS", text)
        self.assertIn("group: urtruck-production-release", text)
        self.assertNotIn("SERVER_PASS", text)
        self.assertNotIn("sshpass", text)
        self.assertIn("contents: read", text)

    def test_backup_probe_and_rollback_restore_only_two_files(self):
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            live_root = temp_path / "backend"
            live_root.mkdir()
            (live_root / "main.py").write_text("unchanged entrypoint\n", encoding="utf-8")
            candidate_dir = temp_path / "candidate"
            candidate_dir.mkdir()
            for rel in overlay.FILES:
                source = ROOT / "backend" / rel
                candidate = candidate_dir / rel
                candidate.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, candidate)
                target = live_root / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(f"old production {rel}\n", encoding="utf-8")

            original_backup_root = overlay.BACKUP_ROOT
            overlay.BACKUP_ROOT = temp_path / "home" / "urtruck-backups" / "cgr-online-board"
            try:
                backup_id, manifest = overlay.make_backup(live_root, 123, candidate_dir)
                self.assertEqual(set(manifest["files"]), set(overlay.FILES))
                self.assertTrue((overlay.BACKUP_ROOT / backup_id / "manifest.json").is_file())
                for rel in overlay.FILES:
                    target = live_root / rel
                    target.write_bytes((candidate_dir / rel).read_bytes())
                overlay.restore(live_root, backup_id, restart_service=False)
                for rel in overlay.FILES:
                    self.assertEqual(overlay.sha256(live_root / rel), manifest["files"][rel]["before_sha256"])
                self.assertEqual((live_root / "main.py").read_text(encoding="utf-8"), "unchanged entrypoint\n")
                saved = json.loads((overlay.BACKUP_ROOT / backup_id / "manifest.json").read_text())
                self.assertEqual(saved["source_sha"], overlay.SOURCE_SHA)
            finally:
                overlay.BACKUP_ROOT = original_backup_root

    def test_rollback_refuses_to_overwrite_a_later_unrelated_change(self):
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            live_root = temp_path / "backend"
            live_root.mkdir()
            (live_root / "main.py").write_text("unchanged entrypoint\n", encoding="utf-8")
            candidate_dir = temp_path / "candidate"
            candidate_dir.mkdir()
            for rel in overlay.FILES:
                source = ROOT / "backend" / rel
                candidate = candidate_dir / rel
                candidate.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, candidate)
                target = live_root / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(f"old production {rel}\n", encoding="utf-8")

            original_backup_root = overlay.BACKUP_ROOT
            overlay.BACKUP_ROOT = temp_path / "home" / "urtruck-backups" / "cgr-online-board"
            try:
                backup_id, _ = overlay.make_backup(live_root, 123, candidate_dir)
                changed = live_root / "api/borders.py"
                changed.write_text("unreviewed later production change\n", encoding="utf-8")
                with self.assertRaisesRegex(RuntimeError, "rollback_refused_live_file_changed_since_backup"):
                    overlay.load_backup(live_root, backup_id)
            finally:
                overlay.BACKUP_ROOT = original_backup_root


if __name__ == "__main__":
    unittest.main()
