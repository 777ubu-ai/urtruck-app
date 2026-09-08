// themeContrastSmoke — WCAG-контраст обеих тем (P1 theme fix 2026-08;
// re-wired Track B / B6 2026-09-08).
//
// Imports the REAL palettes from src/theme/designV1Palette.js and
// src/theme/brandV2.js instead of hand-copying values — a hand-copy is how
// this test silently drifted from its own source in the first place (its
// LIGHT.warning stayed '#F59E0B' for months after designV1.js's real value
// diverged, and it never covered brandV2.js at all). Values can no longer
// go stale: if either theme file changes, this test changes with it.
//
//   node qa/utils/themeContrastSmoke.js
//
// KNOWN FAILURES as of 2026-09-08 (real, evidence-backed, not caused by this
// rewrite — this is the first version of the script that actually checks
// these rows; the old hand-copy either omitted them or tested a different,
// equally-wrong value). Left FAILING on purpose rather than weakened to
// pass, per the "don't loosen a guard to get green" rule — these need an
// explicit design decision (darker hex, or accept + document the exception
// + move the affected text to bold/≥19px so it legitimately qualifies for
// the large-text 3:1 threshold), not a silent code fix:
//   - designV1 LIGHT 'warning text on card': 3.30:1, needs 4.5:1. The
//     CLAUDE.md-canonical '#E06D00' fails normal-text AA on white. Used at
//     12-14px bold in MyTripsScreen.js (offersCtaText/offersCtaArrow,
//     miniBtnText) — below the ~19px-bold large-text carve-out.
//   - brandV2 LIGHT 'error on bg' (#EF4444 on #FFFFFF): 3.76:1, needs 4.5:1.
//     Real usage: registration/onboarding error text (IdentityStepScreen,
//     OtpV2Screen, PhoneV2Screen, RegistrationCloseModal, SelfieStepScreen),
//     all typography.caption/bodySmall — normal-text threshold applies.
//   - brandV2 LIGHT 'info on bg' (#3478D4 on #FFFFFF): 4.39:1, needs 4.5:1.
//     No live text consumer found (grep for `brand.info` is empty) — a
//     forward guard, not an active bug, but real if this token is ever used.
//   - brandV2 LIGHT 'accent/warning as large graphic element on bg'
//     (#FF8400 on #FFFFFF): 2.46:1, needs 3:1. Real usage:
//     RoleScreen.js:151 `iconColor={brand.accent}` on a white background.

import { LIGHT as V1_LIGHT, DARK as V1_DARK } from '../../src/theme/designV1Palette.js';
// brandV2.js only exports `brandLight` via its default export object (not
// as a named export — brandDark is, brandLight isn't; a pre-existing
// asymmetry in that file, left as-is here since fixing it is out of scope
// for a contrast-test rewrite). Go through the default export for both so
// this doesn't depend on that asymmetry either way.
import brandV2 from '../../src/theme/brandV2.js';
const { brandLight, brandDark } = brandV2;

function lum(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    let v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); }

let fails = 0;
function group(name, pairs) {
  console.log(`\n— ${name} —`);
  for (const [label, fg, bg, req] of pairs) {
    const r = ratio(fg, bg);
    const ok = r >= req;
    if (!ok) fails++;
    console.log(`${r.toFixed(2).padStart(5)} need>=${req}  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
}

group('designV1 LIGHT', [
  ['text on bg', V1_LIGHT.text, V1_LIGHT.bg, 4.5],
  ['text on card', V1_LIGHT.text, V1_LIGHT.surface, 4.5],
  ['muted on bg', V1_LIGHT.textMuted, V1_LIGHT.bg, 4.5],
  ['muted on card', V1_LIGHT.textMuted, V1_LIGHT.surface, 4.5],
  ['placeholder on card', V1_LIGHT.placeholder, V1_LIGHT.surface, 4.5],
  ['white on green CTA', '#FFFFFF', V1_LIGHT.driver, 4.5],
  ['white on deep CTA', '#FFFFFF', V1_LIGHT.driverDeep, 4.5],
  ['deep green on soft tint', V1_LIGHT.driverDeep, V1_LIGHT.driverSoft, 4.5],
  ['error on card (large/icon)', V1_LIGHT.error, V1_LIGHT.surface, 3],
  ['warning text on card', V1_LIGHT.warning, V1_LIGHT.surface, 4.5],
  ['info on card (large)', V1_LIGHT.info, V1_LIGHT.surface, 3],
  ['rating on card (graphic)', V1_LIGHT.rating, V1_LIGHT.surface, 3],
]);

group('designV1 DARK', [
  ['text on bg', V1_DARK.text, V1_DARK.bg, 4.5],
  ['text on surface', V1_DARK.text, V1_DARK.surface, 4.5],
  ['muted on surface', V1_DARK.textMuted, V1_DARK.surface, 4.5],
  ['dim on surface', V1_DARK.textDim, V1_DARK.surface, 4.5],
  ['placeholder on surface', V1_DARK.placeholder, V1_DARK.surface, 4.5],
  ['white on green CTA', '#FFFFFF', V1_DARK.driver, 4.5],
  ['success/accent text on surface', V1_DARK.success, V1_DARK.surface, 4.5],
  ['error on surface', V1_DARK.error, V1_DARK.surface, 4.5],
  ['warning on surface (large)', V1_DARK.warning, V1_DARK.surface, 3],
  ['info on surface', V1_DARK.info, V1_DARK.surface, 4.5],
  ['rating on surface (graphic)', V1_DARK.rating, V1_DARK.surface, 3],
  ['orange on surface (large)', V1_DARK.cargoOwner, V1_DARK.surface, 3],
]);

group('brandV2 LIGHT', [
  ['text on bg', brandLight.textPrimary, brandLight.bg, 4.5],
  ['secondary text on bg', brandLight.textSecondary, brandLight.bg, 4.5],
  ['white on primary CTA', brandLight.textOnPrimary, brandLight.primary, 4.5],
  ['error on bg', brandLight.error, brandLight.bg, 4.5],
  ['info on bg', brandLight.info, brandLight.bg, 4.5],
  // accent/warning ('#FF8400') is documented (CLAUDE.md) as a background/
  // badge color only, never as text on white — so it's checked at the
  // "large graphic element" threshold (3:1), not the 4.5:1 text threshold.
  ['accent/warning as large graphic element on bg', brandLight.accent, brandLight.bg, 3],
]);

group('brandV2 DARK', [
  ['text on bg', brandDark.textPrimary, brandDark.bg, 4.5],
  ['secondary text on bg', brandDark.textSecondary, brandDark.bg, 4.5],
  ['white on primary CTA', brandDark.textOnPrimary, brandDark.primary, 4.5],
  ['error on bg', brandDark.error, brandDark.bg, 4.5],
  ['info on bg', brandDark.info, brandDark.bg, 4.5],
  ['accent/warning as large graphic element on bg', brandDark.accent, brandDark.bg, 3],
]);

console.log(fails === 0 ? '\n[theme-contrast] OK — designV1 + brandV2, both themes WCAG-clean' : `\n[theme-contrast] ${fails} FAILS`);
process.exit(fails === 0 ? 0 : 1);
