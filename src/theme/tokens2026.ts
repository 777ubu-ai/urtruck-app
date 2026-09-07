// UrTruck Design System 2026 — canonical semantic tokens.
// Source of truth: /URTRUCK_DESIGN_SYSTEM_2026.md (branch fix/urtruck-design-system-2026).
//
// Rules:
//  - New code consumes ONLY these tokens (no inline HEX / random sizes).
//  - role.* ≠ status.* — green does not mean Driver, orange does not mean Shipper.
//  - Role color is ~5–15% of the visual field; the app stays a neutral premium UI.
//  - Dark theme is a separate semantic ramp (TZ §33), not an inversion of Light.
//  - Auth/onboarding stays LIGHT regardless of device theme (TZ §34) — see
//    `lightTokens` export and forced-light scope in the shell.

import { useTheme } from '../utils/ThemeContext';

// ─── Palettes ──────────────────────────────────────────────────────

const light = {
  // brand
  'brand.primary': '#168759',
  'brand.primaryPressed': '#0F6B47',
  'brand.primarySoft': '#E8F6EF',
  'brand.accent': '#FF8400',
  'brand.accentPressed': '#E06D00',
  'brand.accentSoft': '#FFF3E8',
  'brand.telegram': '#0088CC',

  // roles (accent only, never app background)
  'role.driver.main': '#168759',
  'role.driver.pressed': '#0F6B47',
  'role.driver.soft': '#E8F6EF',
  'role.driver.onAccent': '#FFFFFF',
  'role.shipper.main': '#C2410C',   // WCAG AA: white text 5.2:1 (#F97316 fails at 2.8)
  'role.shipper.bright': '#EA580C', // large graphics / bold CTA labels only (≥3:1)
  'role.shipper.pressed': '#9A3412',
  'role.shipper.soft': '#FFF3E8',
  'role.shipper.onAccent': '#FFFFFF',

  // status (independent of roles)
  'status.success.main': '#16A34A',
  'status.success.soft': '#EAF7EE',
  'status.warning.main': '#D97706',
  'status.warning.soft': '#FEF3E2',
  'status.danger.main': '#DC2626',
  'status.danger.pressed': '#B91C1C',
  'status.danger.soft': '#FDECEC',
  'status.info.main': '#2E6CE6',
  'status.info.soft': '#EAF1FD',
  'status.neutral.main': '#617067',
  'status.neutral.soft': '#F0F4F2',

  // surfaces
  'surface.app': '#F7F8FA',
  'surface.card': '#FFFFFF',
  'surface.muted': '#F1F3F5',
  'surface.lift': '#F3FBF7',
  'surface.overlay': 'rgba(16,24,20,0.48)',

  // text
  'text.primary': '#17191C',
  'text.secondary': '#667085',
  'text.muted': '#98A2B3',
  'text.inverse': '#FFFFFF',
  'text.onAccent': '#FFFFFF',

  // borders
  'border.default': '#E4E7EC',
  'border.strong': '#C8D8CF',
  'border.focus': '#168759',

  // chat
  'chat.bg': '#F5F7F6',
  'chat.bubble.outgoing': '#DCF2E4',
  'chat.bubble.outgoingText': '#17191C',
  'chat.bubble.incoming': '#FFFFFF',
  'chat.bubble.incomingBorder': '#E4E7EC',
  'chat.tick.read': '#2E6CE6',
  'chat.tick.failed': '#DC2626',
} as const;

const dark: { [K in keyof typeof light]: string } = {
  'brand.primary': '#2BAE72',
  'brand.primaryPressed': '#168759',
  'brand.primarySoft': 'rgba(43,174,114,0.18)',
  'brand.accent': '#FB923C',
  'brand.accentPressed': '#F97316',
  'brand.accentSoft': 'rgba(251,146,60,0.16)',
  'brand.telegram': '#0088CC',

  'role.driver.main': '#2BAE72',
  'role.driver.pressed': '#168759',
  'role.driver.soft': 'rgba(43,174,114,0.18)',
  'role.driver.onAccent': '#FFFFFF',
  'role.shipper.main': '#C2410C',   // CTA bg stays AA-safe with white text in dark too
  'role.shipper.bright': '#FB923C', // large graphics / text accents on dark surfaces
  'role.shipper.pressed': '#EA580C',
  'role.shipper.soft': 'rgba(251,146,60,0.16)',
  'role.shipper.onAccent': '#FFFFFF',

  'status.success.main': '#4ADE80',
  'status.success.soft': 'rgba(74,222,128,0.16)',
  'status.warning.main': '#F5B75B',
  'status.warning.soft': 'rgba(245,183,91,0.16)',
  'status.danger.main': '#F87171',
  'status.danger.pressed': '#EF4444',
  'status.danger.soft': 'rgba(248,113,113,0.16)',
  'status.info.main': '#6EA8FF',
  'status.info.soft': 'rgba(110,168,255,0.16)',
  'status.neutral.main': '#AAB2BF',
  'status.neutral.soft': '#1F232B',

  // TZ §33 neutral dark ramp
  'surface.app': '#0F1115',
  'surface.card': '#171A20',
  'surface.muted': '#1F232B',
  'surface.lift': '#1F232B',
  'surface.overlay': 'rgba(0,0,0,0.60)',

  'text.primary': '#F5F7FA',
  'text.secondary': '#AAB2BF',
  'text.muted': '#7B8494',
  'text.inverse': '#FFFFFF',
  'text.onAccent': '#FFFFFF',

  'border.default': '#2D333D',
  'border.strong': '#3A4250',
  'border.focus': '#2BAE72',

  'chat.bg': '#0F1115',
  'chat.bubble.outgoing': '#1E3A2D',
  'chat.bubble.outgoingText': '#F5F7FA',
  'chat.bubble.incoming': '#171A20',
  'chat.bubble.incomingBorder': '#2D333D',
  'chat.tick.read': '#6EA8FF',
  'chat.tick.failed': '#F87171',
};

