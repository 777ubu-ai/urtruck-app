// backgroundLocation — фоновый GPS-трекинг водителя по активным сделкам
// (expo-task-manager + expo-location). Позиция уходит на сервер, даже когда
// приложение свёрнуто/закрыто iOS'ом в фон — клиент видит «Где машина» 24/7.
//
// Как устроено:
//   - активные deal_id и токен кладутся в storage (фоновая таска не имеет
//     доступа к React-состоянию);
//   - таска BG_LOCATION_TASK определяется на верхнем уровне модуля (импорт
//     из App.js) — требование TaskManager;
//   - start/stop дергается из useDealLocationBroadcast: сервер добавляет
//     сделку вместе с нажатием «Начать рейс»; завершение рейса стопит
//     новые обновления, но не удаляет зафиксированную последнюю точку.
// Требует build 38+ (native): в Expo Go/web тихо не работает (guard'ы).
import { Platform } from 'react-native';
import { storage } from './storage';
import { t } from './i18n';
import { API_BASE } from '../config/env';
import { normalizeLocationPayload } from './gpsQuality';

export const BG_LOCATION_TASK = 'urtruck-deal-location';
const BG_DEALS_KEY = 'ur_bg_deal_ids';
const TOKEN_KEY = 'ur_reg_token';
const BG_STATE_KEY = 'ur_location_broadcast_state';

let broadcastState = {
  mode: 'idle', lastSentAt: null, error: null, offline: false, terminal: false,
};

async function updateBroadcastState(patch) {
  broadcastState = { ...broadcastState, ...patch };
  try { await storage.set(BG_STATE_KEY, JSON.stringify(broadcastState)); } catch {}
  return broadcastState;
}

export function getLocationBroadcastState() {
  return { ...broadcastState };
}

let TaskManager = null;
let Location = null;
try {
  if (Platform.OS !== 'web') {
    TaskManager = require('expo-task-manager');
    Location = require('expo-location');
  }
} catch { /* модули недоступны (web/старый билд) — фоновый режим просто выключен */ }

