// backgroundLocation — GPS-трекинг водителя по активным сделкам.
// Android: пользователь явно запускает рейс, подтверждает disclosure, даёт
// foreground permission, затем включает "Разрешить всегда" для активного
// рейса. Координаты отправляются только по серверно-разрешённым сделкам.
// Web показывает тот же per-trip disclosure перед browser location permission.
// iOS сохраняет отдельный background-location flow.
import { Platform } from 'react-native';
import { storage, durableStorage } from './storage';
import { createLocationQueue, locationSampleId } from './locationQueue';
import { t } from './i18n';
import { API_BASE } from '../config/env';
import { requestLocationPermissionThroughDisclosure } from './locationPermissionCoordinator';
export { openLocationSettings } from './locationSettings';

export const BG_LOCATION_TASK = 'urtruck-deal-location';
const BG_DEALS_KEY = 'ur_bg_deal_ids';
export const BG_LOCATION_QUEUE_KEY = 'ur_bg_location_queue_v1';
const BG_LAST_LOCATION_KEY = 'ur_bg_last_location_v1';
const TOKEN_KEY = 'ur_reg_token';
const locationQueue = createLocationQueue(durableStorage);

// A background task can overlap with a foreground tick or a second OS task
// callback. Serialize the queue read/flush/write cycle so one sample cannot be
// lost by two callers writing stale snapshots over each other.
let locationPushChain = Promise.resolve();
// Expo persists background-task registrations across process restarts and app
// updates. Re-register once per fresh JS process so changed canonical options
// (heartbeat/distance policy) actually replace an older installed contract.
let backgroundTrackingConfiguredThisProcess = false;

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

function normalizeLocationSnapshot(coords) {
  const lat = Number(coords?.latitude ?? coords?.lat);
  const lng = Number(coords?.longitude ?? coords?.lng);
  const timestamp = Number(coords?.timestamp);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180
      || !Number.isFinite(timestamp) || timestamp < 946684800000 || timestamp > Date.now() + 300000) return null;
  return {
    latitude: lat,
    longitude: lng,
    heading: coords?.heading != null && coords.heading >= 0 ? coords.heading : null,
    speed: coords?.speed != null && coords.speed >= 0 ? coords.speed : null,
    timestamp,
  };
}

async function rememberLastKnownLocation(coords) {
  const snapshot = normalizeLocationSnapshot(coords);
  if (!snapshot) return null;
  try { await storage.set(BG_LAST_LOCATION_KEY, JSON.stringify(snapshot)); } catch {}
  return snapshot;
}

function sampleForDeal(dealId, coords) {
  const snapshot = normalizeLocationSnapshot(coords);
  if (!dealId || !snapshot) return null;
  return {
    dealId,
    lat: snapshot.latitude,
    lng: snapshot.longitude,
    heading: snapshot.heading,
    speed: snapshot.speed,
    capturedAt: snapshot.timestamp,
  };
}

