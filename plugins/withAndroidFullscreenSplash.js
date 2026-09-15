const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidStyles, withDangerousMod } = require('@expo/config-plugins');

const SPLASH_BACKGROUND = `
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/splashscreen_background" />
  <item>
    <bitmap
      android:gravity="center"
      android:src="@drawable/urtruck_splash_fullscreen" />
  </item>
</layer-list>
`.trimStart();

const APP_THEME_ITEMS = [
  ['android:windowFullscreen', 'true'],
  ['android:windowBackground', '@drawable/urtruck_splash_window_background'],
  ['android:navigationBarColor', '@color/splashscreen_background'],
  ['android:windowLightNavigationBar', 'false'],
];

function setStyleItems(xml, styleName, items) {
  const groups = xml.resources.style || (xml.resources.style = []);
  let group = groups.find((candidate) => candidate.$?.name === styleName);
  if (!group) {
    group = { $: { name: styleName }, item: [] };
    groups.push(group);
  }
  group.item = group.item || [];
  for (const [name, value] of items) {
    const item = AndroidConfig.Resources.buildResourceItem({ name, value });
    const index = group.item.findIndex((candidate) => candidate.$?.name === name);
    if (index >= 0) group.item[index] = item;
    else group.item.push(item);
  }
  return xml;
}

module.exports = function withAndroidFullscreenSplash(config) {
  const withResources = withDangerousMod(config, ['android', async (mod) => {
    const projectRoot = mod.modRequest.projectRoot;
    const platformRoot = mod.modRequest.platformProjectRoot;
    const resRoot = path.join(platformRoot, 'app', 'src', 'main', 'res');
    const drawableRoot = path.join(resRoot, 'drawable');
    const drawableNodpiRoot = path.join(resRoot, 'drawable-nodpi');
    const canonicalImage = path.join(
      projectRoot,
      'android',
      'app',
      'src',
      'main',
      'res',
      'drawable-nodpi',
      'urtruck_splash_fullscreen.png',
    );
    const outputImage = path.join(drawableNodpiRoot, 'urtruck_splash_fullscreen.png');
    const backgroundPath = path.join(drawableRoot, 'urtruck_splash_window_background.xml');

    fs.mkdirSync(drawableRoot, { recursive: true });
    fs.mkdirSync(drawableNodpiRoot, { recursive: true });
    if (!fs.existsSync(canonicalImage)) {
      throw new Error(
        'Canonical Android splash artwork is missing. Run prebuild without --clean so the approved native resource remains available.',
      );
    }
    fs.copyFileSync(canonicalImage, outputImage);
    fs.writeFileSync(backgroundPath, SPLASH_BACKGROUND, 'utf8');

    return mod;
  }]);

  return withAndroidStyles(withResources, (mod) => {
    const appTheme = setStyleItems(mod.modResults, 'AppTheme', APP_THEME_ITEMS);
    mod.modResults = setStyleItems(appTheme, 'Theme.App.SplashScreen', [
      ...APP_THEME_ITEMS,
      ['windowSplashScreenBackground', '@color/splashscreen_background'],
      ['windowSplashScreenAnimatedIcon', '@android:color/transparent'],
      ['postSplashScreenTheme', '@style/AppTheme'],
    ]);
    return mod;
  });
};
