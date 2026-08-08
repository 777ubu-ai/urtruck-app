// UrTruck Design System — DESIGN_SYSTEM.md compliant
// Light + Dark B2B palettes, shared green brand accent.
// Fonts: Syne (headings), DM Sans (body)

import { Platform } from 'react-native';

const FONT = {
  heading: Platform.OS === 'web' ? "'Syne', sans-serif" : undefined,
  body: Platform.OS === 'web' ? "'DM Sans', sans-serif" : undefined,
};

export const darkTheme = {
  bg: '#0F1512',
  surface: '#151E19',
  surfaceAlt: '#1B2620',
  card: '#151E19',
  cardBorder: '#2A3930',
  cardHover: '#1B2620',
  cardActive: '#203329',
  cardActiveBorder: '#168759',
  text: '#F3F7F4',
  textSecondary: '#B7C3BB',
  textMuted: '#9EAAA2',
  textDisabled: '#7C8A81',
  border: '#2A3930',
  overlay: 'rgba(5,10,7,0.82)',
  // Compat aliases
  bgElevated: '#151E19',
  cardElevated: '#1B2620',
  textDim: '#8F9C94',
  shadow: 'rgba(0,0,0,0.65)',
  shadowLight: 'rgba(255,255,255,0.03)',
};

export const lightTheme = {
  bg: '#f6f8f7',
  surface: '#ffffff',
  surfaceAlt: '#f0f4f2',
  card: '#ffffff',
  cardBorder: '#e5ece8',
  cardHover: '#f3fbf7',
  cardActive: '#e8f6ef',
  cardActiveBorder: '#168759',
  text: '#14221c',
  textSecondary: '#3f5047',
  textMuted: '#617067',
  textDisabled: '#9aa8a0',
  border: '#e5ece8',
  overlay: 'rgba(0,0,0,0.4)',
  bgElevated: '#ffffff',
  cardElevated: '#f3fbf7',
  textDim: '#7c8b82',
  shadow: 'rgba(0,0,0,0.12)',
  shadowLight: 'rgba(0,0,0,0.06)',
};

// Design System accent colors
export const accentColors = {
  primary: '#168759',
  primaryDark: '#0f6b47',
  primaryGlow: 'rgba(22,135,89,0.18)',
  blue: '#3b82f6',
  blueSoft: '#1e3a5f',
  driver: '#168759',
  client: '#168759',
  browse: '#168759',
};

// Status colors
export const statusColors = {
  success:  { color: '#168759', bg: 'rgba(34,197,94,0.15)' },
  warning:  { color: '#E06D00', bg: 'rgba(255,132,0,0.15)' },
  danger:   { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  info:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
};

// Scoring colors
export const scoringColor = (score) =>
  score >= 70 ? '#168759' : score >= 40 ? '#FF8400' : '#ef4444';

// Truck type colors (all green-based for consistency)
export const truckColors = {
  tent: '#168759', ref: '#3b82f6', platform: '#FF8400',
  auto: '#a855f7', izoterm: '#06b6d4',
};

export const colors = {
  success: '#168759',
  error: '#ef4444',
  warning: '#FF8400',
  rating: '#D97706',
  online: '#168759',
};

// Static helpers retained for backwards compatibility. Theme-aware screens
// should consume `theme` from ThemeContext/useV1Colors at render time.
export const DS = {
  font: FONT,
  glass: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5ece8',
    borderRadius: 16,
    padding: 16,
  },
  glassHero: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5ece8',
    borderRadius: 20,
    padding: 20,
  },
  btnPrimary: {
    backgroundColor: '#168759',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: FONT.body,
  },
  btnSecondary: {
    backgroundColor: '#f0f4f2',
    borderWidth: 1,
    borderColor: '#e5ece8',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5ece8',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#14221c',
    fontSize: 15,
    fontFamily: FONT.body,
  },
  badge: (color) => ({
    backgroundColor: (color === '#168759' || color === '#168759') ? 'rgba(22,135,89,0.12)'
      : color === '#FF8400' ? 'rgba(255,132,0,0.15)'
      : color === '#ef4444' ? 'rgba(214,69,69,0.12)'
      : 'rgba(52,120,212,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  }),
  badgeText: (color) => ({
    color,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: FONT.body,
  }),
  h1: { fontFamily: FONT.heading, fontSize: 24, fontWeight: '800', color: '#14221c' },
  h2: { fontFamily: FONT.heading, fontSize: 20, fontWeight: '700', color: '#14221c' },
  h3: { fontFamily: FONT.heading, fontSize: 16, fontWeight: '700', color: '#168759' },
  display: { fontFamily: FONT.heading, fontSize: 32, fontWeight: '800', color: '#14221c', letterSpacing: -1 },
  body: { fontFamily: FONT.body, fontSize: 15, fontWeight: '400', color: '#617067' },
  small: { fontFamily: FONT.body, fontSize: 13, fontWeight: '400', color: '#617067' },
  label: { fontFamily: FONT.body, fontSize: 11, fontWeight: '400', color: '#7c8b82', letterSpacing: 1.5, textTransform: 'uppercase' },
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5ece8',
    paddingBottom: 20,
    paddingTop: 12,
    height: 80,
  },
  tabActive: '#168759',
  tabInactive: '#617067',
};
