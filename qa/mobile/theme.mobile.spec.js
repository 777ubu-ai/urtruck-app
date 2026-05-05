// Mobile lane — theme contract. Stage 14.
//
// We don't try to flip the theme through the UI here (that lives
// behind auth — outside Stage 5/6/7 scope). Instead we sanity-check
// that the rendered body has a real background colour and readable
// text contrast on the mobile viewport, plus that the bundle
// honours the dark-by-default palette without a flash of white.

const { test } = require('@playwright/test');
const { log } = require('../utils/qaReport');
const { gotoLanding } = require('./_helpers');

const ACTOR = 'agent-mobile-theme';

function rgbToLuminance(rgb) {
  // rgb in form "rgb(r, g, b)" or "rgba(r, g, b, a)"
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(String(rgb || ''));
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  // Rec. 709 luma — quick brightness proxy.
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

test('Mobile · landing background respects dark default', async ({ page }) => {
  await gotoLanding(page);
  const bg = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="root"]') || document.body;
    return getComputedStyle(el).backgroundColor;
  });
  const lum = rgbToLuminance(bg);
  if (lum === null) {
    log.p2(ACTOR, 'landing-bg-detectable', `cannot parse bg=${bg}`);
    return;
  }
  if (lum < 0.4) {
    log.pass(ACTOR, 'landing-bg-dark', `lum=${lum.toFixed(2)} bg=${bg}`);
  } else {
    log.p1(ACTOR, 'landing-bg-dark', `landing bg too bright (lum=${lum.toFixed(2)} bg=${bg}) — flash of white?`);
  }
});

test('Mobile · text contrast against background is readable', async ({ page }) => {
  await gotoLanding(page);
  // Grab the first sizeable on-screen text node and compare its
  // computed colour against the body background.
  const result = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('div,span,p,h1,h2,h3,h4'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 50 && r.height > 12 && el.innerText && el.innerText.trim().length > 4;
      })
      .slice(0, 20);
    return candidates.map((el) => ({
      text: (el.innerText || '').slice(0, 40),
      color: getComputedStyle(el).color,
      bg: getComputedStyle(el).backgroundColor,
    }));
  });
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bodyLum = rgbToLuminance(bodyBg);
  let lowContrast = 0;
  for (const c of result) {
    const colorLum = rgbToLuminance(c.color);
    if (colorLum === null) continue;
    if (Math.abs(colorLum - (bodyLum ?? 0.5)) < 0.15) lowContrast += 1;
  }
  if (lowContrast > 5) {
    log.p1(ACTOR, 'text-contrast-readable', `${lowContrast}/${result.length} samples low-contrast against body bg`);
  } else {
    log.pass(ACTOR, 'text-contrast-readable', `${result.length - lowContrast}/${result.length} OK`);
  }
});
