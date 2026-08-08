// UrTruck Design v1 tokens — extracted from design/UrTruck_New_Design_v1/
// 12-screen reference (May 2026). Theme-aware UI must read colours at render
// time through `useV1Colors()`; the static export remains only for legacy
// brand/status constants that do not need to change with the theme.

import { useTheme } from '../utils/ThemeContext';

const DARK = {
  bg: '#0F1512',
  bgDeep: '#0B100D',
  surface: '#151E19',
  surfaceLift: '#1B2620',
  surfaceMuted: '#202C25',

  border: '#2A3930',
  borderStrong: '#3A4B40',

  // Keep one UrTruck green identity in both roles. #168759 with white text
  // remains WCAG-AA for normal CTA text (~4.5:1) and avoids neon glare.
  driver: '#168759',
  driverDeep: '#0F6B47',
  driverGlow: 'rgba(22,135,89,0.30)',
  driverSoft: 'rgba(22,135,89,0.18)',
  driverOnAccent: '#FFFFFF',

  cargoOwner: '#168759',
  cargoOwnerDeep: '#0F6B47',
  cargoOwnerGlow: 'rgba(22,135,89,0.30)',
  cargoOwnerSoft: 'rgba(22,135,89,0.18)',

  text: '#F3F7F4',
  textMuted: '#B7C3BB',
  textDim: '#9EAAA2',
  placeholder: '#9EAAA2',

  error: '#FF7B7B',
  success: '#63D69A',
  warning: '#F5B75B',
};

const LIGHT = {
  bg: '#F6F8F7',
  bgDeep: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceLift: '#F3FBF7',
  surfaceMuted: '#F0F4F2',

  border: '#E5ECE8',
  borderStrong: '#C8D8CF',

  driver: '#168759',
  driverDeep: '#0F6B47',
  driverGlow: 'rgba(22,135,89,0.18)',
  driverSoft: '#E8F6EF',
  driverOnAccent: '#FFFFFF',

  cargoOwner: '#168759',
  cargoOwnerDeep: '#0F6B47',
  cargoOwnerGlow: 'rgba(22,135,89,0.18)',
  cargoOwnerSoft: '#E8F6EF',

  text: '#14221C',
  textMuted: '#617067',
  textDim: '#7C8B82',
  placeholder: '#6B7A71',

  error: '#D64545',
  success: '#168759',
  warning: '#B76B00',
};

// Backwards compatibility. User-facing surfaces/text should not consume
// theme-dependent keys from this frozen object; qa/utils/themeSmoke.js guards
// screens against doing so.
export const v1Colors = LIGHT;

export const useV1Colors = () => {
  const { isDark } = useTheme();
  return isDark ? DARK : LIGHT;
};

export const v1Radius = {
  field: 12,
  card: 16,
  pill: 999,
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

// Frozen typography remains for layout/back-compat. New theme-aware code should
// use `useV1Typography()` so text colours change together with the palette.
const typographyFor = (c) => ({
  hero:    { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: c.text },
  brand:   { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, color: c.text },
  h1:      { fontSize: 24, fontWeight: '700', letterSpacing: -0.3, color: c.text },
  h2:      { fontSize: 20, fontWeight: '700', color: c.text },
  body:    { fontSize: 15, fontWeight: '400', color: c.text },
  bodyMd:  { fontSize: 14, fontWeight: '400', color: c.textMuted },
  caption: { fontSize: 12, fontWeight: '500', color: c.textMuted },
  small:   { fontSize: 11, fontWeight: '600', letterSpacing: 0.2, color: c.textDim },
  button:  { fontSize: 15, fontWeight: '600', color: c.driverOnAccent },
});

export const v1Typography = typographyFor(LIGHT);
export const useV1Typography = () => typographyFor(useV1Colors());

export const v1Shadow = {
  glowEmerald: { shadowColor: v1Colors.driver, shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } },
  glowOrange:  { shadowColor: v1Colors.cargoOwner, shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } },
};

export const v1AccentFor = (role) =>
  role === 'driver'
    ? { main: v1Colors.driver, deep: v1Colors.driverDeep, glow: v1Colors.driverGlow, soft: v1Colors.driverSoft, onAccent: v1Colors.driverOnAccent }
    : { main: v1Colors.cargoOwner, deep: v1Colors.cargoOwnerDeep, glow: v1Colors.cargoOwnerGlow, soft: v1Colors.cargoOwnerSoft, onAccent: v1Colors.driverOnAccent };
