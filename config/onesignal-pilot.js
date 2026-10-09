// Пилот разрешён только в изолированной QA2-сборке. App ID — публичный.
const APP_ID = 'e6f77ac9-aac9-4e7d-be68-a5d805e95fbf';
function resolveOneSignalPilot(env = process.env) {
  const enabled = env.URTRUCK_PUSH_PROVIDER === 'onesignal';
  if (!enabled) return { enabled: false };
  if (env.URTRUCK_BUILD_FLAVOR !== 'qa2') {
    throw new Error('OneSignal pilot is restricted to QA2');
  }
  const endpoint = (env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');
  if (endpoint !== 'https://qa2.urtruck.kz') {
    throw new Error('OneSignal pilot requires the isolated HTTPS QA2 API');
  }
  if (env.URTRUCK_ONESIGNAL_PLATFORMS_READY !== '1') {
    throw new Error('Verify QA2 FCM/APNs credentials before building the OneSignal pilot');
  }
  return { enabled: true, appId: APP_ID, bundleIdentifier: 'com.urtruck.app.qa2' };
}
module.exports = { resolveOneSignalPilot };
