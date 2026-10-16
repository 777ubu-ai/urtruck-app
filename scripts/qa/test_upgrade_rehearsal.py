import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from upgrade_rehearsal import RehearsalError, _check_access, _compatible_snapshot, _storage_manifest


class UpgradeRehearsalGuardTests(unittest.TestCase):
    def make_database(self, path: Path, schema: str, rows: str) -> None:
        with sqlite3.connect(path) as conn:
            conn.executescript(schema)
            conn.executescript(rows)

    def test_additive_columns_preserve_old_row_projection(self):
        with tempfile.TemporaryDirectory() as temp:
            old, new = Path(temp) / "old.db", Path(temp) / "new.db"
            self.make_database(old, "CREATE TABLE chat_messages(id INTEGER PRIMARY KEY, owner_id TEXT, text TEXT);",
                               "INSERT INTO chat_messages VALUES(7,'qa-a','message');")
            self.make_database(new, "CREATE TABLE chat_messages(id INTEGER PRIMARY KEY, owner_id TEXT, text TEXT, event_id TEXT);",
                               "INSERT INTO chat_messages VALUES(7,'qa-a','message',NULL);")
            result = _compatible_snapshot(old, new)
            self.assertTrue(result["preserved"])
            self.assertEqual(result["removed_or_changed_rows"], 0)

    def test_changed_owner_or_missing_row_fails_preservation(self):
        with tempfile.TemporaryDirectory() as temp:
            old, changed, missing = (Path(temp) / name for name in ("old.db", "changed.db", "missing.db"))
            schema = "CREATE TABLE deals(id TEXT PRIMARY KEY, owner_id TEXT);"
            self.make_database(old, schema, "INSERT INTO deals VALUES('deal-a','qa-a');")
            self.make_database(changed, schema, "INSERT INTO deals VALUES('deal-a','qa-b');")
            self.make_database(missing, schema, "")
            self.assertFalse(_compatible_snapshot(old, changed)["preserved"])
            self.assertFalse(_compatible_snapshot(old, missing)["preserved"])

    def test_storage_manifest_is_stable_and_counts_only(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "sample.pdf").write_bytes(b"%PDF-test")
            first = _storage_manifest(root)
            second = _storage_manifest(root)
            self.assertEqual(first, second)
            self.assertEqual(first[1:], (1, len(b"%PDF-test")))

    def test_remote_attachment_url_is_refused_before_download(self):
        access = {
            "conversation_id": "opaque-conversation",
            "attachment_id": "opaque-attachment",
            "participant_a_bearer": "a" * 32,
            "participant_b_bearer": "b" * 32,
            "outsider_bearer": "c" * 32,
            "attachment_sha256": "0" * 64,
        }
        payload = json.dumps({"attachments": [{"id": "opaque-attachment", "download_url": "https://outside.invalid/file"}]}).encode()

        def fake_request(url, token=None, timeout=8.0):
            if token == access["outsider_bearer"]:
                return 403, b"", {}
            return 200, payload, {}

        with patch("upgrade_rehearsal._http_status", side_effect=fake_request):
            with self.assertRaises(RehearsalError) as caught:
                _check_access("http://127.0.0.1:12345", access)
        self.assertEqual(caught.exception.code, "nonlocal_file_url_refused")


if __name__ == "__main__":
    unittest.main()
