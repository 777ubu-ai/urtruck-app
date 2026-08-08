// UrTruck Design System — DESIGN_SYSTEM.md compliant
// Dark Premium: #0a0f1a bg, #22c55e accent, glass cards
// Fonts: Syne (headings), DM Sans (body)

import { Platform } from 'react-native';

const FONT = {
  heading: Platform.OS === 'web' ? "'Syne', sans-serif" : undefined,
  body: Platform.OS === 'web' ? "'DM Sans', sans-serif" : undefined,
};

export const darkTheme = {
  bg: '#0a0f1a',
  surface: '#111827',
  surfaceAlt: '#1a2234',
  card: 'rgba(255,255,255,0.04)',
  cardBorder: 'rgba(255,255,255,0.08)',
  cardHover: 'rgba(255,255,255,0.07)',
  cardActive: 'rgba(34,197,94,0.05)',
  cardActiveBorder: 'rgba(34,197,94,0.3)',
  text: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textDisabled: '#475569',
  border: 'rgba(255,255,255,0.08)',
  overlay: 'rgba(10,15,26,0.85)',
  // Compat aliases
  bgElevated: '#111827',
  cardElevated: '#1a2234',
  textDim: '#475569',
  shadow: 'rgba(0,0,0,0.6)',
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
  cardActiveBorder: '#168a5b',
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
  primary: '#168a5b',
  primaryDark: '#0f6b47',
  primaryGlow: 'rgba(22,138,91,0.18)',
  blue: '#3b82f6',
  blueSoft: '#1e3a5f',
  driver: '#168a5b',
  client: '#168a5b',
  browse: '#168a5b',
};

// Status colors
export const statusColors = {
  success:  { color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  warning:  { color: '#E06D00', bg: 'rgba(255,132,0,0.15)' },
  danger:   { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  info:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
};

// Scoring colors
export const scoringColor = (score) =>
  score >= 70 ? '#22c55e' : score >= 40 ? '#FF8400' : '#ef4444';

// Truck type colors (all green-based for consistency)
export const truckColors = {
  tent: '#22c55e', ref: '#3b82f6', platform: '#FF8400',
  auto: '#a855f7', izoterm: '#06b6d4',
};

export const colors = {
  success: '#22c55e',
  error: '#ef4444',
  warning: '#FF8400',
  rating: '#eab308',
  online: '#22c55e',
};

// Design System styles helper — единая светлая B2B-тема (redesign 08.08.2026).
export const DS = {
  font: FONT,
  // Glass card → светлая карточка
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
  // Primary button
  btnPrimary: {
    backgroundColor: '#168a5b',
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
  // Secondary button
  btnSecondary: {
    backgroundColor: '#f0f4f2',
    borderWidth: 1,
    borderColor: '#e5ece8',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  // Input
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
  // Badge
  badge: (color) => ({
    backgroundColor: (color === '#22c55e' || color === '#168a5b') ? 'rgba(22,138,91,0.12)'
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
  // Heading
  h1: { fontFamily: FONT.heading, fontSize: 24, fontWeight: '800', color: '#14221c' },
  h2: { fontFamily: FONT.heading, fontSize: 20, fontWeight: '700', color: '#14221c' },
  h3: { fontFamily: FONT.heading, fontSize: 16, fontWeight: '700', color: '#168a5b' },
  display: { fontFamily: FONT.heading, fontSize: 32, fontWeight: '800', color: '#14221c', letterSpacing: -1 },
  body: { fontFamily: FONT.body, fontSize: 15, fontWeight: '400', color: '#617067' },
  small: { fontFamily: FONT.body, fontSize: 13, fontWeight: '400', color: '#617067' },
  label: { fontFamily: FONT.body, fontSize: 11, fontWeight: '400', color: '#7c8b82', letterSpacing: 1.5, textTransform: 'uppercase' },
  // Tab bar
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5ece8',
    paddingBottom: 20,
    paddingTop: 12,
    height: 80,
  },
  tabActive: '#168a5b',
  tabInactive: '#617067',
};
