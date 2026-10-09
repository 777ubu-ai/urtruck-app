// Не включать новый нативный SDK в существующие production-сборки.
const { resolveOneSignalPilot } = require('./config/onesignal-pilot');
module.exports = {
  dependencies: resolveOneSignalPilot().enabled ? {} : {
    'react-native-onesignal': { platforms: { android: null, ios: null } },
  },
};
