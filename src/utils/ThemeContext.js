import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance, Platform } from 'react-native';
import { darkTheme, lightTheme } from './theme';
import { storage } from './storage';
import { resolveTheme } from './themeResolve';

// reconcile 01.09.2026 (§5): единственный резолвер темы — resolveTheme()
// (уже существовал, юнит-тестировался в tests/unit/themeResolve.test.mjs,
// но ThemeContext.js держал СВОЮ отдельную инлайн-копию той же логики,
// поэтому в проекте фактически жили два независимых резолвера. Теперь
// ThemeContext — единственный потребитель resolveTheme(), второго не
// создаём. Канонический themeMode — 'system' (совпадает с CLAUDE.md и
// UI-меткой «Система»); legacy 'auto' (старые установленные клиенты)
// принимается на чтении и нормализуется в 'system' — resolveTheme() и так
// трактует любое не-light/dark значение как «следовать системе», так что
// старый persisted 'auto' продолжает работать корректно даже без миграции.
const ThemeContext = createContext({
  theme: lightTheme,
  isDark: false,
  themeMode: 'system',  // 'system' | 'light' | 'dark'
  setThemeMode: () => {},
  toggleTheme: () => {},
});

const KEY = 'ur_theme';
const VALID_MODES = new Set(['light', 'dark', 'system', 'auto']);
const normalizeMode = (mode) => (mode === 'auto' ? 'system' : mode);

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
      if (VALID_MODES.has(saved)) return normalizeMode(saved);
    } catch {}
  }
  return 'system';
}

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeModeState] = useState(initialThemeMode);
  const [systemDark, setSystemDark] = useState(detectSystemDark());

  useEffect(() => {
    let mounted = true;
    (async () => {
      const saved = await storage.get(KEY);
      if (mounted && VALID_MODES.has(saved)) {
        setThemeModeState(normalizeMode(saved));
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
    if (!VALID_MODES.has(mode)) return;
    const normalized = normalizeMode(mode);
    setThemeModeState(normalized);
    storage.set(KEY, normalized);
  };

  // The redesign keeps LIGHT as the default visual language, but the user's
  // explicit theme choice must work. Manual light/dark wins over the OS;
  // system changes are followed only while themeMode === 'system'.
  // §5: единственный резолвер — resolveTheme() (themeResolve.js), больше не
  // дублируем эту же логику инлайн здесь.
  const isDark = resolveTheme(themeMode, systemDark) === 'dark';

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
