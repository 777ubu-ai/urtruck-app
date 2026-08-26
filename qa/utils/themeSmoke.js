// Theme smoke — static guard for light/dark architecture.
// It verifies that ThemeContext resolves the selected mode at runtime and that
// user-facing v1 surfaces consume `useV1Colors` rather than frozen light tokens.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DESIGN_V1 = path.join(ROOT, 'src', 'theme', 'designV1.js');
const THEME_CONTEXT = path.join(ROOT, 'src', 'utils', 'ThemeContext.js');

const FRAME_COMPONENTS = [
  'Screen.js', 'BottomNav.js', 'BottomSheet.js',
  'BrandHeader.js', 'BrandBarWithShare.js',
  'FilterChips.js', 'SearchBar.js',
  'FeedCard.js', 'GlassCard.js',
  'Field.js', 'Textarea.js',
  'OutlineButton.js', 'Checkbox.js',
  'RoleTabs.js', 'SegmentTabs.js',
  'SectionTitle.js', 'StatsRow.js',
  'StickyCTABar.js', 'BellBadge.js',
];

const THEME_KEYS = [
  'bg', 'bgDeep', 'surface', 'surfaceLift', 'surfaceMuted',
  'border', 'borderStrong', 'text', 'textMuted', 'textDim', 'placeholder',
];

const SCREEN_WHITELIST = new Set([]);
const failures = [];

