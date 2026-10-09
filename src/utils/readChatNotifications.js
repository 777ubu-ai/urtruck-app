import { Platform } from 'react-native';

function foreignChatRoom(identifier) {
  if (typeof identifier !== 'string'
    || !identifier.startsWith('expo-notifications://foreign_notifications?')) return null;
  const tag = identifier.split('?')[1].split('&').find((part) => part.startsWith('tag='));
  if (!tag) return null;
  try {
    const value = decodeURIComponent(tag.slice(4));
    return /^chat:[A-Za-z0-9_.-]+$/.test(value) ? value.slice(5) : null;
  } catch { return null; }
}

function notificationData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  // Native APNs/FCM and OneSignal's newer os_data format keep app data at
  // the top level. Never override an explicit top-level chat with a wrapper.
  if (typeof data.room_id === 'string'
    && ['chat_message', 'chat_attachment'].includes(data.type)) return data;
  let custom = data.custom;
  if (typeof custom === 'string') {
    if (custom.length > 16384) return data;
    try { custom = JSON.parse(custom); } catch { return data; }
  }
  // Older OneSignal payloads use custom.a (object on iOS, encoded string
  // on Android). Require its provider notification UUID before unwrapping.
  if (custom && typeof custom === 'object' && !Array.isArray(custom)
    && typeof custom.i === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(custom.i)
    && custom.a && typeof custom.a === 'object' && !Array.isArray(custom.a)) return custom.a;
  return data;
}

// Dismiss only notifications which were already delivered when a successful
// visible-room history request started. A later push must remain unread.
export async function dismissReadChatNotifications(roomId, {
  readBefore,
  isCurrent = () => true,
} = {}) {
  if (!roomId || !Number.isFinite(readBefore) || !isCurrent()) return { dismissed: 0 };
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return { dismissed: 0 };
  let Notifications;
  try { Notifications = require('expo-notifications'); } catch { return { dismissed: 0 }; }
  if (!Notifications.getPresentedNotificationsAsync || !Notifications.dismissNotificationAsync) {
    return { dismissed: 0 };
  }
  let presented;
  try { presented = await Notifications.getPresentedNotificationsAsync(); } catch {
    return { dismissed: 0 };
  }
  let dismissed = 0;
  for (const notification of presented || []) {
    if (!isCurrent()) break;
    const request = notification?.request;
    const data = notificationData(request?.content?.data || request?.trigger?.remoteMessage?.data || {});
    // FCM's OS-rendered background notification can lose custom data when
    // enumerated by Expo. Its provider-generated tag still identifies room.
    const foreignRoom = Platform.OS === 'android' ? foreignChatRoom(request?.identifier) : null;
    const matchesChat = (data.room_id === roomId
      && ['chat_message', 'chat_attachment'].includes(data.type)) || foreignRoom === roomId;
    const deliveredAt = Number(notification?.date);
    if (!request?.identifier || !matchesChat
      || !Number.isFinite(deliveredAt) || deliveredAt <= 0 || deliveredAt > readBefore) continue;
    try {
      await Notifications.dismissNotificationAsync(request.identifier);
      dismissed += 1;
    } catch {
      // OS dismissal failure must never fail message loading or erase unread.
    }
  }
  return { dismissed };
}
