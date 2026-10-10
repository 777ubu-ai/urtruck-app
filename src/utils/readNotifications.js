import { Platform } from 'react-native';
import { notificationData, markOneSignalDismissed } from './readChatNotifications';

export async function dismissConfirmedNotifications(confirmation, { readBefore, isCurrent = () => true } = {}) {
  if (confirmation?.ok !== true || !Number.isFinite(readBefore) || !isCurrent()
      || !['android', 'ios'].includes(Platform.OS)) return { dismissed: 0 };
  const ids = new Set((Array.isArray(confirmation.read_ids) ? confirmation.read_ids : []).map(String).filter(id => /^\d+$/.test(id)));
  const keys = new Set((Array.isArray(confirmation.read_event_keys) ? confirmation.read_event_keys : []).filter(k => typeof k === 'string' && k));
  if (!ids.size && !keys.size) return { dismissed: 0 };
  let notifications;
  try { notifications = require('expo-notifications'); } catch { return { dismissed: 0 }; }
  let presented;
  try { presented = await notifications.getPresentedNotificationsAsync(); } catch { return { dismissed: 0 }; }
  let dismissed = 0;
  for (const notification of presented || []) {
    if (!isCurrent()) break;
    const request = notification?.request;
    const data = notificationData(request?.content?.data || request?.trigger?.remoteMessage?.data);
    const matches = ids.has(String(data.notification_id)) || keys.has(data.event_id)
      || keys.has(data.event_key) || keys.has(data.notification_event_key);
    const deliveredAt = Number(notification?.date);
    if (!matches || !request?.identifier || !Number.isFinite(deliveredAt)
        || deliveredAt <= 0 || deliveredAt > readBefore) continue;
    try {
      markOneSignalDismissed(request);
      await notifications.dismissNotificationAsync(request.identifier);
      dismissed += 1;
    } catch {}
  }
  return { dismissed };
}
