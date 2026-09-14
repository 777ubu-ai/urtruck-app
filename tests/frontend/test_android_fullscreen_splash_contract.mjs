import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const app = JSON.parse(read('app.json')).expo;
const splash = read('src/components/AndroidBrandedLaunchSplash.js');
const root = read('App.js');
const nativeStyle = read('android/app/src/main/res/values/styles.xml');
const mainActivity = read('android/app/src/main/java/com/urtruck/app/MainActivity.kt');

test('Android uses a short icon-only system splash instead of the tall branded poster', () => {
  assert.equal(app.android.splash.image, './assets/icon.png');
  assert.equal(app.android.splash.backgroundColor, '#070B14');
  assert.equal(app.android.splash.resizeMode, 'contain');
  assert.equal(app.splash.image, './assets/splash/urtruck-splash.png', 'iOS/global splash stays unchanged');
  assert.match(nativeStyle, /windowSplashScreenBackground/);
  assert.match(nativeStyle, /windowSplashScreenAnimatedIcon">@android:color\/transparent/);
});

test('Android branded launch splash uses the supplied 1080x1920 asset edge-to-edge', () => {
  assert.ok(existsSync('assets/splash/urtruck-splash-fullscreen.png'));
  assert.match(splash, /urtruck-splash-fullscreen\.png/);
  assert.match(splash, /resizeMode="cover"/);
  assert.match(splash, /StyleSheet\.absoluteFillObject/);
  assert.match(splash, /backgroundColor: '#070B14'/);
  assert.match(splash, /NativeStatusBar\.setHidden\(visible, 'fade'\)/);
  assert.match(splash, /onLoadEnd=\{\(\) => setImageReady\(true\)\}/);
  assert.match(splash, /if \(!isAndroid \|\| !imageReady\) return undefined/);
  assert.doesNotMatch(mainActivity, /SplashScreenManager\.registerOnActivity/, 'legacy manager would keep the old contain artwork over the React layer');
  assert.match(splash, /Platform\.OS === 'android'/);
});

test('application root wraps only the launch phase; iOS and existing app logic remain inside', () => {
  assert.match(root, /import AndroidBrandedLaunchSplash/);
  assert.match(root, /<AndroidBrandedLaunchSplash>[\s\S]*<AuthProvider>[\s\S]*<AppInner \/>[\s\S]*<\/AndroidBrandedLaunchSplash>/);
});
