import sys, xml.etree.ElementTree as ET
from pathlib import Path

A = "{http://schemas.android.com/apk/res/android}"
def verify(path):
    root = ET.parse(path).getroot()
    app = root.find("application")
    if app is None: raise ValueError("No merged application")
    handlers = [s for s in app.findall("service") if any(
        a.get(A+"name") == "com.google.firebase.MESSAGING_EVENT"
        for a in s.findall("intent-filter/action"))]
    if len(handlers) != 1: raise ValueError("Expected exactly one merged FCM handler")
    handler = handlers[0]
    if handler.get(A+"name") not in (".UrTruckFirebaseMessagingService", "com.urtruck.app.UrTruckFirebaseMessagingService"):
        raise ValueError("Unexpected merged FCM handler")
    if handler.get(A+"exported") != "false": raise ValueError("FCM handler must be private")
    if not any(m.get(A+"name") == "firebase_messaging_notification_delegation_enabled"
               and m.get(A+"value") == "false" for m in app.findall("meta-data")):
        raise ValueError("FCM delegation must be explicitly disabled")

if __name__ == "__main__":
    base = Path(sys.argv[1])
    paths = [base] if base.is_file() else [p for p in base.rglob("AndroidManifest.xml")
        if "/release/" in str(p) and ("/merged_manifest/" in str(p) or "/merged_manifests/" in str(p))]
    if not paths: raise SystemExit("Merged release manifest missing")
    for path in paths: verify(path)
    print("Verified one private Expo-derived FCM handler in merged release manifest")
