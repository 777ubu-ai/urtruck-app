const baseExpoConfig = require('./app.json').expo;

const isQa2 = process.env.URTRUCK_BUILD_FLAVOR === 'qa2';
const qa2VersionCode = Number(process.env.URTRUCK_VERSION_CODE || '211039959');

module.exports = {
  expo: {
    ...baseExpoConfig,
    version: isQa2 ? (process.env.URTRUCK_VERSION_NAME || '1.0.8') : baseExpoConfig.version,
    android: {
      ...baseExpoConfig.android,
      ...(isQa2
        ? {
            package: 'com.urtruck.app.qa2',
            versionCode: qa2VersionCode,
          }
        : {}),
    },
  },
};
