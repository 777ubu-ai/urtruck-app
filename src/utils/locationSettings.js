import { Linking, Platform } from 'react-native';

// Browser permissions cannot be opened through React Native Linking.
// Web shows manual site-permission instructions and re-checks after the user returns.
export async function openLocationSettings() {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'web_settings_manual' };
  }
  if (typeof Linking?.openSettings !== 'function') {
    return { ok: false, reason: 'settings_unsupported' };
  }
  try {
    await Linking.openSettings();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || 'settings_failed') };
  }
}
