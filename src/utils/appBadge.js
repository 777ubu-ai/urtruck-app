// BUG-003 fix — синхронизация app-icon badge из любого места, не только из
// BottomNav. Раньше setBadgeCountAsync звался лишь в смонтированном таб-баре
// (BottomNav.syncAppIconBadge). Когда открыт ChatScreen (stack поверх табов),
// чтение сообщений гасило серверный is_read, но иконочный бейдж не
// пересчитывался, пока юзер не вернётся на таб-бар → красный кружок висел.
//
// refreshAppIconBadge() берёт свежий Deals-attention из dashboard — ту же
// формулу, что BottomNav использует для вкладки «Сделки». Глобальные
// /chat/unread и /notifications/unread намеренно не используются: они могут
// включать архивные/закрытые комнаты, из-за чего на иконке висит 15 при
// пустом актуальном UI.

import { Platform } from 'react-native';
import { marketAPI } from './marketAPI';
import { computeDealsUnread } from './dealsUnread';
import { storage } from './storage';

async function storedRole() {
  try {
    const raw = await storage.get('ur_session');
    if (!raw) return null;
    const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return session?.user?.role || null;
  } catch {
    return null;
  }
}

export async function refreshAppIconBadge(roleOverride = null) {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  let Notifications;
  try { Notifications = require('expo-notifications'); } catch { return; }
  try {
    const dashboard = await marketAPI.myDashboard({ force: true });
    const role = roleOverride || await storedRole();
    const total = computeDealsUnread(dashboard, { role });
    Notifications.setBadgeCountAsync?.(total).catch(() => {});
  } catch {}
}
