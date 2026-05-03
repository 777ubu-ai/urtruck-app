// Render any SVG in this folder to a PNG of exact viewBox size using
// Playwright's headless Chromium. Run as `node web/share/_render.js`.
//
// Why Playwright and not rsvg-convert / Pillow / etc.: those aren't always
// installed on dev machines, but Playwright already is (devDependencies).
// Quality is the same — Chromium's SVG renderer handles emojis and gradients
// without surprises.

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const HERE = path.resolve(__dirname);
const TARGETS = [
  { svg: 'og-default.svg', png: 'og-default.png' },
];

(async () => {
  const browser = await chromium.launch();
  for (const { svg, png } of TARGETS) {
    const src = path.join(HERE, svg);
    const out = path.join(HERE, png);
    if (!fs.existsSync(src)) {
      console.log(`[skip] ${svg} missing`);
      continue;
    }
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const html = `<!doctype html><html><head><style>
      html,body{margin:0;padding:0;background:transparent;}
      svg{display:block;width:1200px;height:630px;}
    </style></head><body>${fs.readFileSync(src, 'utf8')}</body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
    await ctx.close();
    console.log(`[ok] ${png}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
