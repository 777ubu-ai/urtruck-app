const baseExpoConfig = require('./app.json').expo;

const isQa2 = process.env.URTRUCK_BUILD_FLAVOR === 'qa2';
const qa2VersionCode = Number(process.env.URTRUCK_VERSION_CODE || '211039959');
const apiOverride = process.env.EXPO_PUBLIC_API_URL || '';

module.exports = {
  expo: {
    ...baseExpoConfig,
    version: isQa2 ? (process.env.URTRUCK_VERSION_NAME || '1.0.8') : baseExpoConfig.version,
    extra: {
      ...(baseExpoConfig.extra || {}),
      ...(apiOverride ? { urtruckApiUrl: apiOverride } : {}),
    },
    android: {
      ...baseExpoConfig.android,
      // Local physical QA uses adb reverse to an isolated HTTP backend. Keep
      // cleartext disabled everywhere else, especially production builds.
      usesCleartextTraffic: false,
      ...(isQa2
        ? {
            package: 'com.urtruck.app.qa2',
            versionCode: qa2VersionCode,
          }
        : {}),
    },
    plugins: [
      ...(baseExpoConfig.plugins || []),
      './plugins/withAndroidFullscreenSplash',
      ...(isQa2 ? ['./plugins/withQaLocalCleartext'] : []),
    ],
  },
};
