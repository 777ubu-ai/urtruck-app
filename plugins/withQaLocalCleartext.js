const { withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

/**
 * Local physical QA uses adb reverse to an isolated HTTP backend.
 * This plugin is included only by app.config.js for the qa2 flavor.
 * Production/release configurations never apply this manifest override.
 */
module.exports = function withQaLocalCleartext(config) {
  const withQaManifest = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application?.$) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return mod;
  });

  // expo-splash-screen prebuild комментирует установленное переключение на
  // AppTheme и добавляет legacy-хук Activity. Для сгенерированного QA2
  // возвращаем канонический startup Activity с темой AppCompat NoActionBar.
  return withMainActivity(withQaManifest, (mod) => {
    let contents = mod.modResults.contents
      .replace(/\nimport expo\.modules\.splashscreen\.SplashScreenManager\n/, '\n')
      .replace(/(\/\/ )?setTheme\(R\.style\.AppTheme\)/, 'setTheme(R.style.AppTheme)')
      .replace(/\n    \/\/ @generated begin expo-splashscreen[\s\S]*?    \/\/ @generated end expo-splashscreen\n/, '\n');

    return {
      ...mod,
      modResults: {
        ...mod.modResults,
        contents,
      },
    };
  });
};
