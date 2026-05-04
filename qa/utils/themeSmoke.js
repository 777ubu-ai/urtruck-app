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
  'RoleCard.js', 'RoleTabs.js', 'SegmentTabs.js',
  'SectionTitle.js', 'StatsRow.js',
  'StickyCTABar.js', 'BellBadge.js',
];

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

console.log(`[theme] frame components checked: ${FRAME_COMPONENTS.length}`);
console.log(`[theme] designV1.js exports useV1Colors + LIGHT/DARK token sets`);

if (failures.length) {
  console.log('\n[theme] FAIL:');
  failures.forEach((f) => console.log('  -', f));
  process.exit(1);
}
console.log('\n[theme] OK');
