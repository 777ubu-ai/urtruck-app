// Theme smoke — static check that the v1 design tokens expose both
// dark and light variants and that the key components consume the
// theme-aware hook (`useV1Colors`) instead of the static `v1Colors`
// fallback. We don't render React here; this is a fast file-level
// guard that catches regressions where someone re-introduces a
// static dark-only colour into a top-level component.
//
// Pass criteria:
//   1. designV1.js exports `useV1Colors` and the LIGHT branch contains
//      a non-black `bg` and a non-white `text` (otherwise the light
//      mode would be unreadable).
//   2. The frame-level components — Screen, BottomNav, BottomSheet,
//      BrandHeader, BrandBarWithShare, FilterChips, FeedCard,
//      GlassCard, SearchBar, Field, Textarea, OutlineButton, Checkbox,
//      RoleCard, RoleTabs, SegmentTabs, SectionTitle, StatsRow,
//      StickyCTABar, BellBadge — all import `useV1Colors`. If a
//      component still pulls only the static `v1Colors` token, the
//      smoke fails so the operator knows light mode is broken there.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DESIGN_V1 = path.join(ROOT, 'src', 'theme', 'designV1.js');

const FRAME_COMPONENTS = [
  'Screen.js', 'BottomNav.js', 'BottomSheet.js',
  'BrandHeader.js', 'BrandBarWithShare.js',
  'FilterChips.js', 'SearchBar.js',
  'FeedCard.js', 'GlassCard.js',
  'Field.js', 'Textarea.js',
  'OutlineButton.js', 'Checkbox.js',
  // Stage 20: RoleCard.js dropped — RoleScreen is now full-image hotspots.
  'RoleTabs.js', 'SegmentTabs.js',
  'SectionTitle.js', 'StatsRow.js',
  'StickyCTABar.js', 'BellBadge.js',
];

// Theme-dependent token keys. References to these via the static
// `v1Colors` export are dark-only and break light mode; `v1.X` (the
// hook-bound local) is fine.
const THEME_KEYS = [
  'bg', 'bgDeep', 'surface', 'surfaceLift', 'surfaceMuted',
  'border', 'borderStrong', 'text', 'textMuted', 'textDim', 'placeholder',
];

// Whitelist of screens or specific token references that may legitimately
// stay on the static `v1Colors` export. Empty for now — every user-facing
// screen must reach colours through useV1Colors.
//
// To exempt a screen, list it here with a one-line comment explaining
// why (e.g. "splash uses single-frame asset preload, no theme switching
// before first paint").
const SCREEN_WHITELIST = new Set([
  // intentionally empty after Stage 6 / revision 2 sweep
]);

const failures = [];

// 1. Tokens — designV1.js
const tokensSrc = fs.readFileSync(DESIGN_V1, 'utf8');
if (!/export const useV1Colors/.test(tokensSrc)) {
  failures.push('designV1.js missing `useV1Colors` export');
}
if (!/const LIGHT = \{[\s\S]*?bg:\s*'#F1F5F9'/.test(tokensSrc)) {
  failures.push('designV1.js LIGHT.bg is not a non-black light value');
}
if (!/const LIGHT = \{[\s\S]*?text:\s*'#0F172A'/.test(tokensSrc)) {
  failures.push('designV1.js LIGHT.text is not a dark on-light value');
}

// 2. Frame components consume the hook
for (const file of FRAME_COMPONENTS) {
  const p = path.join(ROOT, 'src', 'components', 'ui', 'v1', file);
  if (!fs.existsSync(p)) {
    failures.push(`${file}: file missing`);
    continue;
  }
  const src = fs.readFileSync(p, 'utf8');
  if (!/useV1Colors/.test(src)) {
    failures.push(`${file}: does not import useV1Colors — light theme will not apply`);
  }
}

// 3. Screens — every user-facing screen must NOT reference theme-dependent
// tokens through the static `v1Colors` export. Brand accents
// (driver / cargoOwner / glow / soft / error / success / warning) are
// theme-independent and may stay on `v1Colors`.
const SCREENS_DIR = path.join(ROOT, 'src', 'screens');
const themeTokenRe = new RegExp(`\\bv1Colors\\.(${THEME_KEYS.join('|')})\\b`, 'g');
const screenFiles = fs.readdirSync(SCREENS_DIR).filter((n) => n.endsWith('.js'));
let screenFails = 0;
for (const file of screenFiles) {
  if (SCREEN_WHITELIST.has(file)) continue;
  const src = fs.readFileSync(path.join(SCREENS_DIR, file), 'utf8');
  const hits = [...src.matchAll(themeTokenRe)];
  if (hits.length) {
    const sample = hits.slice(0, 3).map((h) => h[0]).join(', ');
    failures.push(`screens/${file}: ${hits.length} static v1Colors theme reference(s) — light mode will not apply (${sample}${hits.length > 3 ? '…' : ''})`);
    screenFails += 1;
  }
}

console.log(`[theme] frame components checked: ${FRAME_COMPONENTS.length}`);
console.log(`[theme] screens checked: ${screenFiles.length} (whitelisted: ${SCREEN_WHITELIST.size})`);
console.log(`[theme] designV1.js exports useV1Colors + LIGHT/DARK token sets`);

if (failures.length) {
  console.log('\n[theme] FAIL:');
  failures.forEach((f) => console.log('  -', f));
  process.exit(1);
}
console.log('\n[theme] OK');
