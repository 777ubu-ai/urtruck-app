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
} catch { /* модули недоступны (web/старый билд) — фоновый режим просто выключен */ }

// Отправка позиции по всем активным сделкам (общая для фона и форграунда).
export async function pushLocationToDeals(coords) {
  try {
    const [rawIds, token] = await Promise.all([
      storage.get(BG_DEALS_KEY), storage.get(TOKEN_KEY),
    ]);
    const ids = rawIds ? JSON.parse(rawIds) : [];
    if (!Array.isArray(ids) || !ids.length || !token) return;
    const payload = JSON.stringify({
      lat: coords.latitude, lng: coords.longitude,
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
  } catch { /* фон не должен падать */ }
}

// Регистрация фоновой таски — ВЫЗЫВАЕТСЯ НА ВЕРХНЕМ УРОВНЕ (import в App.js).
if (TaskManager) {
  try {
    TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
      if (error || !data) return;
      const { locations } = data;
      const last = locations && locations[locations.length - 1];
      if (last && last.coords) await pushLocationToDeals(last.coords);
    });
  } catch { /* повторная регистрация при hot-reload — ок */ }
}

// Сохранить список активных сделок для фоновой таски.
export async function setActiveDealIds(ids) {
  try { await storage.set(BG_DEALS_KEY, JSON.stringify(ids || [])); } catch {}
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
  let locationModule = Location;
  if (!locationModule) {
    try { locationModule = await import('expo-location'); }
    catch { return { ok: false, reason: 'unsupported' }; }
  }
  try {
    const fg = await locationModule.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return { ok: false, reason: 'fg_denied' };
    if (Platform.OS === 'web') return { ok: true, foregroundOnly: true };
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
  let locationModule = Location;
  if (!locationModule) {
    try { locationModule = await import('expo-location'); }
    catch { return null; }
  }
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

// Стартовать фоновый трекинг (если есть сделки и есть разрешение «Всегда»).
export async function startBackgroundTracking() {
  const permission = await ensureBackgroundLocationPermission();
  if (!permission.ok) return permission;
  if (permission.foregroundOnly) {
    return { ok: false, reason: 'background_unavailable', foregroundOnly: true };
  }
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (started) return { ok: true, already: true };
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
    return { ok: true };
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
