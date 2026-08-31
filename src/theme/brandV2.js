// brandV2 — design tokens для inDrive-style onboarding/auth flow.
//
// Расширяет designSystemV2 точечными значениями, которые нужны новым
// экранам (OnboardingV2 / CountryPickerSheet / PhoneV2). Старые экраны
// (designV1, dark theme) живут отдельно — этот файл их не трогает.
//
// Owner ТЗ от 2026-05-13: белый фон, тёмный зелёно-графитовый текст (redesign 08.08.2026: slate-нейтрали заменены на зелёно-серые ТЗ), оранжевый акцент
// в логотипе, GREEN primary CTA (как в inDrive — зелёная кнопка
// "Продолжить"). Outline secondary CTA — navy border + navy text.

const brandLight = {
  // Backgrounds
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F4F2',
  surfaceSoft: '#F6F8F7',

  // Text
  textPrimary: '#14221C',   // navy — заголовки, основной текст
  textSecondary: '#617067', // подзаголовки, hints
  textTertiary: '#6B7A71',  // placeholder, disabled
  textOnPrimary: '#FFFFFF', // на зелёной/оранжевой кнопке

  // Brand
  logoDark: '#14221C',  // "Ur" в логотипе
  logoAccent: '#FF8400', // "Truck" в логотипе

  // Primary CTA (зелёная кнопка "Продолжить")
  primary: '#168759',
  primaryHover: '#0F6B47',
  primarySoft: '#E8F6EF',

  // Accent (оранжевый — используется точечно для иконок/маркеров)
  accent: '#FF8400',
  accentHover: '#EA8A00',
  accentSoft: '#FEF3C7',

  // Borders / dividers
  border: '#E5ECE8',
  borderStrong: '#C8D8CF',
  divider: '#EEF3F0',

  // States
  success: '#168759',
  warning: '#FF8400',
  error: '#EF4444',
  info: '#3478D4',

  // Map/illustration assist
  mapGray: '#E5E7EB',
  routeOrange: '#FF8400',
  routeGreen: '#168759',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  hero: 48,
};

export const typography = {
  hero: { fontSize: 32, lineHeight: 38, fontWeight: '800' },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  bodyLarge: { fontSize: 17, lineHeight: 24, fontWeight: '500' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  bodySmall: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  button: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
};

// DARK-вариант brand-токенов (redesign 2026-08). Синхронизирован с DARK в
// designV1.js (единый канон тёмной темы). WCAG прогнан в scratchpad/dark2.js.
export const brandDark = {
  bg: '#0F1512',
  surface: '#151E19',
  surfaceMuted: '#202C25',
  surfaceSoft: '#1B2620',

  textPrimary: '#F3F7F4',
  textSecondary: '#B7C3BB',
  textTertiary: '#9EAAA2',
  textOnPrimary: '#FFFFFF',

  logoDark: '#F3F7F4',   // «Ur» на тёмном фоне — светлый
  logoAccent: '#FF9A3D',

  primary: '#168759',
  primaryHover: '#0F6B47',
  primarySoft: 'rgba(47,190,126,0.14)',

  accent: '#FF9A3D',
  accentHover: '#E06D00',
  accentSoft: 'rgba(255,154,61,0.16)',

  border: '#2A3930',
  borderStrong: '#3A4C41',
  divider: '#202C25',

  success: '#63D69A',
  warning: '#F5B75B',
  error: '#FF7B7B',
  info: '#5BA3F5',

  mapGray: '#2A3930',
  routeOrange: '#FF9A3D',
  routeGreen: '#63D69A',
};

// Модульный флаг текущей темы. Обновляется синхронно в useBrand() во время
// render экрана — ДО render дочерних компонентов, поэтому Proxy ниже отдаёт
// правильные значения и во вложенных helper-компонентах.
let _isDark = false;

// Theme-aware hook — возвращает КОНКРЕТНЫЙ набор токенов (для makeStyles) и
// побочно фиксирует _isDark для Proxy. Ленивый require ThemeContext, чтобы
// избежать циклической зависимости на уровне модуля.
export const useBrand = () => {
  // eslint-disable-next-line global-require
  const { useTheme } = require('../utils/ThemeContext');
  const { isDark } = useTheme();
  _isDark = isDark;
  return isDark ? brandDark : brandLight;
};

// Theme-reactive Proxy: любой `brand.xxx` (inline JSX, helper-компоненты)
// резолвится в текущую палитру на момент доступа (в render). Статические
// module-level StyleSheet.create БЛОКИ так не оживают — их обязательно
// оборачивать в makeStyles(brand) и вызывать с useBrand() в render.
export const brand = new Proxy({}, {
  get: (_t, prop) => (_isDark ? brandDark : brandLight)[prop],
});

export { brandLight };
export default { brand, brandLight, brandDark, useBrand, radius, space, typography };
