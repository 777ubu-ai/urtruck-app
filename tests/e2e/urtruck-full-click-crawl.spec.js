/**
 * Safe full-app click crawl.
 *
 * Walks through every public screen of the deployed app and:
 *   - asserts the screen rendered visible content
 *   - asserts no error overlay (RU/EN/CN/KZ)
 *   - collects console-error and HTTP 5xx network errors and fails if any
 *   - clicks ONLY navigation / open-modal / close-modal buttons; intentionally
 *     never triggers destructive actions (publish, send, accept, reject,
 *     cancel, save, delete, mark delivered…)
 *
 * Default target is the live site. Override with E2E_BASE_URL.
 *   E2E_BASE_URL=https://urtruck.kz npx playwright test tests/e2e/urtruck-full-click-crawl.spec.js
 */
const { test, expect } = require('@playwright/test');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz').replace(/\/$/, '');

const ERROR_OVERLAY_RE = /Что-то пошло не так|Something went wrong|发生错误|Қате орын алды|Бір нәрсе дұрыс болмады/;

// Console / network noise we explicitly ignore.
const CONSOLE_IGNORE = [
  /favicon/i,
  /webpush|service\s*worker/i,
  /Manifest:/i,                  // PWA manifest icon warnings
  /sw\.js.*404/i,
  /the resource.*was preloaded/i,
  /Download the React DevTools/i,
  /\bMixedContent\b/i,
  // Local python http.server-only noise: it returns 404 for missing files
  // (manifest.json, sw.js) and 501 for POST. nginx in prod serves all of
  // these correctly, so these messages are not real product bugs.
  /Failed to load resource.*404 \(File not found\)/i,
  /Failed to load resource.*501 \(Unsupported method/i,
];
const NETWORK_IGNORE_PATHS = [
  /\/sw\.js$/, /favicon/, /\/manifest\.json$/,
];

// Destructive button labels (RU/EN/CN/KZ). Skipping clicks on these.
const DESTRUCTIVE_RE = new RegExp(
  [
    'Принять', 'Отклонить', 'Отозвать', 'Отменить', 'Удалить',
    'Опубликовать', 'Отправить', 'Сохранить', 'Подтвердить',
    'Подтвердить доставку', 'Начать перевозку', 'Я доехал',
    'Дать скидку', 'Отправить ставку', 'Отправить скидку', 'Отправить встречную',
    'Принять встречную', 'Отклонить встречную',
    'Accept', 'Reject', 'Cancel', 'Delete', 'Publish', 'Send',
    'Save', 'Confirm', 'Start delivery', 'Mark', 'Submit',
    '接受', '拒绝', '取消', '删除', '发布', '发送', '保存', '确认',
    'Қабылдау', 'Бас тарту', 'Жою', 'Жариялау', 'Жіберу', 'Сақтау',
  ].join('|'),
);

function logCollectors(page) {
  const consoleErrors = [];
  const networkErrors = [];
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const txt = msg.text();
    if (CONSOLE_IGNORE.some(rx => rx.test(txt))) return;
    consoleErrors.push(txt);
  });
  page.on('response', r => {
    if (r.status() < 500) return;
    if (NETWORK_IGNORE_PATHS.some(rx => rx.test(r.url()))) return;
    // 501 = "Not Implemented", emitted only by local python http.server when
    // it sees a POST/PATCH it doesn't proxy. nginx in prod never returns 501
    // for our endpoints. Keep it out of the prod-targeted assertion.
    if (r.status() === 501) return;
    networkErrors.push(`${r.status()} ${r.url()}`);
  });
  return { consoleErrors, networkErrors };
}

async function bodyText(page) {
  return await page.locator('body').innerText();
}

async function assertHealthy(page, where) {
  const txt = await bodyText(page);
  expect(txt.length, `${where}: body looks empty`).toBeGreaterThan(40);
  expect(txt, `${where}: error overlay shown`).not.toMatch(ERROR_OVERLAY_RE);
}

async function safeClickByText(page, regex, { timeout = 4000 } = {}) {
  const el = page.getByText(regex).first();
  if (!(await el.isVisible().catch(() => false))) return false;
  const txt = (await el.innerText().catch(() => '')) || '';
  if (DESTRUCTIVE_RE.test(txt)) {
    return 'skipped-destructive';
  }
  await el.click({ timeout }).catch(() => {});
  await page.waitForTimeout(900);
  return true;
}

async function enterAsRole(page, role = 'driver') {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  const re = role === 'driver'
    ? /Я водитель|I'm a driver|我是司机|Мен жүргізушімін|Я перевозчик|carrier/i
    : /Я грузовладелец|Я грузоотправитель|shipper|货主|жүк иесі/i;
  const btn = page.getByText(re).first();
  await btn.waitFor({ timeout: 10000 });
  await btn.click();
  await page.waitForTimeout(2000);
}

