"""Исполнение встроенного guard: неизвестный/старый runtime запрещает сборку."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github/workflows/testflight-production-115-2.yml'

class ProductionRuntimeGuardTests(unittest.TestCase):
    def run_guard(self, value):
        text = WORKFLOW.read_text()
        code = text.split("<<'PYBACKEND'\n", 1)[1].split('          PYBACKEND', 1)[0]
        code = '\n'.join(line[10:] for line in code.splitlines())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'version.json'
            path.write_text(json.dumps(value))
            return subprocess.run(['python3', '-c', code, str(path)],
                env={**os.environ, 'EXPECTED_BACKEND': 'a' * 40},
                capture_output=True, text=True)

    def test_exact_runtime_passes(self):
        self.assertEqual(self.run_guard({'source_sha': 'a' * 40}).returncode, 0)

    def test_old_runtime_is_rejected(self):
        self.assertNotEqual(self.run_guard({'source_sha': 'b' * 40}).returncode, 0)

    def test_current_public_version_without_sha_is_not_proof(self):
        self.assertNotEqual(self.run_guard({'version': '1.0.50', 'build_time': '2026-11-08 07:15'}).returncode, 0)

    def test_missing_and_null_sha_are_rejected(self):
        for value in ({}, {'source_sha': None}, {'source_sha': 'unknown'}):
            with self.subTest(value=value):
                self.assertNotEqual(self.run_guard(value).returncode, 0)

    def test_every_embedded_shell_step_has_valid_bash_syntax(self):
        text = WORKFLOW.read_text()
        runs = text.split('        run: |\n')[1:]
        self.assertGreater(len(runs), 5)
        for index, block in enumerate(runs):
            block = block.split('\n      - ', 1)[0]
            script = '\n'.join(line[10:] if line.startswith('          ') else line for line in block.splitlines())
            result = subprocess.run(['/bin/bash', '-n'], input=script, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, f'step {index}: {result.stderr}')

if __name__ == '__main__':
    unittest.main()
