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

const isWeb = Platform.OS === 'web';
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

// Ключи, которые считаем чувствительными и держим в SecureStore на mobile.
// Значения — короткие строки (токен ~43 символа), в лимит SecureStore (2 КБ)
// укладываются с запасом.
const SECURE_KEYS = new Set(['ur_reg_token']);

// expo-secure-store входит в Expo Go и линкуется EAS из package.json. На web /
// в окружении без модуля require бросит — тогда nativeSecure остаётся null и
// работает обычный AsyncStorage-путь.
let SecureStore = null;
if (isNative) {
  try { SecureStore = require('expo-secure-store'); } catch { SecureStore = null; }
}
const secureReady = () => !!(SecureStore && typeof SecureStore.getItemAsync === 'function');
const useSecure = (key) => isNative && SECURE_KEYS.has(key) && secureReady();

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
    try {
      if (useSecure(key)) {
        try {
          const v = await SecureStore.getItemAsync(key);
          if (v != null) return v;
          // Одноразовая миграция старого токена из AsyncStorage → SecureStore,
          // чтобы уже вошедшие пользователи не разлогинились после обновления.
          const legacy = await AsyncStorage.getItem(key);
          if (legacy != null) {
            try { await SecureStore.setItemAsync(key, legacy); } catch {}
            try { await AsyncStorage.removeItem(key); } catch {}
            return legacy;
          }
          return null;
        } catch {
          return await baseGet(key);  // SecureStore сбойнул → откат
        }
      }
      return await baseGet(key);
    } catch { return null; }
  },
  async set(key, value) {
    try {
      if (useSecure(key)) {
        try { await SecureStore.setItemAsync(key, value); return; }
        catch { return await baseSet(key, value); }
      }
      await baseSet(key, value);
    } catch {}
  },
  async remove(key) {
    try {
      if (useSecure(key)) {
        try { await SecureStore.deleteItemAsync(key); } catch {}
        // На всякий случай чистим и legacy-копию в AsyncStorage.
        try { await AsyncStorage.removeItem(key); } catch {}
        return;
      }
      await baseRemove(key);
    } catch {}
  },
};
