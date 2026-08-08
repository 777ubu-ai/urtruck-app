import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance } from 'react-native';
import { darkTheme, lightTheme } from './theme';
import { storage } from './storage';

const ThemeContext = createContext({
  theme: lightTheme,
  isDark: false,
  themeMode: 'auto',  // 'auto' | 'light' | 'dark'
  setThemeMode: () => {},
  toggleTheme: () => {},
});

const KEY = 'ur_theme';

// Детектит системную тему
function detectSystemDark() {
  try {
    const sys = Appearance.getColorScheme();
    return sys === 'dark';
  } catch {
    return false;
  }
}

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeModeState] = useState('auto');
  const [systemDark, setSystemDark] = useState(detectSystemDark());

  useEffect(() => {
    (async () => {
      const saved = await storage.get(KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'auto') {
        setThemeModeState(saved);
      }
    })();
    // Слушаем системные изменения
    const sub = Appearance.addChangeListener?.(({ colorScheme }) => {
      setSystemDark(colorScheme === 'dark');
    });
    return () => sub?.remove?.();
  }, []);

  const setThemeMode = (mode) => {
    setThemeModeState(mode);
    storage.set(KEY, mode);
  };

  // Redesign 08.08.2026 (owner spec): UrTruck переходит на ЕДИНУЮ светлую
  // B2B-тему (#F6F8F7 / зелёный #168A5B). Тёмная палитра и плитинг режима
  // сохранены для возможного отката, но эффективно приложение всегда светлое —
  // isDark зафиксирован в false, чтобы useV1Colors()/lightTheme отдавали
  // светлый зелёный на всех экранах. Чтобы вернуть переключатель тем, снять
  // форс ниже и вернуть вычисление из themeMode/systemDark.
  const isDark = false;
  // eslint-disable-next-line no-unused-vars
  const _isDarkFromMode = themeMode === 'dark' || (themeMode === 'auto' && systemDark);

  // Обратная совместимость
  const toggleTheme = () => setThemeMode(isDark ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{
      theme: isDark ? darkTheme : lightTheme,
      isDark, themeMode, setThemeMode, toggleTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
