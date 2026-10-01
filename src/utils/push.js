// Push клиент — Web Push (PWA/браузер) + native FCM/APNs через expo-notifications.
import { Linking, Platform } from 'react-native';
import { storage } from './storage';
import { API_BASE } from '../config/env';
import { getActiveRoom } from './activeRoom';  // QA-аудит P2-2
import { t as tGlobal } from './i18n';
import { claimPushEvent, clearPushEventDedup } from './pushEventDedup';
import { decideForegroundPresentation } from './pushRuntime';

const BASE = `${API_BASE}/push`;

const TOKEN_KEY = 'ur_reg_token';
const PUSH_ASKED = 'ur_push_asked';
const NATIVE_TOKEN_KEY = 'ur_push_native_token';
// Push-closure track: same key src/utils/i18n.js persists the user's chosen
// app language under (`const KEY = 'ur_lang'`). Read-only here — never
// written — so backend system push text (services/push_i18n.py) can be
// localized to the recipient without a second, independent language store.
const LANG_KEY = 'ur_lang';
export const NATIVE_PUSH_CHANNEL_ID = 'urtruck_messages_v2';
// P0-1 (аудит push-безопасности): технический идентификатор устройства —
// НЕ секрет, НЕ user_id, НЕ сам push-токен. Генерируется один раз и живёт
// в storage постоянно (переживает logout/login — это "глобальная" настройка
// устройства, а не пользователя, см. Блок 2 п.5 плана исправлений). Backend
// использует его, чтобы отличить «тот же физический телефон сменил
// пользователя» (легитимно) от «кто-то узнал чужой токен» (блокируется).
const DEVICE_ID_KEY = 'ur_device_id';

