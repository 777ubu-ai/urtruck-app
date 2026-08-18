// backgroundLocation — фоновый GPS-трекинг водителя по активным сделкам.
// ВАЖНО для Google Play: системные permission prompts НЕ должны появляться
// из фонового hook'а. Их запускает только явный пользовательский flow после
// prominent disclosure на экране сделки.
import { Linking, Platform } from 'react-native';
import { storage } from './storage';
import { t } from './i18n';
import { API_BASE } from '../config/env';

export const BG_LOCATION_TASK = 'urtruck-deal-location';
const BG_DEALS_KEY = 'ur_bg_deal_ids';
const TOKEN_KEY = 'ur_reg_token';

let TaskManager = null;
let Location = null;
try {
  if (Platform.OS !== 'web') {
    TaskManager = require('expo-task-manager');
    Location = require('expo-location');
  }
} catch { /* old/dev build: feature reports unsupported instead of crashing */ }

async function resolveLocationModule() {
  if (Location) return Location;
  try {
    const module = await import('expo-location');
    Location = module;
    return module;
  } catch {
    return null;
  }
}

// Send coordinates only for server-approved active deal IDs.
export async function pushLocationToDeals(coords) {
  try {
    const [rawIds, token] = await Promise.all([
      storage.get(BG_DEALS_KEY), storage.get(TOKEN_KEY),
    ]);
    const ids = rawIds ? JSON.parse(rawIds) : [];
    if (!Array.isArray(ids) || !ids.length || !token) return;
    const payload = JSON.stringify({
      lat: coords.latitude,
      lng: coords.longitude,
      heading: coords.heading != null && coords.heading >= 0 ? coords.heading : null,
      speed: coords.speed != null && coords.speed >= 0 ? coords.speed : null,
    });
    await Promise.all(ids.map((id) =>
      fetch(`${API_BASE}/market/deals/${id}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: payload,
      }).catch(() => {})
    ));
  } catch { /* background task must never crash the app */ }
}

if (TaskManager) {
  try {
    TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
      if (error || !data) return;
      const { locations } = data;
      const last = locations && locations[locations.length - 1];
      if (last && last.coords) await pushLocationToDeals(last.coords);
    });
  } catch { /* duplicate definition during hot reload is safe */ }
}

export async function setActiveDealIds(ids) {
  try { await storage.set(BG_DEALS_KEY, JSON.stringify(ids || [])); } catch {}
}

export async function getBackgroundLocationPermissionState() {
  const locationModule = await resolveLocationModule();
  if (!locationModule) {
    return {
      supported: false,
      platform: Platform.OS,
      foreground: 'unavailable',
      background: 'unavailable',
      ok: false,
      reason: 'unsupported',
    };
  }

  try {
    const fg = await locationModule.getForegroundPermissionsAsync();
    if (Platform.OS === 'web') {
      return {
        supported: true,
        platform: 'web',
        foreground: fg.status,
        foregroundCanAskAgain: fg.canAskAgain !== false,
        background: 'not_applicable',
        backgroundCanAskAgain: false,
        ok: fg.status === 'granted',
        foregroundOnly: true,
      };
    }

    const bg = await locationModule.getBackgroundPermissionsAsync();
    return {
      supported: true,
      platform: Platform.OS,
      foreground: fg.status,
      foregroundCanAskAgain: fg.canAskAgain !== false,
      background: bg.status,
      backgroundCanAskAgain: bg.canAskAgain !== false,
      ok: fg.status === 'granted' && bg.status === 'granted',
      foregroundOnly: false,
    };
  } catch (error) {
    return {
      supported: true,
      platform: Platform.OS,
      foreground: 'unknown',
      background: 'unknown',
      ok: false,
      reason: String(error?.message || error || 'permission_state_failed'),
    };
  }
}

// Step 1: foreground permission. Call only after the in-app disclosure.
export async function requestForegroundLocationPermission() {
  const locationModule = await resolveLocationModule();
  if (!locationModule) return { ok: false, reason: 'unsupported' };
  try {
    const current = await locationModule.getForegroundPermissionsAsync();
    if (current.status === 'granted') return { ok: true, status: 'granted' };
    const result = await locationModule.requestForegroundPermissionsAsync();
    if (result.status === 'granted') return { ok: true, status: 'granted' };
    return {
      ok: false,
      status: result.status,
      canAskAgain: result.canAskAgain !== false,
      reason: result.canAskAgain === false ? 'settings_required' : 'fg_denied',
    };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || 'fg_permission_failed') };
  }
}

// Step 2: background permission. On Android 11+ Expo may open the system app
// settings screen; that is expected and must happen only after our educational
// disclosure screen has explained why "Allow all the time" is needed.
export async function requestBackgroundLocationPermission() {
  if (Platform.OS === 'web') return { ok: true, foregroundOnly: true };
  const locationModule = await resolveLocationModule();
  if (!locationModule) return { ok: false, reason: 'unsupported' };
  try {
    const fg = await locationModule.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return { ok: false, reason: 'foreground_required' };

    const current = await locationModule.getBackgroundPermissionsAsync();
    if (current.status === 'granted') return { ok: true, status: 'granted' };

    const result = await locationModule.requestBackgroundPermissionsAsync();
    if (result.status === 'granted') return { ok: true, status: 'granted' };
    return {
      ok: false,
      status: result.status,
      canAskAgain: result.canAskAgain !== false,
      reason: result.canAskAgain === false ? 'settings_required' : 'bg_denied',
    };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || 'bg_permission_failed') };
  }
}

export async function openLocationSettings() {
  try {
    await Linking.openSettings();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || 'settings_failed') };
  }
}

// Compatibility entry point used by iOS/older callers. On native Android this
// is STRICT: foreground-only is not enough for an active long-haul trip.
// The Deal Workspace displays disclosure before calling this function.
export async function ensureBackgroundLocationPermission() {
  const fg = await requestForegroundLocationPermission();
  if (!fg.ok) return fg;
  if (Platform.OS === 'web') return { ok: true, foregroundOnly: true };
  const bg = await requestBackgroundLocationPermission();
  if (!bg.ok) return bg;
  return { ok: true, foregroundOnly: false };
}

export async function getCurrentLocationPayload() {
  const locationModule = await resolveLocationModule();
  if (!locationModule) return null;
  try {
    const pos = await locationModule.getCurrentPositionAsync({ accuracy: locationModule.Accuracy.Balanced });
    const c = pos?.coords;
    if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
    return {
      lat: c.latitude,
      lng: c.longitude,
      heading: c.heading != null && c.heading >= 0 ? c.heading : null,
      speed: c.speed != null && c.speed >= 0 ? c.speed : null,
    };
  } catch { return null; }
}

// Background hook may call this after the deal becomes active. It MUST NOT
// trigger a permission dialog by itself. If permission was revoked, stop and
// return a state the UI can surface on next foreground resume.
export async function startBackgroundTracking() {
  if (Platform.OS === 'web') return { ok: false, reason: 'background_unavailable', foregroundOnly: true };
  const locationModule = await resolveLocationModule();
  if (!locationModule) return { ok: false, reason: 'unsupported' };

  const permission = await getBackgroundLocationPermissionState();
  if (!permission.ok) {
    return {
      ok: false,
      reason: permission.background === 'granted' ? 'foreground_unavailable' : 'background_unavailable',
      permission,
    };
  }

  try {
    const started = await locationModule.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (started) return { ok: true, already: true };
    await locationModule.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: locationModule.Accuracy.Balanced,
      timeInterval: 60000,
      distanceInterval: 400,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: t('bg_location_title'),
        notificationBody: t('bg_location_body'),
      },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || 'background_start_failed') };
  }
}

export async function stopBackgroundTracking() {
  if (!TaskManager || !Location) return;
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  } catch {}
}
