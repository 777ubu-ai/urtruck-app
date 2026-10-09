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
  const { createOneSignalForegroundHandler } = require('./oneSignalForeground');
  const { decideForegroundPresentation } = require('./pushRuntime');
  const { getActiveRoom } = require('./activeRoom');
  const { claimPushEvent } = require('./pushEventDedup');
  const { push } = require('./push');
  OneSignal.Notifications.addEventListener('foregroundWillDisplay',
    createOneSignalForegroundHandler({
      decide: decideForegroundPresentation,
      readActiveRoom: getActiveRoom,
      acknowledge: (id, options) => push.acknowledgeReceipt(id, options),
      claimDisplay: (id) => claimPushEvent(id, 'display'),
    }));
  const { oneSignalClickBridge } = require('./oneSignalClicks');
  OneSignal.Notifications.addEventListener('click', (event) => oneSignalClickBridge.receive(event));
  OneSignal.initialize(pilot.appId);
  initialized = true;
  return true;
}