// Expo вызывает этот listener при ротации нативного FCM/APNs token. Binding
// хранится один раз на процесс: повторный app-active/login не должен
// множить callbacks и регистрацию одного токена.
let nativeTokenListenerBound = false;
// Android may deliver several token-change callbacks in the same event-loop
// turn (notably while the notification bridge is restoring after process
// recreation).  Registration is an idempotent *network write*, but without
// coalescing each callback opened another OkHttp request and could starve the
// authenticated marketplace traffic on the same device.
let nativeRegistrationInFlight = null;

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

  async nativePermission() {
    if (!this.isNative()) return 'unsupported';
    try {
      const Notifications = require('expo-notifications');
      return (await Notifications.getPermissionsAsync()).status || 'undetermined';
    } catch {
      return 'unsupported';
    }
  },

  async openNativeNotificationSettings() {
    if (!this.isNative() || typeof Linking?.openSettings !== 'function') return false;
    try {
      await Linking.openSettings();
      return true;
    } catch {
      return false;
    }
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
    // Native: удаляем старую привязку устройства с backend
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
      const result = resp.ok ? await resp.json() : { ok: false, status: resp.status };
      if (result.ok) await clearPushEventDedup();
      return result;
    } catch (e) {
      return { ok: false, reason: 'network_error', error: String(e) };
    }
  },

  getOrCreateDeviceId,

  // Provider success is not device receipt. This best-effort acknowledgement
  // creates diagnostic evidence only; failures never affect chat delivery,
  // notification presentation, or retry ownership on the server.
  async acknowledgeReceipt(eventId, { opened = false } = {}) {
    if (!this.isNative() || typeof eventId !== 'string' || !eventId.trim()) {
      return { ok: false, reason: 'invalid_receipt' };
    }
    try {
      const token = await storage.get(TOKEN_KEY);
      if (!token) return { ok: false, reason: 'no_token' };
      const deviceId = await getOrCreateDeviceId();
      const response = await fetch(`${BASE}/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ event_id: eventId.trim(), device_id: deviceId, opened: !!opened, platform: Platform.OS }),
      });
      return { ok: response.ok, status: response.status };
    } catch {
      return { ok: false, reason: 'network_error' };
    }
  },

  // ── Native token bridge (expo-notifications permissions/listeners only) ──
  isNative() {
    return Platform.OS === 'ios' || Platform.OS === 'android';
  },

  async registerNative() {
    // Keep one registration flight per JS runtime.  Callers still receive the
    // same result, while a token-listener burst cannot turn into a request
    // storm or monopolise the mobile HTTP dispatcher.
    if (nativeRegistrationInFlight) return nativeRegistrationInFlight;
    const flight = this._registerNativeOnce();
    nativeRegistrationInFlight = flight;
    try {
      return await flight;
    } finally {
      if (nativeRegistrationInFlight === flight) nativeRegistrationInFlight = null;
    }
  },

  async _registerNativeOnce() {
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
          return await decideForegroundPresentation({
            data,
            activeRoom: getActiveRoom(),
            acknowledge: (eventId, options) => this.acknowledgeReceipt(eventId, options),
            claimDisplay: (eventId) => claimPushEvent(eventId, 'display'),
          });
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
    // §15 i18n P2 fix: this name is user-visible (Android Settings → Apps
    // → UrTruck → Notifications → channel list) and was hardcoded RU
    // regardless of the app's language. `push_channel_name` exists in all
    // 4 locales; tGlobal() reflects whatever language the user has already
    // picked by the time this runs (after permission grant, post-onboarding).
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(NATIVE_PUSH_CHANNEL_ID, {
        name: tGlobal('push_channel_name'),
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#378ADD',
      });
    }

    // Read only app version metadata; project identifiers are unrelated to
    // native FCM/APNs delivery and are intentionally not consulted here.
    let appVersion = null;
    try {
      const Constants = require('expo-constants').default;
      appVersion = Constants?.expoConfig?.version || Constants?.manifest?.version || null;
    } catch {}
    // issue #5: dev-only debug logging для проверки регистрации токена на
    // реальном устройстве/dev-билде (в проде молчим).
    const dbg = (...a) => { if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[push]', ...a); };
    // The only native registration below is a platform token from the
    // notification SDK; it is sent directly to UrTruck's native registry.
    const authToken = await storage.get(TOKEN_KEY);
    const deviceId = await getOrCreateDeviceId();
    const locale = await storage.get(LANG_KEY);

    const registerToken = async ({ pushToken, provider }) => {
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
            token: pushToken,
            provider,
            platform: Platform.OS,
            device_name: Device.modelName || Device.deviceName || null,
            device_id: deviceId,
            app_version: appVersion,
            locale: locale || null,
          }),
        });
        regStatus = resp.status;
        try { const j = await resp.json(); regUserId = j?.user_id; } catch {}
        dbg('register-native', provider, '→', regStatus, 'user_id=', regUserId);
      } catch (e) {
        dbg('register-native network error', provider, String(e));
        return { ok: false, reason: 'register_failed', token: pushToken, provider, error: String(e) };
      }
      if (regStatus === 409) {
        // P0-1: TOKEN_OWNERSHIP_CONFLICT — этот физический токен уже активно
        // привязан к другому пользователю на другом устройстве (не должно
        // случаться в норме на одном юзере/девайсе; для старых клиентов без
        // device_id это единственный сигнал — не считаем успехом).
        return { ok: false, reason: 'token_conflict', token: pushToken, provider, status: regStatus };
      }
      if (regStatus < 200 || regStatus >= 300) {
        return { ok: false, reason: 'register_rejected', token: pushToken, provider, status: regStatus };
      }
      // BUG-004: слали auth-токен, но сервер не привязал (user_id=null → протухший
      // токен) → токен «висит» без владельца, push не дойдёт, а раньше клиент
      // рапортовал ok и кэшировал → автозапуск не перезапускал регистрацию.
      // Не кэшируем как успех, чтобы следующий старт повторил линковку.
      if (authToken && !regUserId) {
        return { ok: false, reason: 'not_linked', token: pushToken, provider, status: regStatus };
      }
      return { ok: true, token: pushToken, provider, user_id: regUserId };
    };

    // Token may rotate without a login (restore, OS/provider maintenance).
    // Re-enter registerNative so each callback obtains fresh auth, locale and
    // installation metadata rather than reusing this invocation's snapshot.
    if (!nativeTokenListenerBound && typeof Notifications.addPushTokenListener === 'function') {
      nativeTokenListenerBound = true;
      Notifications.addPushTokenListener(() => {
        this.registerNative().catch(() => {});
      });
    }

    let nativeResult = null;
    try {
      let nativeTokenData = null;
      try {
        nativeTokenData = await Notifications.getDevicePushTokenAsync();
      } catch (e) {
        dbg('getDevicePushTokenAsync failed', String(e));
      }
      const nativeToken = nativeTokenData?.data;
      if (nativeToken) {
        dbg('native token', nativeTokenData?.type, _maskToken(nativeToken)); // P0-1: не логируем токен целиком
        const nativeProvider = Platform.OS === 'android' ? 'fcm' : 'apns';
        nativeResult = await registerToken({ pushToken: nativeToken, provider: nativeProvider });
        if (nativeResult.ok) await storage.set(NATIVE_TOKEN_KEY, nativeToken);
      }
    } catch (e) {
      dbg('native registration block failed', String(e));
    }

    if (nativeResult?.ok) {
      return {
        ok: true,
        token: nativeResult.token,
        user_id: nativeResult.user_id,
        native_token: nativeResult.token,
        native_provider: nativeResult.provider,
      };
    }
    return nativeResult || { ok: false, reason: 'no_native_token' };
  },

  // ── Единый автозапуск: web.subscribe() если PWA, иначе registerNative() ──
  async autoRegister() {
    if (this.isSupported()) return this.subscribe({ requestPermission: false });
    if (this.isNative()) return this.registerNative();
    return { ok: false, reason: 'unsupported' };
  },
};
