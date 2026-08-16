from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

# app.json: make FCM configuration explicit and request Android 13+ permission.
p = ROOT / 'app.json'
data = json.loads(p.read_text(encoding='utf-8'))
android = data['expo'].setdefault('android', {})
android['googleServicesFile'] = './google-services.json'
perms = android.setdefault('permissions', [])
if 'android.permission.POST_NOTIFICATIONS' not in perms:
    perms.append('android.permission.POST_NOTIFICATIONS')
for plugin in data['expo'].get('plugins', []):
    if isinstance(plugin, list) and plugin and plugin[0] == 'expo-notifications':
        plugin[1]['defaultChannel'] = 'default'
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Checked-in native project is used by deploy-play.yml, so wire Google Services
# there too (APK workflow prebuild will generate the same wiring from app.json).
p = ROOT / 'android/build.gradle'
s = p.read_text(encoding='utf-8')
needle = "        classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')"
if "com.google.gms:google-services" not in s:
    s = s.replace(needle, needle + "\n        classpath('com.google.gms:google-services:4.4.4')", 1)
p.write_text(s, encoding='utf-8')

p = ROOT / 'android/app/build.gradle'
s = p.read_text(encoding='utf-8')
needle = 'apply plugin: "com.facebook.react"'
if 'apply plugin: "com.google.gms.google-services"' not in s:
    s = s.replace(needle, needle + '\napply plugin: "com.google.gms.google-services"', 1)
p.write_text(s, encoding='utf-8')

# APK workflow: root google-services.json must exist before expo prebuild.
p = ROOT / '.github/workflows/build-android-apk.yml'
s = p.read_text(encoding='utf-8')
needle = '      - name: Expo prebuild (Android, non-interactive)\n'
step = '''      - name: Configure Firebase / FCM\n        env:\n          GOOGLE_SERVICES_JSON_BASE64: ${{ secrets.GOOGLE_SERVICES_JSON_BASE64 }}\n        run: |\n          if [ -z "$GOOGLE_SERVICES_JSON_BASE64" ]; then\n            echo "::error::GOOGLE_SERVICES_JSON_BASE64 is missing. Android push is a release blocker."\n            exit 1\n          fi\n          echo "$GOOGLE_SERVICES_JSON_BASE64" | base64 -d > google-services.json\n          python3 - <<'PY'\n          import json\n          d=json.load(open('google-services.json'))\n          pkgs=[c.get('client_info',{}).get('android_client_info',{}).get('package_name') for c in d.get('client',[])]\n          assert 'com.urtruck.app' in pkgs, f'google-services.json does not contain com.urtruck.app: {pkgs}'\n          print('Firebase client config: com.urtruck.app OK')\n          PY\n\n'''
if 'GOOGLE_SERVICES_JSON_BASE64 is missing' not in s:
    s = s.replace(needle, step + needle, 1)
p.write_text(s, encoding='utf-8')

# Play workflow builds the checked-in android project, so decode into app/.
p = ROOT / '.github/workflows/deploy-play.yml'
s = p.read_text(encoding='utf-8')
needle = '      - name: Build release AAB\n'
step = '''      - name: Configure Firebase / FCM\n        env:\n          GOOGLE_SERVICES_JSON_BASE64: ${{ secrets.GOOGLE_SERVICES_JSON_BASE64 }}\n        run: |\n          if [ -z "$GOOGLE_SERVICES_JSON_BASE64" ]; then\n            echo "::error::GOOGLE_SERVICES_JSON_BASE64 is missing. Android push is a release blocker; refusing Play upload."\n            exit 1\n          fi\n          echo "$GOOGLE_SERVICES_JSON_BASE64" | base64 -d > android/app/google-services.json\n          python3 - <<'PY'\n          import json\n          d=json.load(open('android/app/google-services.json'))\n          pkgs=[c.get('client_info',{}).get('android_client_info',{}).get('package_name') for c in d.get('client',[])]\n          assert 'com.urtruck.app' in pkgs, f'google-services.json does not contain com.urtruck.app: {pkgs}'\n          print('Firebase client config: com.urtruck.app OK')\n          PY\n\n'''
if 'Android push is a release blocker; refusing Play upload' not in s:
    s = s.replace(needle, step + needle, 1)
p.write_text(s, encoding='utf-8')

# Permanent source-level guard: catches accidental removal even before Android CI.
t = ROOT / 'tests/frontend/android_push_config_static.test.mjs'
t.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const rootGradle = fs.readFileSync('android/build.gradle', 'utf8');
const appGradle = fs.readFileSync('android/app/build.gradle', 'utf8');

test('Android native push has Firebase client configuration contract', () => {
  assert.equal(app.expo.android.googleServicesFile, './google-services.json');
  assert.ok(app.expo.android.permissions.includes('android.permission.POST_NOTIFICATIONS'));
  assert.match(rootGradle, /com\.google\.gms:google-services:4\.4\.4/);
  assert.match(appGradle, /apply plugin: "com\.google\.gms\.google-services"/);
});
''', encoding='utf-8')

print('Android FCM readiness patch applied')
