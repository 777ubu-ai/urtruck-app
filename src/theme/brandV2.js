// brandV2 — design tokens для inDrive-style onboarding/auth flow.
//
// Расширяет designSystemV2 точечными значениями, которые нужны новым
// экранам (OnboardingV2 / CountryPickerSheet / PhoneV2). Старые экраны
// (designV1, dark theme) живут отдельно — этот файл их не трогает.
//
// Owner ТЗ от 2026-05-13: белый фон, тёмный зелёно-графитовый текст (redesign 08.08.2026: slate-нейтрали заменены на зелёно-серые ТЗ), оранжевый акцент
// в логотипе, GREEN primary CTA (как в inDrive — зелёная кнопка
// "Продолжить"). Outline secondary CTA — navy border + navy text.

export const brand = {
  // Backgrounds
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F4F2',
  surfaceSoft: '#F6F8F7',

  // Text
  textPrimary: '#14221C',   // navy — заголовки, основной текст
  textSecondary: '#617067', // подзаголовки, hints
  textTertiary: '#9AA8A0',  // placeholder, disabled
  textOnPrimary: '#FFFFFF', // на зелёной/оранжевой кнопке

  // Brand
  logoDark: '#14221C',  // "Ur" в логотипе
  logoAccent: '#FF8400', // "Truck" в логотипе

  // Primary CTA (зелёная кнопка "Продолжить")
  primary: '#168A5B',
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
  success: '#168A5B',
  warning: '#FF8400',
  error: '#EF4444',
  info: '#3478D4',

  // Map/illustration assist
  mapGray: '#E5E7EB',
  routeOrange: '#FF8400',
  routeGreen: '#168A5B',
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

export default { brand, radius, space, typography };
