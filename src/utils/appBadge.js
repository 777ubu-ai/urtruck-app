// BUG-003 fix — синхронизация app-icon badge из любого места, не только из
// BottomNav. Раньше setBadgeCountAsync звался лишь в смонтированном таб-баре
// (BottomNav.syncAppIconBadge). Когда открыт ChatScreen (stack поверх табов),
// чтение сообщений гасило серверный is_read, но иконочный бейдж не
// пересчитывался, пока юзер не вернётся на таб-бар → красный кружок висел.
//
// refreshAppIconBadge() берёт свежий unread (чат + уведомления) — та же
// формула, что в BottomNav — и ставит иконочный бейдж. Безопасно: значение
// то же, что посчитает BottomNav на своём поле, поэтому двойной сеттер не
// конфликтует (оба сходятся к одному числу).

import { Platform, NativeModules } from 'react-native';
import { notificationsAPI } from './notificationsAPI';

let refreshVersion = 0;
let latestSuccessfulVersion = 0;
let applyQueue = Promise.resolve();

function normalizedBadge(total) {
  const value = Number(total);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function badgeFailureReason(error) {
  const detail = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  if (detail.includes('shortcutbadgeexception') || detail.includes('unable to execute badge')) {
    return 'launcher_badge_unsupported';
  }
  return 'native_badge_failed';
}

export async function setAppIconBadge(total, { observedBefore = Date.now() } = {}) {
  const badge = normalizedBadge(total);
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { badge, applied: false, reason: 'platform_unsupported' };
  }
  if (Platform.OS === 'android') {
    const nativeBadge = NativeModules?.UrTruckNotificationBadge;
    if (nativeBadge?.setCanonicalCount) {
      try {
        const result = await nativeBadge.setCanonicalCount(badge, observedBefore);
        return {
          badge,
          applied: result?.applied === true,
          reason: result?.applied === true ? null : (result?.reason || 'native_badge_failed'),
        };
      } catch (error) {
        return { badge, applied: false, reason: badgeFailureReason(error) };
      }
    }
    // Expo Android's zero path cancels every OS notification. Never use it
    // as a fallback: scoped read dismissal owns notification removal.
    if (badge === 0) return { badge, applied: false, reason: 'scoped_badge_reset_unavailable' };
  }
  let Notifications;
  try { Notifications = require('expo-notifications'); } catch {
    return { badge, applied: false, reason: 'notifications_unavailable' };
  }
  try {
    const applied = await Notifications.setBadgeCountAsync?.(badge);
    return {
      badge,
      applied: applied !== false,
      reason: applied === false ? 'launcher_badge_unsupported' : null,
    };
  } catch (error) {
    // Xiaomi launchers can reject Android's legacy BADGE_COUNT_UPDATE
    // intent.  Keep the canonical server value intact for the in-app tab;
    // never pretend that a failed launcher write successfully reset to zero.
    const reason = badgeFailureReason(error);
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[badge]', reason);
    return { badge, applied: false, reason };
  }
}

export function clearAppIconBadge() {
  const version = ++refreshVersion;
  const observedBefore = Date.now();
  latestSuccessfulVersion = version;
  applyQueue = applyQueue.then(() => setAppIconBadge(0, { observedBefore }));
  return applyQueue;
}

export async function refreshAppIconBadge() {
  const version = ++refreshVersion;
  const observedBefore = Date.now();
  try {
    const canonical = await notificationsAPI.badge();
    const badge = normalizedBadge(canonical?.badge);
    if (version < latestSuccessfulVersion) {
      return { badge, applied: false, reason: 'superseded' };
    }
    latestSuccessfulVersion = version;
    const apply = applyQueue.then(async () => {
      if (version < latestSuccessfulVersion) {
        return { badge, applied: false, reason: 'superseded' };
      }
      return setAppIconBadge(badge, { observedBefore });
    });
    applyQueue = apply.catch(() => {});
    return apply;
  } catch {
    return { badge: null, applied: false, reason: 'canonical_unavailable' };
  }
}
