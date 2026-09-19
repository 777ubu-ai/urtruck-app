const isQa2 = process.env.URTRUCK_BUILD_FLAVOR === 'qa2';
const qa2VersionCode = Number(process.env.URTRUCK_VERSION_CODE || '211039959');
const apiOverride = process.env.EXPO_PUBLIC_API_URL || '';

module.exports = ({ config }) => ({
  ...config,
  version: isQa2 ? (process.env.URTRUCK_VERSION_NAME || '1.0.8') : config.version,
  extra: {
    ...(config.extra || {}),
    ...(apiOverride ? { urtruckApiUrl: apiOverride } : {}),
    urtruckBuildFlavor: isQa2 ? 'qa2' : 'production',
  },
  android: {
    ...config.android,
    ...(isQa2
      ? {
          package: 'com.urtruck.app.qa2',
          versionCode: qa2VersionCode,
        }
      : {}),
  },
  plugins: [
    ...(config.plugins || []),
    './plugins/withAndroidFullscreenSplash',
    ...(isQa2 ? ['./plugins/withQaLocalCleartext'] : []),
  ],
});
