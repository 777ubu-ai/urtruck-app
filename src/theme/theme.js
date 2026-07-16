// UrTruck Design System v3 — Brand consolidation (Emerald + Orange + Graphite)
//
// Brand rules (single source of truth — see also CLAUDE.md):
//   primary = emerald  (success, driver, default action)
//   accent  = orange   (warning, client/shipper, secondary action)
//   base    = graphite (#070B12 / #111827 / #172033)
//   error   = red      (destructive only)
//   blue is NOT a brand color anymore — legacy aliases below resolve to the
//   brand emerald / graphite so existing imports keep compiling.

export const colors = {
  background: '#070B12',
  surface: '#111827',
  surface2: '#172033',
  border: '#263244',
  graphiteHi: '#334155',           // neutral interactive (replaces sky/cyan)
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  textDim: '#64748B',
  green: '#22C55E',
  greenDeep: '#16A34A',
  greenMuted: 'rgba(34,197,94,0.12)',
  orange: '#F59E0B',
  orangeMuted: 'rgba(245,158,11,0.12)',
  red: '#EF4444',
  // Legacy aliases — point at brand emerald to neutralize stray imports.
  // Do NOT use in new code; prefer `tokens.colorPrimary` / `tokens.colorAccent`.
  blue: '#22C55E',
  blueMuted: 'rgba(34,197,94,0.12)',
};

// Canonical theme tokens for new code.
export const tokens = {
  colorPrimary: colors.green,
  colorPrimaryDeep: colors.greenDeep,
  colorAccent: colors.orange,
  colorBg: colors.background,
  colorCard: colors.surface,
  colorCardElevated: colors.surface2,
  colorBorder: colors.border,
  colorText: colors.text,
  colorMuted: colors.textMuted,
  colorDim: colors.textDim,
  colorSuccess: colors.green,
  colorWarning: colors.orange,
  colorError: colors.red,
  colorNeutral: colors.graphiteHi,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
};

export const typography = {
  hero: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, lineHeight: 34 },
  h1: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, lineHeight: 28 },
  h2: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  body: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  small: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
};
