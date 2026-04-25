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

  const isDark = themeMode === 'dark' || (themeMode === 'auto' && systemDark);

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