// Отправка позиции по всем активным сделкам (общая для фона и форграунда).
export async function pushLocationToDeals(position) {
  try {
    const [rawIds, token] = await Promise.all([
      storage.get(BG_DEALS_KEY), storage.get(TOKEN_KEY),
    ]);
    const ids = rawIds ? JSON.parse(rawIds) : [];
    if (!Array.isArray(ids) || !ids.length || !token) {
      await updateBroadcastState({ mode: 'idle', terminal: true, error: null, offline: false });
      return { ok: false, sent: 0, reason: 'inactive' };
    }
    const normalized = normalizeLocationPayload(position);
    if (!normalized) {
      await updateBroadcastState({ error: 'invalid_location', offline: false });
      return { ok: false, sent: 0, reason: 'invalid_location' };
    }
    const payload = JSON.stringify(normalized);
    const results = await Promise.all(ids.map(async (id) => {
      try {
        const response = await fetch(`${API_BASE}/market/deals/${id}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: payload,
        });
        return { ok: response.ok, status: response.status };
      } catch {
        return { ok: false, offline: true };
      }
    }));
    const sent = results.filter((r) => r.ok).length;
    const offline = results.some((r) => r.offline);
    const error = sent === ids.length ? null : (offline ? 'offline' : 'server_rejected');
    await updateBroadcastState({
      mode: Platform.OS === 'android' || Platform.OS === 'web' ? 'foreground_only' : broadcastState.mode,
      lastSentAt: sent ? new Date().toISOString() : broadcastState.lastSentAt,
      error, offline, terminal: false,
    });
    return { ok: sent === ids.length, sent, total: ids.length, offline, error };
  } catch {
    await updateBroadcastState({ error: 'offline', offline: true });
    return { ok: false, sent: 0, offline: true, error: 'offline' };
  }
}

// Регистрация фоновой таски — ВЫЗЫВАЕТСЯ НА ВЕРХНЕМ УРОВНЕ (import в App.js).
if (TaskManager) {
  try {
    TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
      if (error || !data) return;
      const { locations } = data;
      const last = locations && locations[locations.length - 1];
      if (last && last.coords) await pushLocationToDeals(last);
    });
  } catch { /* повторная регистрация при hot-reload — ок */ }
}

// Сохранить список активных сделок для фоновой таски.
export async function setActiveDealIds(ids) {
  const safeIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  try { await storage.set(BG_DEALS_KEY, JSON.stringify(safeIds)); } catch {}
  if (!safeIds.length) await updateBroadcastState({ mode: 'terminal', terminal: true, error: null, offline: false });
}

// Ask the operating system inside the single «Начать рейс» action. No deal
// becomes active if iOS/Android has denied location access. The actual task
// starts only after the server returns status=active.
export async function ensureBackgroundLocationPermission() {
  // Web/PWA and the current Android release can still provide truthful
  // foreground tracking while UrTruck is open. Android background permission
  // is intentionally absent from the manifest until Google Play approves the
  // declaration (see CLAUDE.md); do not turn a usable foreground permission
  // into a dead-end error for the driver.
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return { ok: false, reason: 'unsupported' };
      }
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000,
        });
      });
      return { ok: true, foregroundOnly: true, mode: 'foreground_only' };
    } catch (e) {
      return { ok: false, reason: e?.code === 1 ? 'fg_denied' : 'unavailable' };
    }
  }
  let locationModule = Location;
  if (!locationModule) {
    try { locationModule = await import('expo-location'); }
    catch { return { ok: false, reason: 'unsupported' }; }
  }
  try {
    const fg = await locationModule.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return { ok: false, reason: 'fg_denied' };
    if (Platform.OS === 'web' || Platform.OS === 'android') {
      return { ok: true, foregroundOnly: true, mode: 'foreground_only' };
    }
    let bg;
    try {
      bg = await locationModule.requestBackgroundPermissionsAsync();
    } catch (e) {
      if (Platform.OS === 'android') return { ok: true, foregroundOnly: true };
      throw e;
    }
    if (bg.status !== 'granted') {
      if (Platform.OS === 'android') return { ok: true, foregroundOnly: true };
      return { ok: false, reason: 'bg_denied' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e && e.message) };
  }
}

// Первая точка не должна ждать следующего 15/25-секундного poll. Вызывается
// сразу после успешного перехода сделки в in_progress; далее постоянную
// передачу продолжает useDealLocationBroadcast.
export async function getCurrentLocationPayload() {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000,
        });
      });
      return normalizeLocationPayload(pos);
    } catch {
      return null;
    }
  }
  let locationModule = Location;
  if (!locationModule) {
    try { locationModule = await import('expo-location'); }
    catch { return null; }
  }
  try {
    const pos = await locationModule.getCurrentPositionAsync({ accuracy: locationModule.Accuracy.Balanced });
    return normalizeLocationPayload(pos);
  } catch { return null; }
}

// Стартовать фоновый трекинг (если есть сделки и есть разрешение «Всегда»).
export async function startBackgroundTracking() {
  const permission = await ensureBackgroundLocationPermission();
  if (!permission.ok) return permission;
  if (permission.foregroundOnly) {
    await updateBroadcastState({ mode: 'foreground_only', terminal: false, error: null, offline: false });
    return { ok: true, active: true, mode: 'foreground_only', foregroundOnly: true };
  }
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (started) return { ok: true, already: true, mode: 'background' };
    await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60000,            // раз в минуту в фоне — достаточно и бережно к батарее
      distanceInterval: 400,          // или каждые 400 м
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,   // честная синяя плашка iOS
      foregroundService: {
        notificationTitle: t('bg_location_title'),
        notificationBody: t('bg_location_body'),
      },
    });
    await updateBroadcastState({ mode: 'background', terminal: false, error: null, offline: false });
    return { ok: true, mode: 'background' };
  } catch (e) {
    return { ok: false, reason: String(e && e.message) };
  }
}

export async function stopBackgroundTracking() {
  if (!TaskManager || !Location) return;
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  } catch {}
}
