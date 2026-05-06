const { chromium } = require('playwright');

(async () => {
  const errors = [];
  const consoleErrors = [];
  const networkErrors = [];

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') {
      consoleErrors.push(`[${m.type()}] ${m.text()}`);
    }
  });
  page.on('pageerror', e => errors.push(`PAGEERROR ${e.message}\n${e.stack}`));
  page.on('requestfailed', r => networkErrors.push(`${r.failure()?.errorText || 'fail'} ${r.url()}`));
  page.on('response', r => {
    if (r.status() >= 400 && r.url().includes('urtruck.kz')) {
      networkErrors.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });

  const checkCrash = async (label) => {
    const body = await page.locator('body').innerText({ timeout: 4000 }).catch(() => '');
    const crashed = /Что-то пошло не так|Произошла ошибка/i.test(body);
    console.log(`[${label}] crashed=${crashed} body[0:200]="${body.slice(0,200).replace(/\n/g,' ')}"`);
    return crashed;
  };

  console.log('=== HOME (cold) ===');
  await page.goto('https://urtruck.kz/', { waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('goto:', e.message));
  await page.waitForTimeout(2000);
  await checkCrash('home');

  console.log('=== TAP role-driver ===');
  await page.getByTestId('role-driver').click({ timeout: 5000 }).catch(e => console.log('tap-driver:', e.message));
  await page.waitForTimeout(2500);
  await checkCrash('after-driver');

  console.log('=== back to home ===');
  await page.goto('https://urtruck.kz/', { waitUntil: 'networkidle' }).catch(()=>{});
  await page.waitForTimeout(1500);

  console.log('=== TAP role-client ===');
  await page.getByTestId('role-client').click({ timeout: 5000 }).catch(e => console.log('tap-client:', e.message));
  await page.waitForTimeout(2500);
  await checkCrash('after-client');

  console.log('=== TAP role-login ===');
  await page.goto('https://urtruck.kz/', { waitUntil: 'networkidle' }).catch(()=>{});
  await page.waitForTimeout(1500);
  await page.getByTestId('role-login').click({ timeout: 5000 }).catch(e => console.log('tap-login:', e.message));
  await page.waitForTimeout(2500);
  await checkCrash('after-login');

  console.log('\n=== PAGE ERRORS (' + errors.length + ') ===');
  errors.slice(0,10).forEach(e => console.log(e));
  console.log('\n=== CONSOLE ERRORS (' + consoleErrors.length + ') ===');
  consoleErrors.slice(0,15).forEach(e => console.log(e));
  console.log('\n=== NETWORK FAIL (' + networkErrors.length + ') ===');
  networkErrors.slice(0,15).forEach(e => console.log(e));

  await browser.close();
})();
