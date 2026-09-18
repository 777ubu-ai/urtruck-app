import { Platform, AppState } from 'react-native';
import Constants from 'expo-constants';
import { API_BASE } from '../config/env';
import { regAPI } from './registration';
import { getLanguage } from './i18n';

let lastSentAt = 0;
let lastScreen = '';
const MIN_REPEAT_MS = 25_000;

const appVersion = () => (
  Constants?.expoConfig?.version
  || Constants?.nativeAppVersion
  || ''
);

export async function sendPresenceHeartbeat(screen = 'app', force = false) {
  if (AppState.currentState && AppState.currentState !== 'active') return { skipped: true };
  const cleanScreen = String(screen || 'app').slice(0, 80);
  const now = Date.now();
  if (!force && cleanScreen === lastScreen && now - lastSentAt < MIN_REPEAT_MS) return { skipped: true };

  const token = await regAPI.getToken();
  if (!token) return { skipped: true };
  lastSentAt = now;
  lastScreen = cleanScreen;

  try {
    const response = await fetch(`${API_BASE}/presence/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform: Platform.OS || 'unknown',
        app_version: appVersion(),
        screen: cleanScreen,
        locale: getLanguage?.() || '',
      }),
    });
    // Presence is observability. A backend/Redis failure must never interrupt
    // cargo, chat, deal, GPS or navigation flows.
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}
