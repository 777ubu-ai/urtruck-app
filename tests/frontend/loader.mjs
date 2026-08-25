// Node ESM resolve-hook: подменяет react-native / AsyncStorage на лёгкие
// моки (mocks/*.mjs), чтобы src/utils/*.js (чистая логика — outbox.js,
// storage.js) можно было импортировать и тестировать напрямую под plain
// Node, без Metro/Expo/Jest. Используется ТОЛЬКО тестовыми скриптами в
// tests/frontend/ — исходники проекта не модифицируются и не собираются
// иначе. Не трогает существующую (отсутствующую) test-инфраструктуру.
//
// Запуск: node --experimental-loader ./tests/frontend/loader.mjs <test>.mjs
import { fileURLToPath } from 'node:url';

const MOCKS = {
  'react-native': new URL('./mocks/react-native.mjs', import.meta.url).href,
  '@react-native-async-storage/async-storage': new URL('./mocks/async-storage.mjs', import.meta.url).href,
  'expo-constants': new URL('./mocks/expo-constants.mjs', import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) {
    return { url: MOCKS[specifier], shortCircuit: true };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    // Проект пишет relative-импорты без расширения (`./storage`) — так
    // резолвит Metro/babel, но НЕ строгий ESM-резолвер Node. Ретраим с
    // явным `.js`, если это похоже на такой случай.
    if (e && e.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw e;
  }
}

// no-op — экспортируется, т.к. некоторые версии Node ожидают load() рядом
// с resolve() в одном hooks-модуле; делегируем реализации по умолчанию.
export async function load(url, context, nextLoad) {
  return nextLoad(url, context);
}

void fileURLToPath; // избегаем unused-import предупреждения линтера, если он появится
