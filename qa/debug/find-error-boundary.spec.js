// Stage 29: heavy instrumentation hunt for the production
// "Что-то пошло не так" ErrorBoundary screen.
//
// Strategy:
//   1. For each viewport (iPhone 13, Pixel 7, 542×956, desktop
//      620×920) open https://urtruck.kz/?debug=1&v=80 with a
//      *fresh* context (no cookies, no storage, no service-worker
//      cache).
//   2. Hook every console message, page error, request failure,
//      and any 4xx/5xx response — keep the last 200 in a ring.
//   3. Walk a deterministic flow: home → role-driver → back →
//      role-client → back → role-login. Then bottom-nav routes
//      from a guest standpoint.
//   4. After every navigation step assert the page does NOT
//      contain the crash banner. If it does, dump everything
//      we have to qa/debug/dumps/<run>/<step>/.
//   5. Also reload the home page 10× back-to-back to catch
//      stale-bundle / cold-cache regressions.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'https://urtruck.kz/?debug=1&v=80';
const RUN_ID = `stage29-${Date.now()}`;
const DUMP_ROOT = path.join(__dirname, 'dumps', RUN_ID);
fs.mkdirSync(DUMP_ROOT, { recursive: true });

const VIEWPORTS = [
  { name: 'iphone-13',     width: 390, height: 844 },
  { name: 'pixel-7',       width: 412, height: 915 },
  { name: 'safari-narrow', width: 542, height: 956 },
  { name: 'desktop',       width: 620, height: 920 },
];

const CRASH_RE = /Что-то пошло не так|Произошла ошибка|Перезагрузить/i;

function attachCollectors(page) {
  const consoleMsgs = [];
  const pageErrors = [];
  const networkFails = [];
  const responses = []; // 4xx/5xx ring

  page.on('console', (m) => {
    consoleMsgs.push({ type: m.type(), text: m.text() });
    if (consoleMsgs.length > 400) consoleMsgs.shift();
  });
  page.on('pageerror', (e) => {
    pageErrors.push({ message: e.message, stack: e.stack });
  });
  page.on('requestfailed', (r) => {
    networkFails.push({ url: r.url(), error: r.failure()?.errorText || 'fail' });
  });
  page.on('response', async (r) => {
    if (r.status() >= 400) {
      responses.push({ status: r.status(), url: r.url() });
      if (responses.length > 200) responses.shift();
    }
  });

  return { consoleMsgs, pageErrors, networkFails, responses };
}

async function dump(page, collectors, viewport, step) {
  const dir = path.join(DUMP_ROOT, viewport, step);
  fs.mkdirSync(dir, { recursive: true });
  const safe = async (label, fn) => { try { return await fn(); } catch (e) { return `<error ${e.message}>`; } };
  const url = await safe('url', () => page.url());
  const html = await safe('content', () => page.content());
  const ls = await safe('localStorage', () => page.evaluate(() => {
    try { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = (localStorage.getItem(k) || '').slice(0, 500); } return o; } catch { return null; }
  }));
  await safe('shot', () => page.screenshot({ path: path.join(dir, 'screenshot.png'), fullPage: true }));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    url,
    consoleMsgs: collectors.consoleMsgs.slice(-200),
    pageErrors: collectors.pageErrors,
    networkFails: collectors.networkFails.slice(-100),
    responses4xx5xx: collectors.responses.slice(-100),
    localStorage: ls,
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'page.html'), typeof html === 'string' ? html.slice(0, 200000) : '');
  return dir;
}

async function step(page, collectors, viewport, label, action) {
  await action();
  await page.waitForTimeout(800);
  const body = await page.locator('body').innerText({ timeout: 6000 }).catch(() => '');
  if (CRASH_RE.test(body)) {
    const where = await dump(page, collectors, viewport, label);
    throw new Error(`CRASH BANNER at step "${label}" on ${viewport} — body[0:300]="${body.slice(0,300).replace(/\n/g,' ')}" — dump=${where}`);
  }
}

for (const vp of VIEWPORTS) {
  test(`crash hunt · ${vp.name}`, async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      // Stage 29: fresh storage every time so we cover the
      // "cold-cache new visitor" path the owner is most likely
      // hitting on his Mac/Android.
    });
    // Tracing already enabled via playwright.debug.config.js (trace:'on');
    // do not call ctx.tracing.start() again — Playwright would throw
    // "Tracing has been already started".
    const page = await ctx.newPage();
    const collectors = attachCollectors(page);

    let failed = false;
    try {
      // 1. Cold open
      await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await step(page, collectors, vp.name, '01-cold-open', async () => {});

      // 2. Wipe storage + reload
      await page.evaluate(() => {
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
        if ('caches' in window) {
          caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).catch(() => {});
        }
        if (navigator.serviceWorker) {
          navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
        }
      });
      await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
      await step(page, collectors, vp.name, '02-after-storage-clear', async () => {});

      // 3. Click role-driver
      await step(page, collectors, vp.name, '03-tap-driver', async () => {
        const el = page.getByTestId('role-driver').first();
        if (await el.count()) await el.click({ trial: false }).catch(() => {});
      });

      // 4. Back to home
      await step(page, collectors, vp.name, '04-back-home', async () => {
        await page.goto(BASE, { waitUntil: 'networkidle' }).catch(() => {});
      });

      // 5. Click role-client
      await step(page, collectors, vp.name, '05-tap-client', async () => {
        const el = page.getByTestId('role-client').first();
        if (await el.count()) await el.click().catch(() => {});
      });

      // 6. Back home → role-login
      await step(page, collectors, vp.name, '06-back-home-2', async () => {
        await page.goto(BASE, { waitUntil: 'networkidle' }).catch(() => {});
      });
      await step(page, collectors, vp.name, '07-tap-login', async () => {
        const el = page.getByTestId('role-login').first();
        if (await el.count()) await el.click().catch(() => {});
      });

      // 7. Reload 10× cold
      for (let i = 1; i <= 10; i++) {
        await page.goto(BASE, { waitUntil: 'networkidle' }).catch(() => {});
        await step(page, collectors, vp.name, `08-reload-${String(i).padStart(2, '0')}`, async () => {});
      }

      // 8. Static-route smoke as guest
      for (const route of ['/role', '/cargos', '/trips', '/profile', '/chats', '/create-cargo', '/create-trip']) {
        await step(page, collectors, vp.name, `09-route${route.replace(/\//g, '-')}`, async () => {
          await page.goto(`https://urtruck.kz${route}?debug=1`, { waitUntil: 'networkidle' }).catch(() => {});
        });
      }
      // Final ok dump (so we have a baseline screenshot too)
      await dump(page, collectors, vp.name, 'zz-final-ok');
    } catch (e) {
      failed = true;
      // re-throw after trace stop so report contains everything
      // tracing.stop() handled by Playwright config — skipped.
      throw e;
    }
    if (!failed) {
      // tracing.stop() handled by Playwright config — skipped.
    }
    await ctx.close();
  });
}
