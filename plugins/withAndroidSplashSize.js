/**
 * Expo Config Plugin: Android-only splash logo size override.
 *
 * @expo/prebuild-config generates android splash drawables from expo.splash
 * with the default image width, which makes UrTruck's portrait logo look too
 * small on the Android 12+ system splash screen. This plugin reruns the same
 * Expo image-utils pipeline after the base splash generation, only with a
 * larger image size.
 */
const { withDangerousMod } = require('expo/config-plugins');
const path = require('path');
const fs = require('fs-extra');

const SPLASH_IMAGE = './assets/splash/urtruck-splash.png';
const BACKGROUND_COLOR = '#070B14';
const IMAGE_WIDTH = 280;

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
      { src: image, resizeMode: 'contain', width: size, height: size },
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
