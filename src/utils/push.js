// Push клиент — Web Push (PWA/браузер) + Expo Notifications (native FCM/APNs).
import { Platform } from 'react-native';
import { storage } from './storage';
import { API_BASE } from '../config/env';
import { getActiveRoom } from './activeRoom';  // QA-аудит P2-2

const BASE = `${API_BASE}/push`;

const TOKEN_KEY = 'ur_reg_token';
const PUSH_ASKED = 'ur_push_asked';
const NATIVE_TOKEN_KEY = 'ur_push_native_token';
export const NATIVE_PUSH_CHANNEL_ID = 'urtruck_messages_v2';
// P0-1 (аудит push-безопасности): технический идентификатор устройства —
// НЕ секрет, НЕ user_id, НЕ сам push-токен. Генерируется один раз и живёт
// в storage постоянно (переживает logout/login — это "глобальная" настройка
// устройства, а не пользователя, см. Блок 2 п.5 плана исправлений). Backend
// использует его, чтобы отличить «тот же физический телефон сменил
// пользователя» (легитимно) от «кто-то узнал чужой токен» (блокируется).
const DEVICE_ID_KEY = 'ur_device_id';

function _uuidv4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch {}
  }
  // device_id не секрет — Math.random-фоллбэк достаточен там, где
  // crypto.randomUUID недоступен (старые WebView/RN JS-движки).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getOrCreateDeviceId() {
  let id = await storage.get(DEVICE_ID_KEY);
  if (!id) {
    id = _uuidv4();
    await storage.set(DEVICE_ID_KEY, id);
  }
  return id;
}

