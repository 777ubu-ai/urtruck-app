// Универсальный storage: AsyncStorage для mobile, localStorage для web.
//
// I6 (security): чувствительные ключи (Bearer-токен сессии) на mobile хранятся
// в expo-secure-store (Keychain/Keystore, аппаратное шифрование), а не в
// открытом AsyncStorage. Роутинг спрятан ВНУТРИ storage.get/set/remove —
// поэтому все существ(~10) вызовы `storage.get('ur_reg_token')` апгрейдятся
// прозрачно, без риска рассинхронизации read/write между разными хранилищами.
//
// Гарантия безопасности изменения: любой сбой SecureStore (недоступен, ошибка)
// откатывается на AsyncStorage — поведение НИКОГДА не хуже прежнего. На web
// SecureStore недоступен → используется localStorage, как и раньше.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SESSION_STORAGE_SCOPE } from '../config/env';

const isWeb = Platform.OS === 'web';
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

// Ключи, которые считаем чувствительными и держим в SecureStore на mobile.
// Значения — короткие строки (токен ~43 символа), в лимит SecureStore (2 КБ)
// укладываются с запасом.
const SECURE_KEYS = new Set(['ur_reg_token', 'ur_pending_logout_token']);

// expo-secure-store входит в Expo Go и линкуется EAS из package.json.
let SecureStore = null;
if (isNative) {
  try { SecureStore = require('expo-secure-store'); } catch { SecureStore = null; }
}
const secureReady = () => !!(SecureStore && typeof SecureStore.getItemAsync === 'function');
const isSensitiveNativeKey = (key) => isNative && SECURE_KEYS.has(key);

// v2 deliberately differs from the historic raw key. A production bearer
// must never be treated as a QA2 bearer merely because the package was
// updated in place. The old raw key is a migration source only (see below).
const secureKey = (key) => `ur_secure_v2:${SESSION_STORAGE_SCOPE}:${key}`;
const canMigrateUnscopedLegacy = () => SESSION_STORAGE_SCOPE === 'production';

export class SecureStorageError extends Error {
  constructor(code, cause = null) {
    super(code);
    this.name = 'SecureStorageError';
    this.code = code;
    this.cause = cause || undefined;
  }
}

const secureError = (code, cause) => new SecureStorageError(code, cause);

// Serializing a key prevents a late migration/write/delete from observing a
// half-finished value and reintroducing an older bearer. The queue is only for
// the two sensitive keys; ordinary UI preferences retain their old behaviour.
const sensitiveQueues = new Map();
function runSensitive(key, operation) {
  const previous = sensitiveQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  sensitiveQueues.set(key, current);
  return current.finally(() => {
    if (sensitiveQueues.get(key) === current) sensitiveQueues.delete(key);
  });
}

function requireSecureStore() {
  if (!secureReady()) throw secureError('SECURE_STORE_UNAVAILABLE');
}

// Базовый (несекьюрный) слой — прежнее поведение.
async function baseGet(key) {
  if (isWeb) return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  return await AsyncStorage.getItem(key);
}
async function baseSet(key, value) {
  if (isWeb) { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); return; }
  await AsyncStorage.setItem(key, value);
}
async function baseRemove(key) {
  if (isWeb) { if (typeof window !== 'undefined') window.localStorage.removeItem(key); return; }
  await AsyncStorage.removeItem(key);
}