async function postLocationSample(sample, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE}/market/deals/${sample.dealId}/location`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        lat: sample.lat,
        lng: sample.lng,
        heading: sample.heading,
        speed: sample.speed,
        captured_at_ms: sample.capturedAt,
        sample_id: locationSampleId(sample),
      }),
    });
    if ([400, 403, 404, 409, 422].includes(response?.status)) {
      return { quarantine: response.status };
    }
    if (!response?.ok) return false;
    const ack = await response.json();
    return ack?.ok === true && ack.sample_id === locationSampleId(sample);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshBackgroundActiveDealIds(token, fallbackIds = []) {
  const fallback = Array.isArray(fallbackIds) ? fallbackIds : [];
  if (!token) return fallback;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE}/market/tracking/active`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response?.ok) return fallback;
    const data = await response.json().catch(() => ({}));
    if (data?.ok !== true || !Array.isArray(data.deal_ids)
        || !data.deal_ids.every((id) => typeof id === 'string' && id.length > 0)) return fallback;
    if (await storage.get(TOKEN_KEY) !== token) return [];
    const ids = [...new Set(data.deal_ids)];
    await storage.set(BG_DEALS_KEY, JSON.stringify(ids));
    return ids;
  } catch {
    // Offline is not the same as "no active deals". Keep the last server-
    // approved IDs so samples continue entering the persistent FIFO.
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

async function pushLocationToDealsNow(coords, explicitDealIds = null) {
  try {
    // Время сохранённого измерения не заменяется временем доставки.
    const captured = Array.isArray(coords) ? coords : [coords];
    await rememberLastKnownLocation(captured[captured.length - 1]);
    const [rawIds, token] = await Promise.all([
      storage.get(BG_DEALS_KEY), storage.get(TOKEN_KEY),
    ]);
    const storedIds = rawIds ? JSON.parse(rawIds) : [];
    let ids = Array.isArray(explicitDealIds) ? explicitDealIds : storedIds;
    if (!token) return;
    const ownerId = JSON.parse(await storage.get('ur_session') || 'null')?.user?.id;
    if (!ownerId) return;
    if (!await durableStorage.get(BG_LOCATION_QUEUE_KEY + ':migrated')) {
      await locationQueue.migrate(BG_LOCATION_QUEUE_KEY, ownerId);
    }
    const persist = async (dealIds) => {
      for (const id of dealIds || []) {
        for (const point of captured) {
          const current = sampleForDeal(id, point);
          if (current) await locationQueue.append({ ...current, ownerId });
        }
      }
    };
    // Весь callback записан до первого сетевого ожидания, даже offline.
    if (await storage.get(TOKEN_KEY) !== token) return;
    await persist(ids);
    if (!Array.isArray(explicitDealIds)) {
      ids = await refreshBackgroundActiveDealIds(token, ids);
    }
    if (!Array.isArray(ids) || !ids.length) return;
    if (await storage.get(TOKEN_KEY) !== token) return;
    await persist(ids);
    for (const id of ids) {
      await locationQueue.drain(id, (sample) => postLocationSample(sample, token), async () => {
        if (await storage.get(TOKEN_KEY) !== token) return false;
        const active = JSON.parse(await storage.get(BG_DEALS_KEY) || '[]');
        return active.includes(id);
      }, ownerId);
    }
    return { ok: true };
  } catch {
    console.warn('[GPS] Очередь не обработана; сохранённые точки оставлены для повтора');
    return { ok: false, code: 'GPS_QUEUE_FAILURE' };
  }
}

// Send coordinates only for server-approved active deal IDs. Failed samples
// are persisted and retried on the next callback/foreground tick; they are
// never silently discarded as a successful-looking delivery.
export function pushLocationToDeals(coords, explicitDealIds = null) {
  const job = locationPushChain.then(() => pushLocationToDealsNow(coords, explicitDealIds));
  locationPushChain = job.catch(() => {});
  return job;
}

if (TaskManager) {
  try {
    TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error } = {}) => {
      if (error) return;
      const locations = data?.locations;
      if (Array.isArray(locations) && locations.length) {
        await pushLocationToDeals(locations.map((item) => ({ ...item.coords, timestamp: item.timestamp ?? item.coords?.timestamp })));
      } else {
        // Пустой callback только повторяет очередь. Старый GPS не становится
        // новым heartbeat: свежесть подтверждается настоящим измерением ОС.
        await pushLocationToDeals(null);
      }
    });
  } catch { /* duplicate definition during hot reload is safe */ }
}

export async function setActiveDealIds(ids) {
  try {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && id.length > 0)) return;
    const nextIds = [...new Set(ids)];
    await storage.set(BG_DEALS_KEY, JSON.stringify(nextIds));
    // Неактивные точки остаются в архиве очереди, но больше не отправляются.
  } catch {}
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

    if (Platform.OS === 'android') {
      const bg = await locationModule.getBackgroundPermissionsAsync();
      return {
        supported: true,
        platform: 'android',
        foreground: fg.status,
        foregroundCanAskAgain: fg.canAskAgain !== false,
        background: bg.status,
        backgroundCanAskAgain: bg.canAskAgain !== false,
        ok: fg.status === 'granted' && bg.status === 'granted',
        foregroundOnly: false,
        foregroundService: true,
        backgroundRequired: true,
        reason: fg.status !== 'granted'
          ? 'foreground_required'
          : bg.status !== 'granted'
            ? 'background_required'
            : undefined,
      };
    }

    // iOS keeps the existing always/background grant for active-trip updates.
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

// Foreground permission is requested only after the in-app disclosure and an
// explicit user tap. Android then continues to the system background-location
// flow/settings for "Allow all the time".
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

