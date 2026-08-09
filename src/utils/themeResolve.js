// Чистая функция разрешения темы UrTruck — без React/JSX, чтобы её можно
// было юнит-тестировать напрямую в node (tests/unit/themeResolve.test.mjs).
//
// Ручной выбор ('light'/'dark') ВСЕГДА имеет приоритет над системной темой;
// 'system' (и legacy 'auto'/undefined) следуют за prefers-color-scheme/Appearance.
export function resolveTheme(themeMode, systemDark) {
  if (themeMode === 'dark') return 'dark';
  if (themeMode === 'light') return 'light';
  return systemDark ? 'dark' : 'light';
}
