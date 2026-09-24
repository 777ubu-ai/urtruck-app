const { existsSync } = require('node:fs');

const isQa2 = process.env.URTRUCK_BUILD_FLAVOR === 'qa2';
const qa2VersionCode = Number(process.env.URTRUCK_VERSION_CODE || '211039959');
const apiOverride = process.env.EXPO_PUBLIC_API_URL || '';
const PRODUCTION_API_URL = 'https://urtruck.kz';
const normalizedApiOverride = apiOverride.replace(/\/+$/, '');

// QA2 must never silently reuse the production API. A missing or production
// endpoint makes the build fail before any test account can reach real data.
if (isQa2 && (!normalizedApiOverride || normalizedApiOverride === PRODUCTION_API_URL)) {
  throw new Error(
    'QA2 build requires EXPO_PUBLIC_API_URL pointing to an isolated non-production QA API',
  );
}

module.exports = ({ config }) => {
  const androidConfig = { ...config.android };
  if (androidConfig.googleServicesFile && !existsSync(androidConfig.googleServicesFile)) {
    delete androidConfig.googleServicesFile;
  }

  return ({
  ...config,
  version: isQa2 ? (process.env.URTRUCK_VERSION_NAME || '1.0.8') : config.version,
  extra: {
    ...(config.extra || {}),
    ...(apiOverride ? { urtruckApiUrl: apiOverride } : {}),
    urtruckBuildFlavor: isQa2 ? 'qa2' : 'production',
  },
  android: {
    ...androidConfig,
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
};
