// Public provider identities are verified against the native token by the server.
export function oneSignalPilotEnabled() {
  try {
    const e = require('expo-constants').default?.expoConfig?.extra;
    return e?.oneSignalPilot?.enabled === true && e.urtruckBuildFlavor === 'qa2'
      && e.urtruckApiUrl?.replace(/\/+$/, '') === 'https://qa2.urtruck.kz';
  } catch { return false; }
}
export async function readOneSignalRegistration() {
  if (!oneSignalPilotEnabled()) return null;
  const { OneSignal } = require('react-native-onesignal');
  const [id, userId, token, optedIn] = await Promise.all([
    OneSignal.User.pushSubscription.getIdAsync(), OneSignal.User.getOnesignalId(),
    OneSignal.User.pushSubscription.getTokenAsync(), OneSignal.User.pushSubscription.getOptedInAsync(),
  ]);
  if (!id || !userId || !token || optedIn !== true) return null;
  return { onesignal_subscription_id: id, onesignal_user_id: userId,
    app_id: 'com.urtruck.app.qa2', token };
}
