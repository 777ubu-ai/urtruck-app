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

function oneSignalCustom(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  let custom = data.custom;
  if (typeof custom === 'string') {
    if (custom.length > 16384) return null;
    try { custom = JSON.parse(custom); } catch { return null; }
  }
  if (custom && typeof custom === 'object' && !Array.isArray(custom)
    && typeof custom.i === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(custom.i)
    && custom.a && typeof custom.a === 'object' && !Array.isArray(custom.a)) return custom;
  return null;
}

function notificationData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  if (typeof data.room_id === 'string'
    && ['chat_message', 'chat_attachment'].includes(data.type)) return data;
  return oneSignalCustom(data)?.a || data;
}

function markOneSignalDismissed(request) {
  if (Platform.OS !== 'android') return;
  const raw = request?.content?.data || request?.trigger?.remoteMessage?.data;
  if (!oneSignalCustom(raw)) return;
  const identifier = request?.identifier;
  if (typeof identifier !== 'string'
    || !identifier.startsWith('expo-notifications://foreign_notifications?')) return;
  const ids = identifier.split('?')[1].split('&').filter(part => part.startsWith('id='));
  if (ids.length !== 1 || !/^id=-?\d+$/.test(ids[0])) return;
  const id = Number(ids[0].slice(3));
  if (!Number.isInteger(id) || id < -2147483648 || id > 2147483647) return;
  try {
    const extra = require('expo-constants').default?.expoConfig?.extra;
    if (extra?.oneSignalPilot?.enabled !== true || extra.urtruckBuildFlavor !== 'qa2'
      || extra.urtruckApiUrl?.replace(/\/+$/, '') !== 'https://qa2.urtruck.kz') return;
    // Update the SDK record as well as the OS; otherwise restoration can
    // re-present an already read room notification. Never clear a group/all.
    require('react-native-onesignal').OneSignal.Notifications.removeNotification(id);
  } catch {
    // SDK bookkeeping failure must not prevent room-only OS dismissal.
  }
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
      markOneSignalDismissed(request);
      await Notifications.dismissNotificationAsync(request.identifier);
      dismissed += 1;
    } catch {
      // OS dismissal failure must never fail message loading or erase unread.
    }
  }
  return { dismissed };
}
