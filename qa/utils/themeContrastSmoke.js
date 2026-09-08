// themeContrastSmoke — WCAG-контраст обеих тем (P1 theme fix 2026-08;
// re-wired Track B / B6 2026-09-08; text/non-text tokens split + fixed
// 2026-09-08, same Track B session, owner-approved policy below).
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
// Policy (owner-approved 2026-09-08): keep UrTruck's visual style — bright
// accent/warning colors stay bright for backgrounds, badges, borders and
// decorative/icon use, where the applicable bar is the WCAG 1.4.11
// non-text threshold (3:1). The SAME color used as small text must clear
// the stricter 1.4.3 normal-text threshold (4.5:1) — so where a color has
// both a text and a non-text real usage, there are two tokens
// (`error`/`errorText`, `accent`/`accentIcon`), not one value pulling
// double duty. See src/theme/brandV2.js and src/theme/designV1Palette.js
// for the reasoning behind each specific hex below.

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
  // warning is only ever used as small text (MyTripsScreen.js,
  // TrackTruckScreen.js) — no background/icon use exists to keep bright,
  // so it's held to the normal-text bar, not the graphic-element one.
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
  // `error`/`info` stay bright for their real non-text uses (RoleScreen.js
  // background badge, input-error borders in IdentityStepScreen/
  // VehicleDocsScreen/OtpV2Screen/PhoneV2Screen) — checked at the 3:1
  // non-text threshold against both real render surfaces they appear on.
  ['error as background badge/border on bg', brandLight.error, brandLight.bg, 3],
  ['error as background badge/border on surfaceMuted', brandLight.error, brandLight.surfaceMuted, 3],
  ['info as background/border on bg', brandLight.info, brandLight.bg, 3],
  // `errorText` is the only variant used as actual small text (registration/
  // onboarding error messages, typography.caption/bodySmall) — held to 4.5:1.
  ['errorText as small text on bg', brandLight.errorText, brandLight.bg, 4.5],
  // `infoText` has no live text consumer yet (grep for `brand.info`/
  // `brand.infoText` in src/ is empty) — a forward guard for if it's ever
  // used as text, not an active bug today.
  ['infoText as small text on bg (forward guard, no live consumer)', brandLight.infoText, brandLight.bg, 4.5],
  // `accent` stays bright for backgrounds/badges/decorative marks (logo,
  // route lines) — not held to any contrast bar here since it never
  // renders as a UI component boundary or icon on its own in the code we
  // could find; if that changes, test it like accentIcon below.
  // `accentIcon` is the variant used for a meaningful icon a user reads
  // (RoleScreen.js:151 `iconColor={brand.accentIcon}`) — real render
  // surface is `surfaceMuted` (RoleCard's icon chip background), checked
  // against both that and `bg` at the 3:1 non-text threshold.
  ['accentIcon on bg', brandLight.accentIcon, brandLight.bg, 3],
  ['accentIcon on surfaceMuted (real render surface)', brandLight.accentIcon, brandLight.surfaceMuted, 3],
]);

group('brandV2 DARK', [
  ['text on bg', brandDark.textPrimary, brandDark.bg, 4.5],
  ['secondary text on bg', brandDark.textSecondary, brandDark.bg, 4.5],
  ['white on primary CTA', brandDark.textOnPrimary, brandDark.primary, 4.5],
  ['error as background badge/border on bg', brandDark.error, brandDark.bg, 3],
  ['info as background/border on bg', brandDark.info, brandDark.bg, 3],
  ['errorText as small text on surface', brandDark.errorText, brandDark.surface, 4.5],
  ['infoText as small text on surface (forward guard)', brandDark.infoText, brandDark.surface, 4.5],
  ['accentIcon on bg', brandDark.accentIcon, brandDark.bg, 3],
  ['accentIcon on surfaceMuted', brandDark.accentIcon, brandDark.surfaceMuted, 3],
]);

console.log(fails === 0 ? '\n[theme-contrast] OK — designV1 + brandV2, both themes WCAG-clean' : `\n[theme-contrast] ${fails} FAILS`);
process.exit(fails === 0 ? 0 : 1);