function _maskToken(tok) {
  if (!tok) return '';
  return tok.length <= 8 ? `${tok.slice(0, 2)}...` : `${tok.slice(0, 4)}...${tok.slice(-4)}`;
}

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

  async subscribe(options = {}) {
    if (!this.isSupported()) return { ok: false, reason: 'unsupported' };

    // 1. Permission. Browser permission requests are user-gesture sensitive.
    // App bootstrap must never call requestPermission() automatically: Huawei/
    // Chromium-class browsers can ignore/block that prompt and the driver then
    // never gets a bound web subscription. The explicit UI CTA passes
    // requestPermission:true; background repair only re-binds granted access.
    const requestPermission = options?.requestPermission === true;
    let perm = Notification.permission;
    if (perm === 'default' && !requestPermission) {
      return { ok: false, reason: 'permission_required' };
    }
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
    const deviceId = await getOrCreateDeviceId();
    const resp = await fetch(`${BASE}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: sub.toJSON().keys,
        user_agent: navigator.userAgent,
        device_id: deviceId,
        platform: 'web',
      }),
    }).then((r) => (r.status === 409 ? { conflict: true } : r.json())).catch(() => ({}));
    // P0-1: чужой endpoint (409 TOKEN_OWNERSHIP_CONFLICT) — не наш случай в
    // норме (endpoint уникален по подписке браузера), но на всякий случай
    // не считаем успехом и не повторяем бесконечно молча.
    if (resp && resp.conflict) {
      return { ok: false, reason: 'token_conflict', mock };
    }
    // P1-2 fix: если пользователь залогинен (есть token), но подписка не
    // привязалась к user_id (токен протух на момент подписки) — адресный
    // web-push не дойдёт. Не считаем успехом → повторим при след. запуске
    // (симметрично native-пути с 'not_linked').
    if (token && resp && !resp.user_id) {
      return { ok: false, reason: 'not_linked', mock };
    }
    return { ok: true, mock };
  },

  async unsubscribe() {
    // P0-1 fix: раньше эти два запроса шли БЕЗ Authorization — backend не
    // мог проверить владельца (owner-check в /unsubscribe и
    // /unregister-native завязан на текущего вызывающего). Без заголовка
    // owner-check тихо пропускался. Теперь шлём тот же Bearer, что и при
    // подписке — обычный logout продолжает деактивировать СВОИ записи как
    // раньше, а не чужие.
    const authToken = await storage.get(TOKEN_KEY);
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': authToken ? `Bearer ${authToken}` : '',
    };
    if (this.isSupported()) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${BASE}/unsubscribe`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ endpoint: sub.endpoint, reason: 'user_unsubscribed' }),
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
          headers: authHeaders,
          body: JSON.stringify({ token: existing, reason: 'user_unregistered' }),
        });
        await storage.remove(NATIVE_TOKEN_KEY);
      }
    } catch {}
  },

  /** P1-3/P1-4 (Блок 2): деактивировать push ТЕКУЩЕГО пользователя на
   * этом устройстве при logout — сервер помечает push_subscriptions/
   * push_tokens_native неактивными по user_id+device_id, чтобы push,
   * адресованный уже вышедшему пользователю, больше не доставлялся на
   * этот телефон, даже если следующий пользователь ещё не залогинился
   * (окно между logout и login на общем устройстве). Best-effort — сетевая
   * ошибка не должна блокировать сам logout.
   */
  async logoutCleanup(token = null) {
    try {
      const authToken = token || await storage.get(TOKEN_KEY);
      if (!authToken) return { ok: false, reason: 'no_token' };
      const deviceId = await getOrCreateDeviceId();
      const resp = await fetch(`${BASE}/logout-cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ device_id: deviceId }),
      });
      return resp.ok ? await resp.json() : { ok: false, status: resp.status };
    } catch (e) {
      return { ok: false, reason: 'network_error', error: String(e) };
    }
  },

  getOrCreateDeviceId,

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

    // Handler: показываем notification в foreground, КРОМЕ chat-push о той
    // комнате, которую пользователь сейчас читает (QA-аудит P2-2: иначе
    // баннер дублирует уже видимое сообщение). Тип/room_id приходят в
    // data из backend (kind='chat', data.type='chat_message', room_id).
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        try {
          const data = notification?.request?.content?.data || {};
          if ((data.type === 'chat_message' || data.type === 'chat_attachment') && data.room_id && data.room_id === getActiveRoom()) {
            // SDK 52: shouldShowAlert устарел → дублируем shouldShowBanner/
            // shouldShowList, иначе баннер не подавляется. shouldSetBadge
            // false — сообщение читается прямо сейчас.
            return {
              shouldShowAlert: false, shouldShowBanner: false, shouldShowList: false,
              shouldPlaySound: false, shouldSetBadge: false,
            };
          }
        } catch {}
        return {
          shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true,
          shouldPlaySound: true, shouldSetBadge: true,
        };
      },
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
      await Notifications.setNotificationChannelAsync(NATIVE_PUSH_CHANNEL_ID, {
        name: 'UrTruck сообщения',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#378ADD',
      });
    }

    // Expo Push Token
    // PR-C2 (P0-1 push permissions): на Expo SDK 49+ getExpoPushTokenAsync
    // требует `projectId` иначе на iOS возвращает пустой токен / падает.
    // projectId живёт в app.json:expo.extra.eas.projectId; читаем через
    // expo-constants. Если константы нет — fallback на старый zero-arg
    // вызов (web/legacy).
    let projectId;
    let appVersion = null;
    try {
      const Constants = require('expo-constants').default;
      projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId ||
        Constants?.manifest?.extra?.eas?.projectId ||
        null;
      appVersion = Constants?.expoConfig?.version || Constants?.manifest?.version || null;
    } catch { projectId = null; }
    // issue #5: dev-only debug logging для проверки регистрации токена на
    // реальном устройстве/dev-билде (в проде молчим).
    const dbg = (...a) => { if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[push]', ...a); };
    dbg('projectId', projectId || '(none)');
    let tokenData;
    try {
      tokenData = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
    } catch (e) {
      dbg('getExpoPushTokenAsync failed', String(e));
      return { ok: false, reason: 'token_failed', error: String(e) };
    }
    const token = tokenData?.data;
    if (!token) { dbg('no token returned'); return { ok: false, reason: 'no_token' }; }
    dbg('expo token', _maskToken(token)); // P0-1: полный токен в логи не пишем даже в dev

    // Отправляем на бэк. issue #5: проверяем ответ — раньше статус
    // игнорировался и при 401/500 функция всё равно возвращала ok:true,
    // хотя токен на сервере не сохранялся (push не доходил).
    const authToken = await storage.get(TOKEN_KEY);
    const deviceId = await getOrCreateDeviceId();
    let regStatus = 0;
    let regUserId;
    try {
      const resp = await fetch(`${BASE}/register-native`, {
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
          device_id: deviceId,
          app_version: appVersion,
        }),
      });
      regStatus = resp.status;
      try { const j = await resp.json(); regUserId = j?.user_id; } catch {}
      dbg('register-native →', regStatus, 'user_id=', regUserId);
    } catch (e) {
      dbg('register-native network error', String(e));
      return { ok: false, reason: 'register_failed', token, error: String(e) };
    }
    if (regStatus === 409) {
      // P0-1: TOKEN_OWNERSHIP_CONFLICT — этот физический токен уже активно
      // привязан к другому пользователю на другом устройстве (не должно
      // случаться в норме на одном юзере/девайсе; для старых клиентов без
      // device_id это единственный сигнал — не считаем успехом).
      return { ok: false, reason: 'token_conflict', token, status: regStatus };
    }
    if (regStatus < 200 || regStatus >= 300) {
      return { ok: false, reason: 'register_rejected', token, status: regStatus };
    }
    // BUG-004: слали auth-токен, но сервер не привязал (user_id=null → протухший
    // токен) → токен «висит» без владельца, push не дойдёт, а раньше клиент
    // рапортовал ok и кэшировал → автозапуск не перезапускал регистрацию.
    // Не кэшируем как успех, чтобы следующий старт повторил линковку.
    if (authToken && !regUserId) {
      return { ok: false, reason: 'not_linked', token, status: regStatus };
    }
    await storage.set(NATIVE_TOKEN_KEY, token);
    return { ok: true, token, user_id: regUserId };
  },

  // ── Единый автозапуск: web.subscribe() если PWA, иначе registerNative() ──
  async autoRegister() {
    if (this.isSupported()) return this.subscribe({ requestPermission: false });
    if (this.isNative()) return this.registerNative();
    return { ok: false, reason: 'unsupported' };
  },
};
