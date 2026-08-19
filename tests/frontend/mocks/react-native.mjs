// Минимальный мок react-native для запуска "чистой логики" утилит
// (src/utils/outbox.js, storage.js и т.п.) под обычным Node — БЕЗ Metro/
// Expo рантайма. Реальный react-native не парсится plain Node (Flow/JSX),
// поэтому для узкого набора frontend-тестов (Блок 8 аудита) специфику
// платформы подменяем здесь. Никакие исходники проекта не модифицируются —
// подмена происходит только через resolve-hook в ../loader.mjs.
// OS='android' (не 'web'): storage.js под Platform.OS==='web' пишет в
// window.localStorage, которого в plain Node нет (тихо no-op — ничего не
// падает, но ничего и не сохраняется). Заявляем себя native-платформой,
// чтобы storage.js использовал AsyncStorage-путь → уходит в наш мок
// (mocks/async-storage.mjs), который реально хранит данные in-memory.
export const Platform = { OS: 'android', select: (obj) => obj[Platform.OS] ?? obj.native ?? obj.default };

let openSettingsCalls = 0;
export const Linking = {
  openSettings: async () => { openSettingsCalls += 1; },
  __getOpenSettingsCalls: () => openSettingsCalls,
  __resetOpenSettingsCalls: () => { openSettingsCalls = 0; },
};

export default { Platform, Linking };
