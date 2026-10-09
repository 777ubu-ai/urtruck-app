// Начальный тест доставки из кабинета; привязка бизнес-аккаунтов ещё не включена.
// Запускается только в отдельном QA2 native binary с проверенными credentials.
import { Platform } from 'react-native';
let initialized = false;
export function initializeOneSignalPilot() {
  if (initialized || Platform.OS === 'web') return false;
  const Constants = require('expo-constants').default;
  const extra = Constants?.expoConfig?.extra;
  const pilot = extra?.oneSignalPilot;
  if (!pilot?.enabled) return false;
  if (extra.urtruckBuildFlavor !== 'qa2'
      || extra.urtruckApiUrl?.replace(/\/+$/, '') !== 'https://qa2.urtruck.kz') {
    throw new Error('Refusing OneSignal outside isolated QA2');
  }
  const { OneSignal, LogLevel } = require('react-native-onesignal');
  OneSignal.Debug.setLogLevel(LogLevel.None);
  OneSignal.initialize(pilot.appId);
  initialized = true;
  return true;
}
