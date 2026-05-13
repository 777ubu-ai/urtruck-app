// brandV2 — design tokens для inDrive-style onboarding/auth flow.
//
// Расширяет designSystemV2 точечными значениями, которые нужны новым
// экранам (OnboardingV2 / CountryPickerSheet / PhoneV2). Старые экраны
// (designV1, dark theme) живут отдельно — этот файл их не трогает.
//
// Owner ТЗ от 2026-05-13: белый фон, navy текст, оранжевый акцент
// в логотипе, GREEN primary CTA (как в inDrive — зелёная кнопка
// "Продолжить"). Outline secondary CTA — navy border + navy text.

export const brand = {
  // Backgrounds
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F6FA',
  surfaceSoft: '#F8FAFC',

  // Text
  textPrimary: '#0F172A',   // navy — заголовки, основной текст
  textSecondary: '#64748B', // подзаголовки, hints
  textTertiary: '#94A3B8',  // placeholder, disabled
  textOnPrimary: '#FFFFFF', // на зелёной/оранжевой кнопке

  // Brand
  logoDark: '#0F172A',  // "Ur" в логотипе
  logoAccent: '#F59E0B', // "Truck" в логотипе

  // Primary CTA (зелёная кнопка "Продолжить")
  primary: '#16A34A',
  primaryHover: '#15803D',
  primarySoft: '#DCFCE7',

  // Accent (оранжевый — используется точечно для иконок/маркеров)
  accent: '#F59E0B',
  accentHover: '#EA8A00',
  accentSoft: '#FEF3C7',

  // Borders / dividers
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  divider: '#F1F5F9',

  // States
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Map/illustration assist
  mapGray: '#E5E7EB',
  routeOrange: '#F59E0B',
  routeGreen: '#16A34A',
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
