import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const app = JSON.parse(read('app.json')).expo;
const splash = read('src/components/AndroidBrandedLaunchSplash.js');
const root = read('App.js');
const nativeStyle = read('android/app/src/main/res/values/styles.xml');
const mainActivity = read('android/app/src/main/java/com/urtruck/app/MainActivity.kt');

test('Android native launch window uses the branded background without a tiny poster', () => {
  assert.equal(app.android.splash.image, './assets/icon.png');
  assert.equal(app.android.splash.backgroundColor, '#070B14');
  assert.equal(app.android.splash.resizeMode, 'contain');
  assert.equal(app.splash.image, './assets/splash/urtruck-splash.png', 'iOS/global splash stays unchanged');
  assert.match(nativeStyle, /windowSplashScreenBackground/);
  assert.match(nativeStyle, /windowSplashScreenAnimatedIcon">@android:color\/transparent/);
  assert.match(nativeStyle, /windowBackground">@drawable\/urtruck_splash_window_background/);
  assert.match(nativeStyle, /navigationBarColor">@color\/splashscreen_background/);
  assert.match(nativeStyle, /windowLightNavigationBar">false/);
});

test('Android branded launch splash preserves the logo and owns system bars during handoff', () => {
  assert.ok(existsSync('assets/splash/urtruck-splash-fullscreen.png'));
  assert.ok(existsSync('android/app/src/main/res/drawable-nodpi/urtruck_splash_fullscreen.png'));
  assert.ok(existsSync('android/app/src/main/res/drawable/urtruck_splash_window_background.xml'));
  assert.match(splash, /urtruck-splash-fullscreen\.png/);
  assert.match(splash, /resizeMode="contain"/);
  assert.match(splash, /StyleSheet\.absoluteFillObject/);
  assert.match(splash, /backgroundColor: '#070B14'/);
  assert.match(splash, /NativeModules/);
  assert.match(splash, /UrTruckSystemBars\?\.setLaunchMode\(visible\)/);
  assert.match(splash, /onLoadEnd=\{\(\) => requestAnimationFrame\(\(\) => setVisible\(false\)\)\}/);
  assert.doesNotMatch(splash, /setTimeout/);
  assert.doesNotMatch(mainActivity, /SplashScreenManager\.registerOnActivity/, 'legacy manager would keep the old contain artwork over the React layer');
  assert.match(mainActivity, /setTheme\(R\.style\.AppTheme\)/);
  assert.match(mainActivity, /SYSTEM_UI_FLAG_HIDE_NAVIGATION/);
  assert.match(splash, /Platform\.OS === 'android'/);
});

test('application root wraps only the launch phase; iOS and existing app logic remain inside', () => {
  assert.match(root, /import AndroidBrandedLaunchSplash/);
  assert.match(root, /<AndroidBrandedLaunchSplash>[\s\S]*<AuthProvider>[\s\S]*<AppInner \/>[\s\S]*<\/AndroidBrandedLaunchSplash>/);
});