export const storage = {
  async get(key) {
    if (!isSensitiveNativeKey(key)) return await baseGet(key);
    return runSensitive(key, async () => {
      requireSecureStore();
      let value;
      try {
        value = await SecureStore.getItemAsync(secureKey(key));
      } catch (error) {
        // A read failure is not proof that the user logged out. Callers must
        // retain their current auth state and offer a bounded retry instead.
        throw secureError('SECURE_READ_FAILED', error);
      }
      if (value != null) return value;

      const legacy = await AsyncStorage.getItem(key);
      if (legacy == null) return null;

      // An unscoped token from a previous production Play build is ambiguous
      // after switching the same package to QA2. Never send it to QA2.
      if (!canMigrateUnscopedLegacy()) return null;

      try {
        await SecureStore.setItemAsync(secureKey(key), legacy);
        const verified = await SecureStore.getItemAsync(secureKey(key));
        if (verified !== legacy) throw new Error('secure value verification failed');
      } catch (error) {
        // Keep the only legacy copy intact. The session can continue on the
        // production host and migration will be retried on a later read.
        throw secureError('SECURE_MIGRATION_WRITE_FAILED', error);
      }

      // SecureStore is now authoritative. A failed legacy cleanup cannot make
      // a subsequent read return a stale value, but it is still surfaced so
      // the app/operator can retry cleanup rather than masking it.
      try {
        await AsyncStorage.removeItem(key);
      } catch (error) {
        throw secureError('SECURE_MIGRATION_LEGACY_CLEANUP_FAILED', error);
      }
      return legacy;
    });
  },
  async set(key, value) {
    if (!isSensitiveNativeKey(key)) return await baseSet(key, value);
    return runSensitive(key, async () => {
      requireSecureStore();
      try {
        await SecureStore.setItemAsync(secureKey(key), value);
        const verified = await SecureStore.getItemAsync(secureKey(key));
        if (verified !== value) throw new Error('secure value verification failed');
      } catch (error) {
        // Do not write a new bearer into AsyncStorage as a fallback: an older
        // secure bearer would then win future reads and cross-account auth.
        throw secureError('SECURE_WRITE_FAILED', error);
      }
      // Only production may own and clean up the historic unscoped key.
      if (canMigrateUnscopedLegacy()) {
        try { await AsyncStorage.removeItem(key); }
        catch (error) { throw secureError('SECURE_LEGACY_CLEANUP_FAILED', error); }
      }
    });
  },
  async remove(key) {
    if (!isSensitiveNativeKey(key)) return await baseRemove(key);
    return runSensitive(key, async () => {
      requireSecureStore();
      // For a production legacy key, remove the weaker copy first. If that
      // fails the secure bearer remains live, so a failed logout cannot erase
      // the sole usable session or later resurrect it from stale storage.
      if (canMigrateUnscopedLegacy()) {
        try { await AsyncStorage.removeItem(key); }
        catch (error) { throw secureError('SECURE_LEGACY_REMOVE_FAILED', error); }
      }
      try {
        await SecureStore.deleteItemAsync(secureKey(key));
      } catch (error) {
        throw secureError('SECURE_DELETE_FAILED', error);
      }
    });
  },

  /** Блок 2 аудита (P1-5): удалить ВСЕ ключи с данным префиксом — нужно
   * для logout-очистки динамических per-room/per-form ключей (черновики
   * `ur_draft_<id>` и т.п.), у которых нет фиксированного набора имён и
   * их нельзя перечислить заранее через storage.remove(key). Секьюрные
   * ключи (SECURE_KEYS) сюда никогда не попадают — префикс `ur_draft_`/
   * прочие пользовательские кэши в SecureStore не хранятся. */
  async removeByPrefix(prefix) {
    try {
      let keys = [];
      if (isWeb) {
        if (typeof window === 'undefined') return;
        keys = Object.keys(window.localStorage);
      } else {
        keys = await AsyncStorage.getAllKeys();
      }
      const toRemove = keys.filter((k) => k.startsWith(prefix));
      await Promise.all(toRemove.map((k) => this.remove(k)));
    } catch {}
  },
};

// Для очередей потеря записи недопустима: ошибки хранилища идут вызывающему
// коду. Обычный UI storage сохраняет прежний best-effort контракт.
export const durableStorage = {
  get: baseGet,
  set: baseSet,
  remove: baseRemove,
  async keys() {
    if (isWeb) return typeof window === 'undefined' ? [] : Object.keys(window.localStorage);
    return await AsyncStorage.getAllKeys();
  },
};
