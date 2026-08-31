// Theme smoke — static guard for light/dark architecture.
// It verifies that ThemeContext resolves the selected mode at runtime and that
// user-facing v1 surfaces consume `useV1Colors` rather than frozen light tokens.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DESIGN_V1 = path.join(ROOT, 'src', 'theme', 'designV1.js');
const THEME_CONTEXT = path.join(ROOT, 'src', 'utils', 'ThemeContext.js');
const THEME_RESOLVE = path.join(ROOT, 'src', 'utils', 'themeResolve.js');

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
// reconcile 01.09.2026 (§5): единственный резолвер теперь — resolveTheme()
// в themeResolve.js; ThemeContext.js его вызывает, а не дублирует логику
// инлайн. Смоук проверяет ОБЕ половины контракта: (а) ThemeContext реально
// зовёт resolveTheme, не второй независимый резолвер; (б) themeResolve.js
// сам умеет explicit dark и system-follow.
if (!/import\s*\{\s*resolveTheme\s*\}\s*from\s*['"]\.\/themeResolve['"]/.test(contextSrc)) {
  failures.push('ThemeContext does not import the single resolveTheme() source of truth');
}
if (!/resolveTheme\(themeMode,\s*systemDark\)/.test(contextSrc)) {
  failures.push('ThemeContext does not call resolveTheme() to derive isDark');
}
if (!/storage\.set\(KEY,\s*normalized\)/.test(contextSrc)) {
  failures.push('ThemeContext does not persist the selected theme');
}

const resolveSrc = fs.readFileSync(THEME_RESOLVE, 'utf8');
if (!/themeMode\s*===\s*['"]dark['"]/.test(resolveSrc)) {
  failures.push('themeResolve.js does not resolve explicit dark mode');
}
if (!/systemDark\s*\?\s*['"]dark['"]\s*:\s*['"]light['"]/.test(resolveSrc)) {
  failures.push('themeResolve.js does not fall back to systemDark for system/auto mode');
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

console.log(`[theme] frame components checked: ${FRAME_COMPONENTS.length}`);
console.log(`[theme] screens checked: ${screenFiles.length}`);
console.log('[theme] ThemeContext runtime mode + persistence checked');
console.log('[theme] LIGHT/DARK token sets checked');

if (failures.length) {
  console.log('\n[theme] FAIL:');
  failures.forEach((f) => console.log('  -', f));
  process.exit(1);
}
console.log('\n[theme] OK');