export type TokenName = keyof typeof light;

export const lightTokens = light;
export const darkTokens = dark;

/** Resolve the active token map. Auth/onboarding must import `lightTokens`
 *  directly (TZ §34 — auth always light). */
export const useTokens = () => {
  const { isDark } = useTheme();
  return isDark ? dark : light;
};

// ─── Typography (§2) ───────────────────────────────────────────────
// No fractional sizes outside the documented chat canon (11.5 / 12.5).

export const type2026 = {
  display:       { fontSize: 30, lineHeight: 36, fontWeight: '700' as const },
  h1:            { fontSize: 24, lineHeight: 30, fontWeight: '700' as const },
  h2:            { fontSize: 20, lineHeight: 26, fontWeight: '600' as const },
  h3:            { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  bodyLarge:     { fontSize: 17, lineHeight: 24, fontWeight: '500' as const },
  body:          { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodySmall:     { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  caption:       { fontSize: 12.5, lineHeight: 16, fontWeight: '500' as const }, // chat date separator canon
  timestamp:     { fontSize: 11.5, lineHeight: 14, fontWeight: '500' as const }, // chat/push timestamp canon
  button:        { fontSize: 16, lineHeight: 20, fontWeight: '600' as const },
  buttonCompact: { fontSize: 14, lineHeight: 18, fontWeight: '600' as const },
  badge:         { fontSize: 11, lineHeight: 14, fontWeight: '600' as const },
};

export type TypeToken = keyof typeof type2026;

/** ZH lineHeight compensation (+2) per §3 — CJK glyphs must never clip. */
export const withZhLeading = <T extends { lineHeight?: number }>(style: T, isZh: boolean): T =>
  isZh && typeof style.lineHeight === 'number'
    ? { ...style, lineHeight: style.lineHeight + 2 }
    : style;

// ─── Spacing (§4) ──────────────────────────────────────────────────

export const space2026 = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,   // screen horizontal padding, card padding
  5: 20,
  6: 24,   // section gap min
  8: 32,   // section gap max
  10: 40,
  12: 48,
} as const;

export const screenPadding = space2026[4];

// ─── Radius (§6) ───────────────────────────────────────────────────

export const radius2026 = {
  sm: 8,
  md: 12,    // inputs, small buttons
  lg: 14,    // standard buttons
  card: 16,
  sheet: 20,
  bubble: 18,
  pill: 999,
} as const;

// ─── Component metrics ─────────────────────────────────────────────

export const metrics2026 = {
  touchTargetIos: 44,
  touchTargetAndroid: 48,
  buttonHeight: 48,
  buttonCtaHeight: 54,       // 52–56 canon midpoint
  buttonCompactHeight: 42,   // 40–44 visual
  inputHeight: 50,           // 48–52
  headerHeight: 56,
  bottomNavHeight: 56,
  statusChipHeight: 30,      // 28–32
  chipHeight: 34,            // 32–36 filter/action chips
  badgeHeight: 19,           // 18–20
  badgeDot: 9,               // 8–10
  iconSm: 18,                // small contextual 16–20
  iconMd: 22,                // UI/header 20–24
  iconLg: 24,
  avatarRow: 42,             // notification/chat rows 40–44
  avatarList: 40,            // lists 36–44
  avatarProfile: 80,         // 72–88
  voiceBubbleHeight: 68,     // 64–72 canon
  notificationRowHeight: 68, // 64–72
  documentRowHeight: 62,     // 56–68
  searchHeight: 46,          // 44–48
  toastHeight: 52,           // 48–56
  modalRadius: 22,           // 20–24
  flagWidth: 20,             // 18–22
  mapControl: 46,            // 44–48
  mapCardRadius: 22,         // 20–24
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
} as const;

// ─── Deal FSM status → semantic mapping (§47) ──────────────────────

export const dealStatusTone = {
  waiting: 'status.neutral.main',
  active: 'status.info.main',
  border: 'status.warning.main',
  delivered: 'status.success.main',
  cancelled: 'status.danger.main',
  completed: 'status.success.main',
} as const;

// ─── Motion (§38) ──────────────────────────────────────────────────

export const motion2026 = {
  micro: 130,   // 100–160
  normal: 210,  // 180–240
  sheet: 270,   // 220–320
} as const;
