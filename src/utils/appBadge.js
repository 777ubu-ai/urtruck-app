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
import { chatAPI } from './chatAPI';
import { notificationsAPI } from './notificationsAPI';

const pick = (r) => (r && (r.unread ?? r.count ?? r.total)) || 0;

export async function refreshAppIconBadge() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  let Notifications;
  try { Notifications = require('expo-notifications'); } catch { return; }
  try {
    const [c, n] = await Promise.all([
      chatAPI.unread().catch(() => null),
      notificationsAPI.unread().catch(() => null),
    ]);
    const total = (Number(pick(c)) || 0) + (Number(pick(n)) || 0);
    Notifications.setBadgeCountAsync?.(total).catch(() => {});
  } catch {}
}
