const appJson = require('./app.json');

/**
 * Native Yandex MapKit key is injected only at native build time. The value is
 * never committed; local builds read YANDEX_MAPKIT_API_KEY from the shell and
 * CI reads the protected GitHub/EAS secret with the same name.
 */
module.exports = ({ config }) => {
  const expo = appJson.expo || {};
  const baseConfig = config || {};
  const mapKitKey = process.env.YANDEX_MAPKIT_API_KEY || '';

  return {
    ...expo,
    ...baseConfig,
    extra: {
      ...(expo.extra || {}),
      ...(baseConfig.extra || {}),
      yandexMapKitApiKey: mapKitKey || undefined,
    },
  };
};
