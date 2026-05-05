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

  driver: '#22C55E',
  driverDeep: '#16A34A',
  driverGlow: 'rgba(34,197,94,0.35)',
  driverSoft: 'rgba(34,197,94,0.12)',

  cargoOwner: '#F59E0B',
  cargoOwnerDeep: '#D97706',
  cargoOwnerGlow: 'rgba(245,158,11,0.35)',
  cargoOwnerSoft: 'rgba(245,158,11,0.12)',

  text: '#F5F5F5',
  textMuted: '#9CA3AF',
  textDim: '#5A6068',
  placeholder: '#5A6068',

  error: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
};

const LIGHT = {
  // Light surfaces aligned with `lightTheme` in src/utils/theme.js so the
  // legacy v3 screens and the v1 onboarding surfaces share one light look.
  bg: '#F1F5F9',
  bgDeep: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceLift: '#F8FAFC',
  surfaceMuted: '#E2E8F0',

  border: '#CBD5E1',
  borderStrong: '#94A3B8',

  // Brand accents stay identical — they read on both backgrounds and the
  // soft/glow halos already include enough alpha to work on white.
  driver: '#22C55E',
  driverDeep: '#16A34A',
  driverGlow: 'rgba(34,197,94,0.35)',
  driverSoft: 'rgba(34,197,94,0.12)',

  cargoOwner: '#F59E0B',
  cargoOwnerDeep: '#D97706',
  cargoOwnerGlow: 'rgba(245,158,11,0.35)',
  cargoOwnerSoft: 'rgba(245,158,11,0.12)',

  text: '#0F172A',
  textMuted: '#475569',
  textDim: '#94A3B8',
  placeholder: '#94A3B8',

  error: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
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
  field: 14,           // input rows
  card: 18,            // glass cards / containers
  pill: 999,           // role tabs / role badges
  button: 16,          // primary CTAs (close to pill but with corners visible)
};

export const v1Spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  screenPad: 22,
};

export const v1Typography = {
  hero:    { fontSize: 32, fontWeight: '900', letterSpacing: -1, color: v1Colors.text },
  brand:   { fontSize: 28, fontWeight: '900', letterSpacing: -0.5, color: v1Colors.text },
  h1:      { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: v1Colors.text },
  h2:      { fontSize: 20, fontWeight: '800', color: v1Colors.text },
  body:    { fontSize: 14, fontWeight: '500', color: v1Colors.text },
  bodyMd:  { fontSize: 13, fontWeight: '500', color: v1Colors.textMuted },
  caption: { fontSize: 12, fontWeight: '500', color: v1Colors.textMuted },
  small:   { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: v1Colors.textDim },
  button:  { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
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
    ? { main: v1Colors.driver, deep: v1Colors.driverDeep, glow: v1Colors.driverGlow, soft: v1Colors.driverSoft }
    : { main: v1Colors.cargoOwner, deep: v1Colors.cargoOwnerDeep, glow: v1Colors.cargoOwnerGlow, soft: v1Colors.cargoOwnerSoft };
