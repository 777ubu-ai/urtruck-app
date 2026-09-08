// designV1Palette — pure color data extracted out of designV1.js (Track B / B6).
//
// designV1.js pulls in `useTheme` from ThemeContext.js at module scope,
// which in turn imports `react-native` — fine inside the app bundle, but it
// means nothing can import designV1.js from a plain Node script (CI smoke
// tests, tooling) without react-native's native-module bridging blowing up
// outside Metro. That's exactly why qa/utils/themeContrastSmoke.js used to
// keep its own hand-copied palette instead of importing the real one — and
// why that copy was free to silently drift out of sync (see the 2026-09-08
// audit: it had gone stale for `warning`, and didn't cover `brandV2.js` or
// the DARK.rating pair at all).
//
// This file has zero imports, so it's safe for both the RN bundle and plain
// Node tooling to import directly. designV1.js now re-exports LIGHT/DARK
// from here instead of declaring its own copies — same values, single
// source of truth.
export const LIGHT = {
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
  // Track B, 2026-09-08 (two-step correction):
  //  1. Was an orphaned '#B76B00' (zero live consumers) — corrected to
  //     '#E06D00', the value already hardcoded across 6+ live screens.
  //  2. '#E06D00' on white measures 3.30:1, below the 4.5:1 normal-text
  //     threshold (this token is only ever used as small text — see
  //     MyTripsScreen.js, TrackTruckScreen.js — never as a background or
  //     icon, so there's no "keep it bright for decorative use" case
  //     here). Same hue/saturation family, darkened until compliant:
  //     4.84:1 on white. Owner-approved per the WCAG-AA-for-text /
  //     bright-OK-for-background-or-icon-only policy (2026-09-08).
  warning: '#B45800',
  // info/rating: previously only lived as a hand-copy inside
  // qa/utils/themeContrastSmoke.js (never in this file), per CLAUDE.md canon.
  info: '#3478D4',
  rating: '#D97706',
};

export const DARK = {
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
  info: '#5BA3F5',
  rating: '#D97706',
};
