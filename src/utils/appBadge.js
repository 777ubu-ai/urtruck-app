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

import { Platform } from 'react-native';
import { notificationsAPI } from './notificationsAPI';

let refreshVersion = 0;

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

export async function setAppIconBadge(total) {
  const badge = normalizedBadge(total);
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { badge, applied: false, reason: 'platform_unsupported' };
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
  refreshVersion += 1;
  return setAppIconBadge(0);
}

export async function refreshAppIconBadge() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { badge: 0, applied: false, reason: 'platform_unsupported' };
  }
  const version = ++refreshVersion;
  try {
    const canonical = await notificationsAPI.badge();
    const badge = normalizedBadge(canonical?.badge);
    if (version !== refreshVersion) return { badge, applied: false, reason: 'superseded' };
    return setAppIconBadge(badge);
  } catch {
    return { badge: null, applied: false, reason: 'canonical_unavailable' };
  }
}
