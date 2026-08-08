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
  warning:  { color: '#FF8400', bg: 'rgba(255,132,0,0.15)' },
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

// Design System styles helper
export const DS = {
  font: FONT,
  // Glass card
  glass: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
  },
  glassHero: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 20,
  },
  // Primary button
  btnPrimary: {
    backgroundColor: '#22c55e',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  // Input
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 15,
    fontFamily: FONT.body,
  },
  // Badge
  badge: (color) => ({
    backgroundColor: color === '#22c55e' ? 'rgba(34,197,94,0.15)'
      : color === '#FF8400' ? 'rgba(255,132,0,0.15)'
      : color === '#ef4444' ? 'rgba(239,68,68,0.15)'
      : 'rgba(59,130,246,0.15)',
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
  h1: { fontFamily: FONT.heading, fontSize: 24, fontWeight: '800', color: '#ffffff' },
  h2: { fontFamily: FONT.heading, fontSize: 20, fontWeight: '700', color: '#ffffff' },
  h3: { fontFamily: FONT.heading, fontSize: 16, fontWeight: '700', color: '#22c55e' },
  display: { fontFamily: FONT.heading, fontSize: 32, fontWeight: '800', color: '#ffffff', letterSpacing: -1 },
  body: { fontFamily: FONT.body, fontSize: 15, fontWeight: '400', color: '#94a3b8' },
  small: { fontFamily: FONT.body, fontSize: 13, fontWeight: '400', color: '#94a3b8' },
  label: { fontFamily: FONT.body, fontSize: 11, fontWeight: '400', color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase' },
  // Tab bar
  tabBar: {
    backgroundColor: 'rgba(10,15,26,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 20,
    paddingTop: 12,
    height: 80,
  },
  tabActive: '#22c55e',
  tabInactive: '#475569',
};
