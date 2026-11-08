"""Исполняет read-only verifier из workflow на точном runtime PR695."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github/workflows/testflight-local.yml'

class ProductionRuntimeGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = tempfile.TemporaryDirectory(prefix='urtruck-runtime-test-')
        cls.backend = Path(cls.snapshot.name)
        manifest = json.loads((ROOT/'docs/release/testflight-production-115-2-backend.json').read_text())
        for name in manifest['files']:
            path = cls.backend/name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(subprocess.check_output(['git','show',manifest['source_sha']+':backend/'+name], cwd=ROOT))

    @classmethod
    def tearDownClass(cls):
        cls.snapshot.cleanup()

    def run_guard(self, mutation=None):
        with tempfile.TemporaryDirectory(prefix='urtruck-runtime-check-') as directory:
            root = Path(directory)
            backend = root/'backend'
            shutil.copytree(self.backend, backend)
            if mutation:
                mutation(backend)
            (root/'scripts').symlink_to(ROOT/'scripts', target_is_directory=True)
            (root/'release-config').symlink_to(ROOT, target_is_directory=True)
            text = WORKFLOW.read_text()
            code = text.split("<<'PYPREP'\n",1)[1].split('          PYPREP',1)[0]
            code = '\n'.join(line[10:] for line in code.splitlines())
            env = {**os.environ, 'RUNNER_TEMP': str(root), 'BACKEND_DIR': str(backend)}
            result = subprocess.run(['python3','-c',code], cwd=root, env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            return subprocess.run(['python3',str(root/'verify-production-readonly.py')],cwd=root,env=env,capture_output=True,text=True)

    def test_exact_reviewed_183_files_pass(self):
        r=self.run_guard()
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(json.loads(r.stdout)['files'],183)

    def test_changed_file_is_rejected(self):
        self.assertNotEqual(self.run_guard(lambda p:(p/'main.py').write_text('# drift')).returncode,0)

    def test_missing_file_is_rejected(self):
        self.assertNotEqual(self.run_guard(lambda p:(p/'main.py').unlink()).returncode,0)

    def test_extra_runtime_file_is_rejected(self):
        self.assertNotEqual(self.run_guard(lambda p:(p/'unexpected.py').write_text('# extra')).returncode,0)

    def test_symlink_is_rejected(self):
        def mutate(p):
            (p/'main.py').unlink()
            (p/'main.py').symlink_to(p/'config.py')
        self.assertNotEqual(self.run_guard(mutate).returncode,0)

    def test_every_embedded_shell_step_has_valid_bash_syntax(self):
        runs=WORKFLOW.read_text().split('        run: |\n')[1:]
        self.assertGreater(len(runs),5)
        for index,block in enumerate(runs):
            block=block.split('\n      - ',1)[0]
            script='\n'.join(line[10:] if line.startswith('          ') else line for line in block.splitlines())
            result=subprocess.run(['/bin/bash','-n'],input=script,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,f'{index}: {result.stderr}')

if __name__ == '__main__':
    unittest.main()
