// Универсальный storage: AsyncStorage для mobile, localStorage для web
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const isWeb = Platform.OS === 'web';

export const storage = {
  async get(key) {
    try {
      if (isWeb) return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      return await AsyncStorage.getItem(key);
    } catch { return null; }
  },
  async set(key, value) {
    try {
      if (isWeb) { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); return; }
      await AsyncStorage.setItem(key, value);
    } catch {}
  },
  async remove(key) {
    try {
      if (isWeb) { if (typeof window !== 'undefined') window.localStorage.removeItem(key); return; }
      await AsyncStorage.removeItem(key);
    } catch {}
  },
};
