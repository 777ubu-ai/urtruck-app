import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance, Platform } from 'react-native';
import { darkTheme, lightTheme } from './theme';
import { storage } from './storage';

// Exported (not just useTheme()) so class components — which cannot call
// hooks — can subscribe via `static contextType = ThemeContext` (see
// ErrorBoundary.js, the one legitimate class-component consumer).
export const ThemeContext = createContext({
  theme: lightTheme,
  isDark: false,
  themeMode: 'auto',  // 'auto' | 'light' | 'dark'
  setThemeMode: () => {},
  toggleTheme: () => {},
});

const KEY = 'ur_theme';

function detectSystemDark() {
  try {
    const sys = Appearance.getColorScheme();
    return sys === 'dark';
  } catch {
    return false;
  }
}

function initialThemeMode() {
  // Web localStorage is synchronous: read it before first render to avoid a
  // light-theme flash when the user explicitly selected dark mode earlier.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
    } catch {}
  }
  return 'auto';
}

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeModeState] = useState(initialThemeMode);
  const [systemDark, setSystemDark] = useState(detectSystemDark());

  useEffect(() => {
    let mounted = true;
    (async () => {
      const saved = await storage.get(KEY);
      if (mounted && (saved === 'light' || saved === 'dark' || saved === 'auto')) {
        setThemeModeState(saved);
      }
    })();

    const sub = Appearance.addChangeListener?.(({ colorScheme }) => {
      setSystemDark(colorScheme === 'dark');
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  const setThemeMode = (mode) => {
    if (mode !== 'light' && mode !== 'dark' && mode !== 'auto') return;
    setThemeModeState(mode);
    storage.set(KEY, mode);
  };

  // The redesign keeps LIGHT as the default visual language, but the user's
  // explicit theme choice must work. Manual light/dark wins over the OS;
  // system changes are followed only while themeMode === 'auto'.
  const isDark = themeMode === 'dark' || (themeMode === 'auto' && systemDark);

  const toggleTheme = () => setThemeMode(isDark ? 'light' : 'dark');

  // Keep the web/PWA shell in sync with the resolved theme as well, so Safari
  // and installed PWAs do not retain a light browser chrome around dark UI.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const resolved = isDark ? 'dark' : 'light';
    const root = document.documentElement;
    root?.setAttribute?.('data-theme', resolved);
    if (root?.style) root.style.colorScheme = resolved;

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta && document.head) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta?.setAttribute('content', isDark ? darkTheme.bg : lightTheme.bg);
  }, [isDark]);

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
