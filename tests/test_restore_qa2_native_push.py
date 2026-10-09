import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('restore', REPO / 'scripts/restore-qa2-native-push.py')
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)

class NativeRestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sha = restore.git(REPO, 'rev-parse', 'HEAD')
        self.env = {'URTRUCK_BUILD_FLAVOR': 'qa2', 'EXPO_PUBLIC_API_URL': 'https://qa2.urtruck.kz'}
        self.gradle = self.root / 'android/app/build.gradle'
        self.gradle.parent.mkdir(parents=True)
        self.gradle.write_text('namespace "com.urtruck.app.qa2"\napplicationId "com.urtruck.app.qa2"\nversionName "1.0.9-qa2"\n')
        self.manifest = self.root / 'android/app/src/main/AndroidManifest.xml'
        self.manifest.parent.mkdir(parents=True)
        self.manifest.write_text('<service android:name="com.urtruck.app.UrTruckFirebaseMessagingService"/>')
        self.main = self.root / (restore.BASE + '/qa2/MainApplication.kt')
        self.main.parent.mkdir(parents=True)
        self.main.write_text('package com.urtruck.app.qa2\nPackageList(this).packages.apply {\n}\n    loadReactNative(this)\n')

    def plan(self):
        return restore.plan(REPO, self.root, self.sha, self.env)

    def test_restore_exact_canonical_sources_and_idempotence(self):
        first = self.plan()
        for path, content in first.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        self.assertEqual(first, self.plan())
        for name in restore.NAMES:
            canonical = subprocess.check_output(['git', '-C', str(REPO), 'show', self.sha + ':' + restore.BASE + '/' + name])
            self.assertEqual((self.root / (restore.BASE + '/' + name)).read_bytes(), canonical)
        text = self.main.read_text()
        for name in restore.PACKAGES:
            self.assertEqual(text.count('add(com.urtruck.app.' + name + '())'), 1)
        self.assertEqual(text.count('setNotificationDelegationEnabled(false)'), 1)

    def test_reject_production_without_writes(self):
        before = self.main.read_bytes()
        self.env['EXPO_PUBLIC_API_URL'] = 'https://urtruck.kz'
        with self.assertRaises(ValueError): self.plan()
        self.assertEqual(self.main.read_bytes(), before)
        self.assertFalse((self.root / (restore.BASE + '/' + restore.NAMES[0])).exists())

    def test_reject_other_sha(self):
        self.sha = '0' * 40
        with self.assertRaises(ValueError): self.plan()

    def test_reject_wrong_generated_identity(self):
        self.gradle.write_text(self.gradle.read_text().replace('com.urtruck.app.qa2', 'com.urtruck.app'))
        with self.assertRaises(ValueError): self.plan()

    def test_reject_missing_manifest_service(self):
        self.manifest.write_text('<application/>')
        with self.assertRaises(ValueError): self.plan()

    def test_reject_duplicate_package(self):
        self.main.write_text(self.main.read_text() + '\nadd(UrTruckNotificationBadgePackage())\n')
        with self.assertRaises(ValueError): self.plan()

    def test_reject_suffix(self):
        self.gradle.write_text(self.gradle.read_text() + 'applicationIdSuffix ".qa2"\n')
        with self.assertRaises(ValueError): self.plan()

if __name__ == '__main__': unittest.main()
