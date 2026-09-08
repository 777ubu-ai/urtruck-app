// P1 remediation (physical QA 08.09.2026, fix/urtruck-design-system-2026):
// pre-auth screens (Phone/OTP auth, Role selection, country picker) must
// render in the LIGHT palette unconditionally, independent of OS dark
// mode, the user's manual theme choice, or `themeMode: 'system'`.
//
// ROOT CAUSE this guards against: theme/brandV2.js exports two things with
// similar names but very different behavior —
//   `brand`     — a Proxy that resolves every property against a
//                 MODULE-LEVEL MUTABLE `_isDark` flag, set as a side effect
//                 of ANY other screen calling `useBrand()` during render.
//   `brandLight`— a plain, static, always-light object.
// These pre-auth screens imported the reactive `brand`/`useBrand()` pair
// instead of the static `brandLight`. Since `_isDark` is shared app-wide
// state (not reset when navigating to a pre-auth screen), a screen would
// render in DARK colors whenever: the OS/system theme is dark, the user
// manually selected dark mode before logging out, or a themed
// guest-browsing screen rendered earlier in the same session and left
// `_isDark` set to true. This is exactly the class of defect a naive
// "does the file import brandV2 at all" test would miss — it must assert
// which of the two exports is used.
//
// SCOPE: OnboardingV2Screen.js, RoleScreenV2.js and ProfileV2Screen.js are
// explicitly excluded — see the comment on PRE_AUTH_SCREENS below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// NOTE: OnboardingV2Screen.js, RoleScreenV2.js and ProfileV2Screen.js are
// deliberately NOT in this list. A proven, dated, tested product decision
// (commit 9147d456 "fix: restore theme-aware onboarding checkpoint",
// 2026-09-03, plus tests/frontend/test_post_acceptance_fixes.mjs's
// "onboarding remains theme-aware..." and
// tests/frontend/test_onboarding_profile_2step.mjs's "profile uses runtime
// brand theme..." tests) requires those three screens to stay
// theme-reactive (useBrand()), directly contradicting this task's "always
// light" instruction for them specifically. This is reported as
// BLOCKED — OWNER DECISION REQUIRED rather than resolved unilaterally in
// either direction — see the final remediation report. The four screens
// below have no such conflicting contract and were fixed without reservation.
const PRE_AUTH_SCREENS = [
  'src/screens/onboarding/OtpV2Screen.js',
  'src/screens/onboarding/PhoneV2Screen.js',
  'src/screens/onboarding/CountryPickerSheet.js',
  'src/screens/RoleScreen.js',
];

for (const path of PRE_AUTH_SCREENS) {
  test(`${path}: imports the static light palette, not the theme-reactive one`, () => {
    const src = readFileSync(path, 'utf8');

    // Every top-level `from '.../brandV2'` import must name brandLight and
    // must NOT name the bare reactive `brand` export.
    const importLines = src
      .split('\n')
      .filter((line) => /from ['"].*brandV2['"]/.test(line));
    assert.ok(importLines.length >= 1, `${path} must import from theme/brandV2`);
    for (const line of importLines) {
      assert.match(line, /\bbrandLight\b/, `${path}: import line must include brandLight: ${line}`);
      // A bare `brand` import (not part of `brandLight`) would re-introduce
      // the theme-reactive Proxy. Strip `brandLight` occurrences first so
      // this check can't false-positive on the substring "brand" inside it.
      const withoutBrandLight = line.replace(/\bbrandLight\b/g, '');
      assert.doesNotMatch(
        withoutBrandLight,
        /\bbrand\b/,
        `${path}: must not import the reactive 'brand' export: ${line}`,
      );
      assert.doesNotMatch(
        withoutBrandLight,
        /\buseBrand\b/,
        `${path}: must not import 'useBrand' (it mutates the shared _isDark flag as a side effect): ${line}`,
      );
    }

    // No call site anywhere in the file may invoke useBrand().
    assert.doesNotMatch(src, /useBrand\s*\(/, `${path}: must not call useBrand()`);

    // Every `brand.<token>` access OUTSIDE a `makeStyles(brand) => ...`
    // helper (where `brand` is a locally shadowed, theme-agnostic
    // parameter, not the module-level reactive export) must be
    // `brandLight.<token>` instead.
    const makeStylesIdx = src.search(/^const makeStyles = \(brand\b/m);
    const bodyEnd = makeStylesIdx >= 0 ? makeStylesIdx : src.length;
    const componentBody = src.slice(0, bodyEnd);
    assert.doesNotMatch(
      componentBody,
      /(?<!\.)\bbrand\./,
      `${path}: component body must read brandLight.<token>, not the reactive brand.<token>, outside makeStyles()`,
    );
  });
}
