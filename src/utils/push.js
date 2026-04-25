// Push клиент — Web Push (PWA/браузер) + Expo Notifications (native FCM/APNs).
import { Platform } from 'react-native';
import { storage } from './storage';
import { API_BASE } from '../config/env';

const BASE = `${API_BASE}/push`;

const TOKEN_KEY = 'ur_reg_token';
const PUSH_ASKED = 'ur_push_asked';
const NATIVE_TOKEN_KEY = 'ur_push_native_token';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export const push = {
  isSupported() {
    return Platform.OS === 'web'
      && typeof window !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
  },

  async wasAsked() {
    return (await storage.get(PUSH_ASKED)) === '1';
  },

  async permission() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  },

  async subscribe() {
    if (!this.isSupported()) return { ok: false, reason: 'unsupported' };

    // 1. Permission
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    await storage.set(PUSH_ASKED, '1');
    if (perm !== 'granted') return { ok: false, reason: 'denied' };

    // 2. Получаем public key
    const { public_key, mock } = await fetch(`${BASE}/public-key`).then(r => r.json());
    if (!public_key) {
      // MOCK режим — подписка невозможна без VAPID, но это ок для dev
      return { ok: false, reason: 'no_vapid', mock: true };
    }

    // 3. SW ready
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });
    }

    // 4. Отправляем на бэк
    const token = await storage.get(TOKEN_KEY);
    await fetch(`${BASE}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: sub.toJSON().keys,
        user_agent: navigator.userAgent,
      }),
    });
    return { ok: true, mock };
  },

  async unsubscribe() {
    if (this.isSupported()) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${BASE}/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    }
    // Native: убираем expo-токен с backend
    try {
      const existing = await storage.get(NATIVE_TOKEN_KEY);
      if (existing) {
        await fetch(`${BASE}/unregister-native`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: existing }),
        });
        await storage.remove(NATIVE_TOKEN_KEY);
      }
    } catch {}
  },

  // ── Native (Expo Notifications) ──
  isNative() {
    return Platform.OS === 'ios' || Platform.OS === 'android';
  },

  async registerNative() {
    if (!this.isNative()) return { ok: false, reason: 'web' };
    let Notifications, Device;
    try {
      Notifications = require('expo-notifications');
      Device = require('expo-device');
    } catch {
      return { ok: false, reason: 'expo-notifications-not-installed' };
    }

    // Emulator/simulator — чаще всего не даёт токен
    if (!Device.isDevice) return { ok: false, reason: 'emulator' };

    // Handler: показываем notification даже когда app в foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true,
      }),
    });

    // Permissions
    const cur = await Notifications.getPermissionsAsync();
    let status = cur.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    await storage.set(PUSH_ASKED, '1');
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    // Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'UrTruck',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#378ADD',
      });
    }

    // Expo Push Token
    let tokenData;
    try {
      tokenData = await Notifications.getExpoPushTokenAsync();
    } catch (e) {
      return { ok: false, reason: 'token_failed', error: String(e) };
    }
    const token = tokenData?.data;
    if (!token) return { ok: false, reason: 'no_token' };

    // Отправляем на бэк
    const authToken = await storage.get(TOKEN_KEY);
    await fetch(`${BASE}/register-native`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken ? `Bearer ${authToken}` : '',
      },
      body: JSON.stringify({
        token,
        provider: 'expo',
        platform: Platform.OS,
        device_name: Device.modelName || Device.deviceName || null,
      }),
    });
    await storage.set(NATIVE_TOKEN_KEY, token);
    return { ok: true, token };
  },

  // ── Единый автозапуск: web.subscribe() если PWA, иначе registerNative() ──
  async autoRegister() {
    if (this.isSupported()) return this.subscribe();
    if (this.isNative()) return this.registerNative();
    return { ok: false, reason: 'unsupported' };
  },
};
