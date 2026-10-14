import importlib.util,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("fcm_gate",Path(__file__).parents[2]/"scripts/verify_android_fcm_handler.py")
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
SERVICE='<service android:name="com.urtruck.app.UrTruckFirebaseMessagingService" android:exported="false"><intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT"/></intent-filter></service>'
class MergedManifestGate(unittest.TestCase):
 def check(self,body):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/"AndroidManifest.xml"
   p.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application>'+body+'</application></manifest>')
   gate.verify(p)
 def test_private_single_handler(self):
  self.check(SERVICE+'<meta-data android:name="firebase_messaging_notification_delegation_enabled" android:value="false"/>')
 def test_duplicate_is_rejected(self):
  with self.assertRaisesRegex(ValueError,"exactly one"):self.check(SERVICE+SERVICE)
 def test_exported_is_rejected(self):
  with self.assertRaisesRegex(ValueError,"private"):self.check(SERVICE.replace('exported="false"','exported="true"'))
 def test_proxy_is_rejected(self):
  with self.assertRaisesRegex(ValueError,"delegation"):self.check(SERVICE)
