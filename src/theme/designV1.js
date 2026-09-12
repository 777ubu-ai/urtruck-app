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
import { LIGHT, DARK, DRIVER_CERAMIC, SHIPPER_CERAMIC, withAlpha } from './designV1Palette';

// Backwards compatibility. User-facing surfaces/text should not consume
// theme-dependent keys from this frozen object; qa/utils/themeSmoke.js guards
// screens against doing so.
export const v1Colors = LIGHT;
export { withAlpha };
export { DRIVER_CERAMIC };
export { SHIPPER_CERAMIC };

export const useDriverCeramicColors = () => DRIVER_CERAMIC;
export const useShipperCeramicColors = () => SHIPPER_CERAMIC;

export const useV1Colors = () => {
  const { isDark } = useTheme();
  return isDark ? DARK : LIGHT;
};

export const v1Radius = {
  field: 12,
  card: 16,
  pill: 999,
  button: 14,
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
  // ── Design Bible "Direction B" (2026-09-09, Commit 1) — additive only.
  label:   { fontSize: 13, lineHeight: 18, fontWeight: '600', color: c.textMuted },
  micro:   { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.2, color: c.textDim },
  price:   { fontSize: 17, lineHeight: 22, fontWeight: '800', color: c.text },
});

export const v1Typography = typographyFor(LIGHT);
export const useV1Typography = () => typographyFor(useV1Colors());

export const v1AccentFor = (role) =>
  role === 'driver'
    ? { main: v1Colors.driver, deep: v1Colors.driverDeep, glow: v1Colors.driverGlow, soft: v1Colors.driverSoft, onAccent: v1Colors.driverOnAccent }
    : { main: v1Colors.cargoOwner, deep: v1Colors.cargoOwnerDeep, glow: v1Colors.cargoOwnerGlow, soft: v1Colors.cargoOwnerSoft, onAccent: v1Colors.driverOnAccent };

// ── Design Bible "Direction B" (owner-approved 2026-09-09, Commit 1) ──
// Status role colors per theme. `cancelled` has no LIGHT-key counterpart in
// the approved additions — the palette's pre-existing `warning`-era grey
// `#718078` is the LIGHT value; DARK shifts it to textDim-family `#7C8B82`.
export const v1StatusColors = (c) => ({
  accepted: c.statusAccepted,
  in_progress: c.statusInProgress,
  at_border: c.statusAtBorder,
  delivered: c.statusDelivered,
  received: c.statusReceived,
  completed: c.statusCompleted,
  cancelled: c.statusCancelled,
});

export const getStatusColor = (c, status) =>
  v1StatusColors(c)[status] || c.textDim;

// Chat bubble color contract: outgoing uses the approved WhatsApp-family
// green (light `#D9FDD3` / dark `#005C4B`); incoming is surface/border + text.
export const getBubbleColors = (isMine, isDark) => {
  const c = isDark ? DARK : LIGHT;
  const outgoing = isDark
    ? { backgroundColor: DARK.outgoingDark, textColor: DARK.outgoingDarkText }
    : { backgroundColor: LIGHT.outgoing, textColor: LIGHT.outgoingText };
  return isMine
    ? { ...outgoing, borderColor: outgoing.backgroundColor }
    : { backgroundColor: c.surface, textColor: c.text, borderColor: c.border };
};

// `v1BubbleColors` — the full per-theme bubble contract (both directions).
export const v1BubbleColors = (isDark) => ({
  outgoing: isDark
    ? { backgroundColor: DARK.outgoingDark, textColor: DARK.outgoingDarkText }
    : { backgroundColor: LIGHT.outgoing, textColor: LIGHT.outgoingText },
  incoming: { backgroundColor: (isDark ? DARK : LIGHT).surface, textColor: (isDark ? DARK : LIGHT).text, borderColor: (isDark ? DARK : LIGHT).border },
});
