// Push уведомления через Service Worker (web)
import { Platform } from 'react-native';

export const pushSupported = () => {
  if (Platform.OS !== 'web') return false;
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
};

export const getPermission = () => {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
};

export const requestPermission = async () => {
  if (!pushSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return 'denied';
  }
};

// Показать локальное уведомление (без сервера)
export const showLocalNotification = async (title, options = {}) => {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body: options.body || '',
      icon: options.icon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚛</text></svg>',
      tag: options.tag || 'urtruck',
      data: options.url || '/',
      vibrate: [200, 100, 200],
      ...options,
    });
    return true;
  } catch (e) {
    return false;
  }
};

// Слушаем клики по уведомлениям (когда SW postMessage)
export const listenToNotificationClicks = (callback) => {
  if (Platform.OS !== 'web' || !navigator.serviceWorker) return () => {};
  const handler = (e) => {
    if (e.data?.type === 'notification') callback(e.data.url);
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
};
