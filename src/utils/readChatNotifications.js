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
    const data = request?.content?.data || request?.trigger?.remoteMessage?.data || {};
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
