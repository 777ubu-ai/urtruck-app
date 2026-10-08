from __future__ import annotations

import importlib.util
import io
import json
import os
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("export_supabase_storage.py")
SPEC = importlib.util.spec_from_file_location("export_supabase_storage", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class FakeResponse:
    def __init__(self, value: bytes):
        self.value = value

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.value


class ExportSupabaseStorageTests(unittest.TestCase):
    def test_nested_objects_and_bucket_metadata_are_exported(self):
        data = {
            "root.txt": b"abc",
            "folder/nested.txt": b"defg",
        }

        def fake_urlopen(request, timeout=0):
            url = request.full_url
            if url.endswith("/storage/v1/bucket"):
                return FakeResponse(
                    json.dumps(
                        [{"id": "bucket-1", "name": "private-files", "public": False}]
                    ).encode()
                )
            if "/storage/v1/object/list/private-files" in url:
                body = json.loads(request.data)
                prefix = body["prefix"]
                if prefix == "":
                    page = [
                        {"name": "folder", "id": None},
                        {
                            "name": "root.txt",
                            "id": "id-root",
                            "metadata": {"size": 3},
                        },
                    ]
                elif prefix == "folder/":
                    page = [
                        {
                            "name": "nested.txt",
                            "id": "id-nested",
                            "metadata": {"size": 4},
                        }
                    ]
                else:
                    page = []
                return FakeResponse(json.dumps(page).encode())
            for object_name, content in data.items():
                if url.endswith("/" + object_name):
                    return FakeResponse(content)
            raise AssertionError("unexpected Storage API request")

        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "export"
            with patch.dict(
                os.environ,
                {
                    "SUPABASE_URL": "https://project-ref.supabase.co",
                    "SUPABASE_SERVICE_ROLE_KEY": "never-print-this-test-key",
                    "OUTPUT_DIR": str(output_dir),
                },
            ), patch.object(MODULE, "urlopen", fake_urlopen), patch("sys.stdout", new_callable=io.StringIO):
                MODULE.main()

            summary = json.loads((output_dir / "summary.json").read_text())
            self.assertEqual(summary["object_count"], 2)
            self.assertEqual(summary["total_bytes"], 7)
            with tarfile.open(summary["archive_path"], "r:gz") as archive:
                self.assertEqual(
                    set(archive.getnames()),
                    {
                        "supabase-storage-metadata.json",
                        "objects/private-files",
                        "objects/private-files/folder",
                        "objects/private-files/folder/nested.txt",
                        "objects/private-files/root.txt",
                    },
                )
                metadata = json.load(archive.extractfile("supabase-storage-metadata.json"))
                self.assertEqual(metadata["bucket_count"], 1)
                self.assertEqual(metadata["object_count"], 2)
                self.assertEqual(len(metadata["objects"]), 2)
                self.assertTrue(all(len(item["sha256"]) == 64 for item in metadata["objects"]))

    def test_path_traversal_is_rejected(self):
        with patch("sys.stderr", new_callable=io.StringIO), self.assertRaises(SystemExit):
            MODULE.safe_object_path("folder/../../outside")


if __name__ == "__main__":
    unittest.main()
