// Native SecureStore substitute for plain-Node frontend tests. It is loaded
// before test modules; production code still requires Expo SecureStore.
import AsyncStorage from '@react-native-async-storage/async-storage';

const previousRequire = globalThis.require;
globalThis.require = (specifier) => {
  if (specifier === 'expo-secure-store') {
    return {
      getItemAsync: (key) => AsyncStorage.getItem(`__secure__:${key}`),
      setItemAsync: (key, value) => AsyncStorage.setItem(`__secure__:${key}`, value),
      deleteItemAsync: (key) => AsyncStorage.removeItem(`__secure__:${key}`),
    };
  }
  if (typeof previousRequire === 'function') return previousRequire(specifier);
  throw new Error(`Unmocked native module: ${specifier}`);
};
