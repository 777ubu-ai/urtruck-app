// In-memory мок @react-native-async-storage/async-storage для frontend-
// тестов под plain Node (Блок 8 аудита). storage.js на Platform.OS==='web'
// на самом деле использует window.localStorage, не этот модуль — но
// storage.js статически импортирует AsyncStorage безусловно (для
// SecureStore-миграции и removeByPrefix-fallback), поэтому он должен
// резолвиться во что-то рабочее даже в web-режиме теста.
const mem = new Map();

export default {
  async getItem(key) { return mem.has(key) ? mem.get(key) : null; },
  async setItem(key, value) { mem.set(key, value); },
  async removeItem(key) { mem.delete(key); },
  async getAllKeys() { return Array.from(mem.keys()); },
  __reset() { mem.clear(); },
  __dump() { return Object.fromEntries(mem); },
};