// 1. ThemeContext must not freeze the app to one theme.
const contextSrc = fs.readFileSync(THEME_CONTEXT, 'utf8');
if (/const\s+isDark\s*=\s*false\s*;/.test(contextSrc)) {
  failures.push('ThemeContext hardcodes `isDark = false` — dark toggle is disabled');
}
if (!/themeMode\s*===\s*['"]dark['"]/.test(contextSrc)) {
  failures.push('ThemeContext does not resolve explicit dark mode');
}
if (!/themeMode\s*===\s*['"]auto['"][\s\S]*systemDark/.test(contextSrc)) {
  failures.push('ThemeContext does not resolve system theme while in auto mode');
}
if (!/storage\.set\(KEY,\s*mode\)/.test(contextSrc)) {
  failures.push('ThemeContext does not persist the selected theme');
}

// 2. Tokens — both variants and render-time hooks must exist.
const tokensSrc = fs.readFileSync(DESIGN_V1, 'utf8');
if (!/export const useV1Colors/.test(tokensSrc)) {
  failures.push('designV1.js missing `useV1Colors` export');
}
if (!/export const useV1Typography/.test(tokensSrc)) {
  failures.push('designV1.js missing `useV1Typography` export');
}
if (!/const LIGHT = \{[\s\S]*?bg:\s*'#F6F8F7'/.test(tokensSrc)) {
  failures.push('designV1.js LIGHT.bg is not the expected light surface');
}
if (!/const DARK = \{[\s\S]*?bg:\s*'#0F1512'/.test(tokensSrc)) {
  failures.push('designV1.js DARK.bg is not the approved dark surface');
}

// 3. Frame components consume the hook.
for (const file of FRAME_COMPONENTS) {
  const p = path.join(ROOT, 'src', 'components', 'ui', 'v1', file);
  if (!fs.existsSync(p)) {
    failures.push(`${file}: file missing`);
    continue;
  }
  const src = fs.readFileSync(p, 'utf8');
  if (!/useV1Colors/.test(src)) {
    failures.push(`${file}: does not import useV1Colors — theme switching will not apply`);
  }
}

// 4. Screens must not bind theme-dependent surface/text tokens to frozen v1Colors.
const SCREENS_DIR = path.join(ROOT, 'src', 'screens');
const themeTokenRe = new RegExp(`\\bv1Colors\\.(${THEME_KEYS.join('|')})\\b`, 'g');
const screenFiles = fs.readdirSync(SCREENS_DIR).filter((n) => n.endsWith('.js'));
for (const file of screenFiles) {
  if (SCREEN_WHITELIST.has(file)) continue;
  const src = fs.readFileSync(path.join(SCREENS_DIR, file), 'utf8');
  const hits = [...src.matchAll(themeTokenRe)];
  if (hits.length) {
    const sample = hits.slice(0, 3).map((h) => h[0]).join(', ');
    failures.push(`screens/${file}: ${hits.length} frozen theme reference(s) (${sample}${hits.length > 3 ? '…' : ''})`);
  }
}

// 5. P1 theme-consistency (25.08.2026): no screen/component may hardcode a
// LIGHT-only bg/text/border hex value — that's exactly how DealsScreen.js and
// CargoFeedScreen.js went dark-blind (`const PAGE_BG = '#F6F8F7'` instead of
// reading `theme.bg`). This is NOT a blanket #FFFFFF ban: white/near-black are
// still fine as semantic icon/button-text/brand colors. It only bans the
// specific hex values that ARE the light theme's bg/surface/text/border
// tokens (theme.js lightTheme + designV1.js LIGHT + brandV2.js), so a literal
// match means "this is the light surface color, hardcoded outside the theme
// system" — an unambiguous signal, not a heuristic guess.
const BANNED_LIGHT_HEX = [
  '#f6f8f7', // lightTheme.bg / designV1 LIGHT.bg / brandV2.surfaceSoft
  '#f0f4f2', // lightTheme.surfaceAlt / designV1 LIGHT.surfaceMuted / brandV2.surfaceMuted
  '#14221c', // lightTheme.text / designV1 LIGHT.text / brandV2.textPrimary
  '#3f5047', // lightTheme.textSecondary
  '#617067', // lightTheme.textMuted / designV1 LIGHT.textMuted / brandV2.textSecondary
  '#9aa8a0', // lightTheme.textDisabled
  '#e5ece8', // lightTheme.border/cardBorder / designV1 LIGHT.border / brandV2.border
  '#7c8b82', // designV1 LIGHT.textDim
  '#6b7a71', // designV1 LIGHT.placeholder / brandV2.textTertiary
];
// Definition files — these are ALLOWED (and expected) to contain the literal
// hex values above; everything else must read them through the theme hooks.
const THEME_DEFINITION_FILES = new Set([
  path.join(ROOT, 'src', 'utils', 'theme.js'),
  path.join(ROOT, 'src', 'theme', 'designV1.js'),
  path.join(ROOT, 'src', 'theme', 'brandV2.js'),
  path.join(ROOT, 'src', 'theme', 'designSystemV2.ts'),
  // Confirmed dead code (0 importers via grep, 25.08.2026 theme audit) — no
  // screen renders these, so they cannot produce a real light/dark mismatch.
  // Left unconverted rather than wiring up an unreachable component.
  path.join(ROOT, 'src', 'components', 'ui', 'AppShell.js'),
  path.join(ROOT, 'src', 'components', 'ui', 'SectionCard.js'),
  // Confirmed dead code (0 importers, master-audit 25.08.2026 + re-confirmed
  // during the P1-007 fix pass): superseded by a "V2" screen or removed from
  // the navigator, but not yet deleted from the tree.
  path.join(ROOT, 'src', 'screens', 'DealWorkspaceScreen.js'), // superseded by DealWorkspaceScreenV2.js
  path.join(ROOT, 'src', 'screens', 'QueueScreenLazy.js'), // superseded by QueueScreenLazyV2.js
  path.join(ROOT, 'src', 'screens', 'QueueScreenCarousel.js'), // 0 importers
  path.join(ROOT, 'src', 'screens', 'CargoDetail.js'), // superseded by CargoDetailV2.js (route "CargoDetail" now points at V2)
]);
// TruckTypeGrid.js's truck-type-picker cards are DELIBERATELY always white —
// an explicit owner reference-design decision (see the file's own top-of-file
// comment), not a missed theme hookup. This is the one legitimate exception
// to the pale-surface heuristic below; every other hit is a real bug.
const PALE_SURFACE_EXEMPT_FILES = new Set([
  path.join(ROOT, 'src', 'components', 'TruckTypeGrid.js'),
]);
const COLOR_PROP_HEX_RE = new RegExp(
  '\\b(backgroundColor|color|borderColor|borderTopColor|borderBottomColor|' +
  'borderLeftColor|borderRightColor|shadowColor|tintColor)\\s*:\\s*[\'"](#[0-9a-fA-F]{6})[\'"]',
  'g',
);
const CONST_HEX_RE = /\bconst\s+[A-Z][A-Z0-9_]*\s*=\s*['"](#[0-9a-fA-F]{6})['"]/g;

function walkJsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsFiles(full, out);
    else if (/\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const hardcodeTargets = [
  ...walkJsFiles(path.join(ROOT, 'src', 'screens')),
  ...walkJsFiles(path.join(ROOT, 'src', 'components')),
].filter((f) => !THEME_DEFINITION_FILES.has(f));

let hardcodeHitCount = 0;
for (const file of hardcodeTargets) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const found = new Set();
  for (const re of [COLOR_PROP_HEX_RE, CONST_HEX_RE]) {
    for (const match of src.matchAll(re)) {
      const hex = (match[2] || match[1]).toLowerCase();
      if (BANNED_LIGHT_HEX.includes(hex)) found.add(hex);
    }
  }
  if (found.size) {
    hardcodeHitCount += found.size;
    failures.push(`${rel}: hardcoded light-only theme hex ${[...found].join(', ')} — use theme.bg/text/border via useTheme()/useV1Colors() instead`);
  }
}

// 6. P1 audit fix (25.08.2026): section 5's exact-hex-match approach missed
// `#E9F6EF` in DealWorkspaceScreenV2.js — a hand-typed near-miss of the real
// soft-accent token (`theme.cardActive`/designV1's `driverSoft`, `#e8f6ef`/
// `#E8F6EF`) that isn't byte-identical to anything in BANNED_LIGHT_HEX, so it
// slipped straight through. That's the actual bug class: ANY hardcoded pale
// surface (backgroundColor/borderColor) is suspect, not just exact matches to
// today's known tokens — a future hand-typed pastel a shade off from the real
// token would slip past section 5 the same way. This section is deliberately
// NOT a blanket hex ban: it only inspects backgroundColor/border*Color
// (never `color`, so icon/button-text/brand colors are untouched), and only
// flags colors pale enough to read as a near-white/pastel *surface* — a
// perceived-lightness threshold, not a fixed list. Saturated semantic colors
// (success/warning/danger/brand accent) are not pale by construction and are
// unaffected; translucent rgba() overlays (the codebase's established pattern
// for theme-aware "frosted" surfaces, e.g. BottomNav.js) are a different,
// already-legitimate mechanism and are not solid hex, so they're untouched
// too. See PALE_SURFACE_EXEMPT_FILES above for the one deliberate exception.
const PALE_SURFACE_PROP_RE = /\b(backgroundColor|borderColor|borderTopColor|borderBottomColor|borderLeftColor|borderRightColor)\s*:\s*['"](#[0-9a-fA-F]{6})['"]/g;
const PALE_SURFACE_LIGHTNESS_THRESHOLD = 0.85; // calibrated: catches every
  // known-real hit (#E9F6EF≈0.939 down to TruckTypeGrid's exempted border
  // #E7E5E4≈0.899), well below pure white (1.0) and well above a card's
  // typical light-theme surface tint (theme.js's own lightTheme.card/border
  // sit around 0.90-0.94 too — which is exactly why files whose surfaces are
  // GENUINELY meant to be a fixed pale color, like TruckTypeGrid.js, need an
  // explicit exemption rather than a higher threshold: raising the threshold
  // to dodge them would just let the next hand-typed near-miss back in).
function perceivedLightness(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r + g + b) / 3 / 255;
}

const paleSurfaceTargets = hardcodeTargets.filter((f) => !PALE_SURFACE_EXEMPT_FILES.has(f));
let paleSurfaceHitCount = 0;
for (const file of paleSurfaceTargets) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const found = new Set();
  for (const match of src.matchAll(PALE_SURFACE_PROP_RE)) {
    const hex = match[2];
    if (perceivedLightness(hex) > PALE_SURFACE_LIGHTNESS_THRESHOLD) found.add(`${match[1]}:${hex}`);
  }
  if (found.size) {
    paleSurfaceHitCount += found.size;
    failures.push(`${rel}: hardcoded pale surface ${[...found].join(', ')} — likely light-only; read the equivalent theme.*/colors.* token at the JSX call site instead of a literal hex`);
  }
}

console.log(`[theme] frame components checked: ${FRAME_COMPONENTS.length}`);
console.log(`[theme] screens checked: ${screenFiles.length}`);
console.log(`[theme] hardcoded-light-hex scan: ${hardcodeTargets.length} files`);
console.log(`[theme] pale-surface heuristic scan: ${paleSurfaceTargets.length} files`);
console.log('[theme] ThemeContext runtime mode + persistence checked');
console.log('[theme] LIGHT/DARK token sets checked');

if (failures.length) {
  console.log('\n[theme] FAIL:');
  failures.forEach((f) => console.log('  -', f));
  process.exit(1);
}
console.log('\n[theme] OK');
