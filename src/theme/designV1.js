// UrTruck Design v1 tokens — extracted from design/UrTruck_New_Design_v1/
// 12-screen reference (May 2026). This module is additive: it does NOT
// replace `theme.js` (existing screens still import from there). New
// onboarding screens (Role / SignUp / Auth / EditProfile) consume this
// directly so the v1 visuals stay coherent without touching the rest of
// the app yet.

export const v1Colors = {
  // Backgrounds — closer to true black than v3, with a subtle cooler shift
  // for the surface layer (matches the deep neon glow under the hero truck).
  bg: '#000000',
  bgDeep: '#050608',
  surface: '#0F1418',
  surfaceLift: '#141A20',
  surfaceMuted: '#1A2128',

  // Hairlines / input borders — neutral white at 6-12% so they don't read blue.
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',

  // Brand accents
  driver: '#22C55E',
  driverDeep: '#16A34A',
  driverGlow: 'rgba(34,197,94,0.35)',
  driverSoft: 'rgba(34,197,94,0.12)',

  cargoOwner: '#F59E0B',
  cargoOwnerDeep: '#D97706',
  cargoOwnerGlow: 'rgba(245,158,11,0.35)',
  cargoOwnerSoft: 'rgba(245,158,11,0.12)',

  // Text ramp — slightly warmer white than v3, cooler grays for hierarchy
  text: '#F5F5F5',
  textMuted: '#9CA3AF',
  textDim: '#5A6068',
  placeholder: '#5A6068',

  // Status
  error: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
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
