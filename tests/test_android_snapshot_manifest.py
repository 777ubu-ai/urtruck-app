"""Артефактный gate должен отклонять даже службу без background permissions."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('manifest_gate', Path(__file__).resolve().parents[1] / 'scripts/verify_android_snapshot_manifest.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def manifest(service='', permission=''):
    return f'<manifest xmlns:android="http://schemas.android.com/apk/res/android">{permission}<application>{service}</application></manifest>'


class SnapshotManifestTest(unittest.TestCase):
    def test_foreground_and_unrelated_services_are_allowed(self):
        gate.verify(manifest('<service android:name="Push"/><service android:name="Audio" android:foregroundServiceType="microphone"/>', '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>'))

    def test_expo_location_service_alone_is_rejected(self):
        with self.assertRaises(ValueError):
            gate.verify(manifest('<service android:name="expo.modules.location.services.LocationTaskService"/>'))

    def test_location_bitmask_and_combined_names_are_rejected(self):
        for value in ['location', 'microphone|location', '0x00000008', '0x00000088', '8', '136']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                gate.verify(manifest(f'<service android:name="Other" android:foregroundServiceType="{value}"/>'))

    def test_background_permissions_and_unknown_service_type_are_rejected(self):
        for permission in ['ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE_LOCATION']:
            with self.subTest(permission=permission), self.assertRaises(ValueError):
                gate.verify(manifest(permission=f'<uses-permission-sdk-23 android:name="android.permission.{permission}"/>'))
        with self.assertRaises(ValueError):
            gate.verify(manifest('<service android:name="Other" android:foregroundServiceType="@integer/unknown"/>'))


if __name__ == '__main__':
    unittest.main()
