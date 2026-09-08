// UrTruck Design v1 tokens — extracted from design/UrTruck_New_Design_v1/
// 12-screen reference (May 2026). Theme-aware UI must read colours at render
// time through `useV1Colors()`; the static export remains only for legacy
// brand/status constants that do not need to change with the theme.

import { useTheme } from '../utils/ThemeContext';
// Track B / B6: palette data now lives in designV1Palette.js (zero
// dependencies, importable from plain Node tooling) so
// qa/utils/themeContrastSmoke.js can import the real values instead of a
// hand-copy that had already drifted (see that file's own comment). This
// file adds nothing but the theme-aware hook on top of the same data.
import { LIGHT, DARK } from './designV1Palette';

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