test.describe('Full app click crawl (safe / non-destructive)', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
  test.setTimeout(180_000);

  test('driver crawl: feed → details → my work tabs → profile sub-screens', async ({ page }) => {
    const { consoleErrors, networkErrors } = logCollectors(page);
    const visited = [];
    const clicked = [];
    const skipped = [];

    // ── 1. open ─────────────────────────────────────────────────────────
    await page.goto(BASE + '/?v=full-crawl', { waitUntil: 'networkidle' });
    await assertHealthy(page, 'splash');
    visited.push('Splash/Onboarding/RoleScreen');

    // ── 2. enter as driver ──────────────────────────────────────────────
    await enterAsRole(page, 'driver');
    await assertHealthy(page, 'feed');
    visited.push('Feed (driver)');

    // ── 3. open filter modal (non-destructive) ──────────────────────────
    const filterBtn = page.locator('button').filter({ hasText: '⚙' }).first();
    if (await filterBtn.isVisible().catch(() => false)) {
      await filterBtn.click();
      await page.waitForTimeout(700);
      clicked.push('Feed: filter modal open');
      const filterBody = await bodyText(page);
      expect(filterBody, 'filter modal: error overlay').not.toMatch(ERROR_OVERLAY_RE);
      visited.push('Filter modal');
      // Reset is not destructive (just clears local state). Apply just closes the sheet.
      const reset = page.getByText(/Сбросить|Reset|重置|Тазалау/).first();
      if (await reset.isVisible().catch(() => false)) {
        await reset.click().catch(() => {});
        clicked.push('Filter modal: Reset');
      }
      const apply = page.getByText(/Применить|Apply|确定|Қолдану/).first();
      if (await apply.isVisible().catch(() => false)) {
        await apply.click().catch(() => {});
        clicked.push('Filter modal: Apply');
      }
      await page.waitForTimeout(700);
    }

    // ── 4. open first cargo / trip / driver card on feed → CargoDetail or
    //       DriverDetail or TripDetail ───────────────────────────────────
    // RN-web cards have no roles, so we navigate by visible price text $...
    const card = page.locator('text=/\\$\\d{2,}/').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await assertHealthy(page, 'first card detail');
      visited.push('First card detail (CargoDetail/DriverDetail/TripDetail)');
      // Walk back.
      const back = page.getByText(/^‹$/).first();
      if (await back.isVisible().catch(() => false)) {
        await back.click().catch(() => {});
        clicked.push('Detail: back');
        await page.waitForTimeout(800);
      } else {
        await page.goBack().catch(() => {});
      }
    }

    // ── 5. My Work tab (bottom nav) ─────────────────────────────────────
    const myWorkTab = page.getByText(/Моя работа|My work|我的工作|Менің жұмысым/).first();
    if (await myWorkTab.isVisible().catch(() => false)) {
      await myWorkTab.click();
      await page.waitForTimeout(1200);
      await assertHealthy(page, 'My Work landing');
      visited.push('My Work / MyTripsScreen');
    }

    // 5a. tab "my" (My trips / My cargos)
    const myTab = page.locator('[testid="my-work-tab-my"], [data-testid="my-work-tab-my"]').first();
    if (await myTab.isVisible().catch(() => false)) {
      await myTab.click();
      await page.waitForTimeout(800);
      await assertHealthy(page, 'My Work: my-tab');
      visited.push('My Work: my-tab');
      clicked.push('Tab: my');
    }
    // 5b. tab "bids" (Мои ставки / Отклики)
    const bidsTab = page.locator('[testid="my-work-tab-bids"], [data-testid="my-work-tab-bids"]').first();
    if (await bidsTab.isVisible().catch(() => false)) {
      await bidsTab.click();
      await page.waitForTimeout(800);
      await assertHealthy(page, 'My Work: bids-tab');
      visited.push('My Work: bids-tab');
      clicked.push('Tab: bids');
    }
    // 5c. tab "orders"
    const ordersTab = page.locator('[testid="my-work-tab-orders"], [data-testid="my-work-tab-orders"]').first();
    if (await ordersTab.isVisible().catch(() => false)) {
      await ordersTab.click();
      await page.waitForTimeout(800);
      await assertHealthy(page, 'My Work: orders-tab');
      visited.push('My Work: orders-tab');
      clicked.push('Tab: orders');
      // Inside Orders tab, destructive CTA may be visible: assert visibility
      // only, do not click.
      for (const label of ['Начать перевозку', 'Подтвердить доставку', 'Отменить сделку', 'Я доехал']) {
        const btn = page.getByText(label).first();
        if (await btn.isVisible().catch(() => false)) {
          skipped.push('Orders CTA visible (not clicked): ' + label);
        }
      }
    }
    // Walk back to MainTabs.
    const backFromMyTrips = page.getByText(/^‹$/).first();
    if (await backFromMyTrips.isVisible().catch(() => false)) {
      await backFromMyTrips.click().catch(() => {});
      await page.waitForTimeout(700);
    }

    // ── 6. Profile tab ──────────────────────────────────────────────────
    const profileTab = page.getByText(/Профиль|Profile|个人资料/).first();
    if (await profileTab.isVisible().catch(() => false)) {
      await profileTab.click();
      await page.waitForTimeout(1200);
      await assertHealthy(page, 'Profile');
      visited.push('Profile');
      clicked.push('Tab: profile');
    }

    // 6a. Chats from Profile menu
    const chatsLink = page.getByText(/Чаты|Chats|聊天/).first();
    if (await chatsLink.isVisible().catch(() => false)) {
      await chatsLink.click();
      await page.waitForTimeout(1200);
      await assertHealthy(page, 'ChatsList');
      visited.push('ChatsList');
      clicked.push('Profile → Chats');
      const back = page.getByText(/^‹$/).first();
      if (await back.isVisible().catch(() => false)) await back.click().catch(() => {});
      await page.waitForTimeout(700);
    }

    // 6b. Reviews
    const reviewsLink = page.getByText(/Мои отзывы|My reviews|All reviews|评价|Менің пікірлерім/i).first();
    if (await reviewsLink.isVisible().catch(() => false)) {
      await reviewsLink.click();
      await page.waitForTimeout(1200);
      await assertHealthy(page, 'Reviews');
      visited.push('Reviews');
      clicked.push('Profile → Reviews');
      const back = page.getByText(/^‹$/).first();
      if (await back.isVisible().catch(() => false)) await back.click().catch(() => {});
      await page.waitForTimeout(700);
    }

    // 6c. Edit profile
    const editLink = page.getByText(/Редактировать профиль|Edit profile|编辑资料|Профильді өзгерту/i).first();
    if (await editLink.isVisible().catch(() => false)) {
      await editLink.click();
      await page.waitForTimeout(1200);
      await assertHealthy(page, 'EditProfile');
      visited.push('EditProfile');
      clicked.push('Profile → Edit profile');
      // Save / submit on EditProfile is destructive — only assert visibility.
      const save = page.getByText(/Сохранить|Save|保存|Сақтау/i).first();
      if (await save.isVisible().catch(() => false)) {
        skipped.push('EditProfile: Save visible (not clicked)');
      }
      const back = page.getByText(/^‹$/).first();
      if (await back.isVisible().catch(() => false)) await back.click().catch(() => {});
      await page.waitForTimeout(700);
    }

    // 6d. PushFilter screen via "🔔 …"
    const pushFilterLink = page.getByText(/🔔/i).first();
    if (await pushFilterLink.isVisible().catch(() => false)) {
      await pushFilterLink.click().catch(() => {});
      await page.waitForTimeout(1200);
      const txt = await bodyText(page);
      // Either we landed on PushFilterScreen or we stayed put — both fine.
      expect(txt, 'PushFilter screen overlay').not.toMatch(ERROR_OVERLAY_RE);
      // Save settings is destructive.
      const saveSettings = page.getByText(/Сохранить настройки|Save settings|保存设置|Параметрлерді сақтау/i).first();
      if (await saveSettings.isVisible().catch(() => false)) {
        visited.push('PushFilter');
        skipped.push('PushFilter: Save settings visible (not clicked)');
      }
      const back = page.getByText(/^‹$/).first();
      if (await back.isVisible().catch(() => false)) await back.click().catch(() => {});
      await page.waitForTimeout(700);
    }

    // 6e. Language switch (visible flag chips on Profile). Click each but
    //     immediately switch back to RU to keep assertions stable.
    for (const flag of ['🇬🇧', '🇨🇳', '🇰🇿', '🇷🇺']) {
      const langChip = page.getByText(flag).first();
      if (await langChip.isVisible().catch(() => false)) {
        await langChip.click().catch(() => {});
        await page.waitForTimeout(500);
        clicked.push('Language: ' + flag);
      }
    }

    // ── 7. Back to Feed via tab ─────────────────────────────────────────
    const feedTab = page.getByText(/Грузы|Cargos|货物|Жүктер/).first();
    if (await feedTab.isVisible().catch(() => false)) {
      await feedTab.click();
      await page.waitForTimeout(1000);
      await assertHealthy(page, 'Feed (post-crawl)');
    }

    // ── final assertions on collected diagnostics ──────────────────────
    // Pretty summary first so a failure shows what we crawled.
    console.log('VISITED ('+visited.length+'):\n  - ' + visited.join('\n  - '));
    console.log('CLICKED ('+clicked.length+'):\n  - ' + clicked.join('\n  - '));
    console.log('SKIPPED-DESTRUCTIVE ('+skipped.length+'):\n  - ' + skipped.join('\n  - '));

    expect(consoleErrors, 'console errors during crawl: ' + JSON.stringify(consoleErrors, null, 2)).toEqual([]);
    expect(networkErrors, 'HTTP 5xx during crawl: ' + JSON.stringify(networkErrors, null, 2)).toEqual([]);
  });
});
