/**
 * Expo Config Plugin: Android-only splash logo size override.
 *
 * BUG: @expo/prebuild-config хардкодит imageWidth=200 при генерации
 * android/app/src/main/res/drawable-{density}/splashscreen_logo.png из
 * top-level `expo.splash` (см. getAndroidSplashConfig.js в @expo/prebuild-config —
 * imageWidth не читается из app.json, только из explicit plugin props).
 * Источник портретного лого (assets/splash/urtruck-splash.png) при 200px
 * выглядит маленькой иконкой на Android 12+ system splash экране.
 *
 * Плагин запускается ПОСЛЕ базовой генерации сплэша (as a `plugins` entry
 * применяется после @expo/prebuild-config base mods) и перегенерирует те
 * же 5 PNG с бОльшим imageWidth — тем же пайплайном (@expo/image-utils),
 * что использует сам Expo, просто с другим параметром.
 *
 * iOS не затрагивается: withDangerousMod вызывается только для 'android'.
 * После миграции на новую unified-splash архитектуру Expo (если появится
 * официальный imageWidth в app.json) этот plugin можно убрать.
 */
const { withDangerousMod } = require('expo/config-plugins');
const path = require('path');
const fs = require('fs-extra');

const SPLASH_IMAGE = './assets/splash/urtruck-splash.png';
const BACKGROUND_COLOR = '#070B14';
const IMAGE_WIDTH = 280; // было 200 (Expo default) — логотип терялся на фоне

const SIZES = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};

async function regenerateSplashDrawables(projectRoot) {
  const { generateImageAsync, generateImageBackgroundAsync, compositeImagesAsync } = require('@expo/image-utils');
  const androidMainPath = path.join(projectRoot, 'android/app/src/main');
  const image = path.join(projectRoot, SPLASH_IMAGE);

  for (const [key, multiplier] of Object.entries(SIZES)) {
    const size = IMAGE_WIDTH * multiplier;
    const canvasSize = 288 * multiplier;
    const background = await generateImageBackgroundAsync({
      width: canvasSize,
      height: canvasSize,
      backgroundColor: BACKGROUND_COLOR,
      resizeMode: 'cover',
    });
    const { source: foreground } = await generateImageAsync(
      { projectRoot, cacheType: 'splash-android-size-override' },
      { src: image, resizeMode: 'contain', width: size, height: size }
    );
    const composed = await compositeImagesAsync({
      background,
      foreground,
      x: (canvasSize - size) / 2,
      y: (canvasSize - size) / 2,
    });
    const outPath = path.join(androidMainPath, `res/drawable-${key}/splashscreen_logo.png`);
    await fs.ensureDir(path.dirname(outPath));
    await fs.writeFile(outPath, composed);
  }
}

function withAndroidSplashSize(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      await regenerateSplashDrawables(config.modRequest.projectRoot);
      return config;
    },
  ]);
}

module.exports = withAndroidSplashSize;