export async function requestBackgroundLocationPermission() {
  if (Platform.OS === 'web') return { ok: true, foregroundOnly: true };

  const locationModule = await resolveLocationModule();
  if (!locationModule) return { ok: false, reason: 'unsupported' };
  try {
    const fg = await locationModule.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return { ok: false, reason: 'foreground_required' };

    const current = await locationModule.getBackgroundPermissionsAsync();
    if (current.status === 'granted') {
      return {
        ok: true,
        status: 'granted',
        foregroundOnly: false,
        foregroundService: Platform.OS === 'android',
        backgroundRequired: Platform.OS === 'android',
      };
    }

    const result = await locationModule.requestBackgroundPermissionsAsync();
    if (result.status === 'granted') {
      return {
        ok: true,
        status: 'granted',
        foregroundOnly: false,
        foregroundService: Platform.OS === 'android',
        backgroundRequired: Platform.OS === 'android',
      };
    }
    return {
      ok: false,
      status: result.status,
      canAskAgain: result.canAskAgain !== false,
      requiresSettings: Platform.OS === 'android',
      reason: result.canAskAgain === false || Platform.OS === 'android' ? 'settings_required' : 'bg_denied',
    };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || 'bg_permission_failed') };
  }
}

// Compatibility entry point used by start-trip actions.
// Android and web MUST go through the registered visible per-trip disclosure
// host. Android then requires "Allow all the time"; iOS keeps its own
// foreground + background flow.
export async function ensureBackgroundLocationPermission() {
  if (Platform.OS === 'android' || Platform.OS === 'web') {
    return requestLocationPermissionThroughDisclosure({ source: 'start_trip' });
  }

  const current = await getBackgroundLocationPermissionState();
  if (current.ok) return {
    ok: true,
    foregroundOnly: !!current.foregroundOnly,
    foregroundService: !!current.foregroundService,
  };

  const fg = await requestForegroundLocationPermission();
  if (!fg.ok) return fg;
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
      timestamp: pos.timestamp,
      captured_at_ms: pos.timestamp,
    };
  } catch { return null; }
}

// Read-only preflight for Start trip. It never requests permissions and keeps
// GPS capability errors distinct for truthful UI messaging.
export async function getLocationHealth() {
  const locationModule = await resolveLocationModule();
  if (!locationModule) return { state: 'unsupported' };
  try {
    const permission = await locationModule.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') return { state: 'permission_denied' };
    const provider = await locationModule.getProviderStatusAsync?.();
    if (provider && provider.locationServicesEnabled === false) return { state: 'system_disabled' };
    const position = await Promise.race([
      locationModule.getCurrentPositionAsync({ accuracy: locationModule.Accuracy.Balanced }),
      new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    const c = position?.coords;
    if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return { state: 'no_fix' };
    return { state: 'ready', point: { lat: c.latitude, lng: c.longitude } };
  } catch {
    return { state: 'no_fix' };
  }
}

// Background hook may call this after the deal becomes active. It MUST NOT
// trigger a permission dialog by itself. On Android it starts the visible
// foreground service only after foreground + background permissions are granted.
export async function startBackgroundTracking({ forceReconfigure = false } = {}) {
  if (Platform.OS === 'web') return { ok: false, reason: 'background_unavailable', foregroundOnly: true };
  const locationModule = await resolveLocationModule();
  if (!locationModule) return { ok: false, reason: 'unsupported' };

  const permission = await getBackgroundLocationPermissionState();
  if (!permission.ok) {
    return {
      ok: false,
      reason: 'background_unavailable',
      permission,
    };
  }

  try {
    const started = await locationModule.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (started && backgroundTrackingConfiguredThisProcess && !forceReconfigure) return { ok: true, already: true };
    // A package update can leave Expo's persisted registration alive with the
    // OLD options. A user may also return from Android's system Location
    // settings after the provider was disabled: force one visible stop/start
    // so Expo re-subscribes instead of retaining a silent stale registration.
    // Ordinary refreshes keep the same service and do not churn it.
    if (started) {
      await locationModule.stopLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => {});
    }
    await locationModule.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: locationModule.Accuracy.Balanced,
      // Active-trip tracking needs a time heartbeat even while the truck is
      // stopped at a warehouse/border. A 400 m distance gate let Android keep
      // the FGS alive but stop callbacks for a stationary device, so the
      // backend incorrectly aged `last_signal_at` into gps_lost. Keep the
      // one-minute cadence authoritative; movement is not required.
      timeInterval: 60000,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: t('bg_location_title'),
        notificationBody: t('bg_location_body'),
      },
    });
    backgroundTrackingConfiguredThisProcess = true;
    return { ok: true, foregroundService: Platform.OS === 'android', reconfigured: started };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || 'background_start_failed') };
  }
}

export async function stopBackgroundTracking() {
  // A native task can outlive an app-process restart.  In that case the
  // module-global Location binding is still null when the dashboard first
  // learns that there are no server-approved active deals.  Resolve it here
  // so completed/cancelled trips always tear down the persisted Android FGS.
  const locationModule = await resolveLocationModule();
  if (!TaskManager || !locationModule) return;
  try {
    const started = await locationModule.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (started) await locationModule.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  } catch {}
}
