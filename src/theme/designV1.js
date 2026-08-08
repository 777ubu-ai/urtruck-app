// UrTruck Design v1 tokens — extracted from design/UrTruck_New_Design_v1/
// 12-screen reference (May 2026). This module is additive: it does NOT
// replace `theme.js` (existing screens still import from there).
//
// Stage 6 polish: the static `v1Colors` export stays for back-compat
// (a lot of legacy `StyleSheet.create()` blocks build colours into a
// frozen object at module load), but new code SHOULD pull tokens via
// `useV1Colors()` so they react to ThemeContext's isDark flag. The
// light variant matches `lightTheme` in src/utils/theme.js so v1 and
// v3 surfaces share the same light palette.

import { useTheme } from '../utils/ThemeContext';

const DARK = {
  bg: '#000000',
  bgDeep: '#050608',
  surface: '#0F1418',
  surfaceLift: '#141A20',
  surfaceMuted: '#1A2128',

  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',

  // PR-D1 (build 18): фирменный изумрудный неон вместо #22C55E.
  // Контраст #00E676 на белом — 1.34:1 (текст НЕ читается), поэтому
  // primary-кнопки рендерят текст в driverOnAccent = #0C0A09 — это
  // даёт 11.4:1 (WCAG AAA). На тёмном фоне акцент сияет.
  driver: '#00E676',
  driverDeep: '#00C766',
  driverGlow: 'rgba(0,230,118,0.45)',
  driverSoft: 'rgba(0,230,118,0.14)',
  driverOnAccent: '#0C0A09',

  cargoOwner: '#FF8400',
  cargoOwnerDeep: '#E06D00',
  cargoOwnerGlow: 'rgba(255,132,0,0.35)',
  cargoOwnerSoft: 'rgba(255,132,0,0.12)',

  text: '#F5F5F5',
  textMuted: '#9CA3AF',
  // Этап 5.1: было #5A6068 (2.92:1 на surface — провал WCAG даже для крупного).
  // Поднято до #8B92A0 (≈5.9:1) — теперь мелкие подписи читаются на солнце.
  textDim: '#8B92A0',
  // Stage 50: placeholder бампнут с #5A6068 → #8B92A0, чтобы хинты
  // полей читались на тёмном surface (#0F1418). Старое значение давало
  // ~3:1 контраст, ниже WCAG AA для нормального текста.
  placeholder: '#8B92A0',

  error: '#EF4444',
  success: '#22C55E',
  warning: '#FF8400',
};

const LIGHT = {
  // Light surfaces aligned with `lightTheme` in src/utils/theme.js so the
  // legacy v3 screens and the v1 onboarding surfaces share one light look.
  bg: '#F6F8F7',
  bgDeep: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceLift: '#F3FBF7',
  surfaceMuted: '#F0F4F2',

  border: '#E5ECE8',
  borderStrong: '#C8D8CF',

  // PR-D1 (build 18): на светлом фоне сам неон #00E676 нечитаем,
  // но мы используем его как fill кнопок/иконок, а текст поверх — чёрный
  // (driverOnAccent). Soft/glow подкручены, чтобы и на белой подложке
  // халогенный шлейф выглядел как зелёная подсветка, а не серая муть.
  driver: '#168A5B',
  driverDeep: '#0F6B47',
  driverGlow: 'rgba(22,138,91,0.18)',
  driverSoft: '#E8F6EF',
  driverOnAccent: '#FFFFFF',

  cargoOwner: '#168A5B',
  cargoOwnerDeep: '#0F6B47',
  cargoOwnerGlow: 'rgba(22,138,91,0.18)',
  cargoOwnerSoft: '#E8F6EF',

  text: '#14221C',
  textMuted: '#617067',
  textDim: '#7C8B82',
  placeholder: '#9AA8A0',

  error: '#D64545',
  success: '#168A5B',
  warning: '#F59E0B',
};

// Frozen dark export — keeps every existing `StyleSheet.create({ … })`
// snapshot compiling. New components should call `useV1Colors()`.
export const v1Colors = DARK;

// Theme-aware accessor — read in render to pick up theme toggles.
export const useV1Colors = () => {
  const { isDark } = useTheme();
  return isDark ? DARK : LIGHT;
};

export const v1Radius = {
  field: 12,
  card: 16,
  pill: 999,           // role tabs / role badges
  button: 12,
};

export const v1Spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  screenPad: 16,
};

export const v1Typography = {
  hero:    { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: v1Colors.text },
  brand:   { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, color: v1Colors.text },
  h1:      { fontSize: 24, fontWeight: '700', letterSpacing: -0.3, color: v1Colors.text },
  h2:      { fontSize: 20, fontWeight: '700', color: v1Colors.text },
  body:    { fontSize: 15, fontWeight: '400', color: v1Colors.text },
  bodyMd:  { fontSize: 14, fontWeight: '400', color: v1Colors.textMuted },
  caption: { fontSize: 12, fontWeight: '500', color: v1Colors.textMuted },
  small:   { fontSize: 11, fontWeight: '600', letterSpacing: 0.2, color: v1Colors.textDim },
  button:  { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
};

export const v1Shadow = {
  // For driver-emerald CTAs: subtle green halo
  glowEmerald: { shadowColor: v1Colors.driver, shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } },
  glowOrange:  { shadowColor: v1Colors.cargoOwner, shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } },
};

// Pick the brand accent for a given role. The same util will live in role-aware
// components so they don't each re-implement the ternary.
export const v1AccentFor = (role) =>
  role === 'driver'
    ? { main: v1Colors.driver, deep: v1Colors.driverDeep, glow: v1Colors.driverGlow, soft: v1Colors.driverSoft, onAccent: v1Colors.driverOnAccent }
    // client onAccent = тёмный (#0C0A09): белый на янтарном #FF8400 давал
    // контраст ~2:1 (WCAG fail). Чёрный — ~11:1 (AAA), премиальнее. Симметрично
    // водительскому black-on-green.
    : { main: v1Colors.cargoOwner, deep: v1Colors.cargoOwnerDeep, glow: v1Colors.cargoOwnerGlow, soft: v1Colors.cargoOwnerSoft, onAccent: v1Colors.driverOnAccent };
