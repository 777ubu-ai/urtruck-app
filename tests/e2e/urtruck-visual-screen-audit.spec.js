/**
 * Visual screen audit — opens the deployed app, walks through every important
 * screen, takes a screenshot, and reports issues. Does NOT submit forms or
 * trigger destructive actions.
 *
 *   E2E_BASE_URL=https://urtruck.kz \
 *     npx playwright test tests/e2e/urtruck-visual-screen-audit.spec.js
 *
 * Screenshots → test-results/visual-audit/
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz').replace(/\/$/, '');
const SHOTS_DIR = path.resolve(__dirname, '..', '..', 'test-results', 'visual-audit');
const ERROR_OVERLAY_RE = /Что-то пошло не так|Something went wrong|发生错误|Қате орын алды|Бір нәрсе дұрыс болмады/;

const CONSOLE_IGNORE = [
  /favicon/i, /webpush|service\s*worker/i, /Manifest:/i, /sw\.js.*404/i,
  /the resource.*was preloaded/i, /Download the React DevTools/i,
  /Failed to load resource.*404 \(File not found\)/i,
  /Failed to load resource.*501 \(Unsupported method/i,
  /401 \(Unauthorized\)/i, /403 \(Forbidden\)/i,
  // 429 = our own test bursts hitting nginx rate limit; not a product bug.
  /429 \(Too Many Requests\)/i,
];
const NETWORK_IGNORE = [/\/sw\.js$/, /favicon/, /\/manifest\.json$/];

const visited = [];
const issues = [];
const screenshots = [];

async function shoot(page, name, label) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const file = path.join(SHOTS_DIR, name);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  screenshots.push(name);
  visited.push(label || name);
  // Quick health check after every shot.
  const body = await page.locator('body').innerText().catch(() => '');
  if (ERROR_OVERLAY_RE.test(body)) {
    issues.push(`ErrorBoundary on ${label || name}`);
  }
  if (body.length < 30) {
    issues.push(`Empty body on ${label || name} (len=${body.length})`);
  }
}

async function safeClick(page, locator, { wait = 1500 } = {}) {
  if (!(await locator.isVisible().catch(() => false))) return false;
  await locator.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(wait);
  return true;
}

async function back(page) {
  const b = page.getByText(/^‹$/).first();
  if (await b.isVisible().catch(() => false)) {
    await b.click().catch(() => {});
    await page.waitForTimeout(900);
    return true;
  }
  await page.goBack().catch(() => {});
  await page.waitForTimeout(900);
  return false;
}

test.describe('Visual screen audit', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
  test.setTimeout(240_000);

  test('walks 13 screens, screenshots, surfaces visual/UX issues', async ({ page }) => {
    const consoleErrors = [];
    const networkErrors = [];
    const stacks = [];
    page.on('pageerror', err => stacks.push(`${err.name}: ${err.message}`));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (CONSOLE_IGNORE.some(rx => rx.test(t))) return;
      consoleErrors.push(t);
    });
    page.on('response', r => {
      if (r.status() < 500) return;
      if (NETWORK_IGNORE.some(rx => rx.test(r.url()))) return;
      if (r.status() === 501) return;
      networkErrors.push(`${r.status()} ${r.url()}`);
    });

    // ── 01. Splash / RoleScreen / Onboarding ────────────────────────
    await page.goto(BASE + '/?v=visual-audit', { waitUntil: 'networkidle' });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shoot(page, '01-role-or-feed.png', 'RoleScreen / Splash');

    // ── 02. Enter driver → Feed ─────────────────────────────────────
    const roleBtn = page.getByText(
      /Я водитель|I'm a driver|我是司机|Мен жүргізушімін|Я перевозчик|carrier/i,
    ).first();
    if (await roleBtn.isVisible().catch(() => false)) {
      await roleBtn.click();
      await page.waitForTimeout(2500);
    }
    await shoot(page, '02-feed-driver.png', 'Feed (driver)');

    // ── 03. First cargo/card detail ─────────────────────────────────
    const respondLink = page.getByText(/Откликнуться|Respond|出价|Жауап беру|Подробнее|Details|详情|Толығырақ/i).first();
    let openedDetail = false;
    if (await respondLink.isVisible().catch(() => false)) {
      await respondLink.click().catch(() => {});
      await page.waitForTimeout(2500);
      openedDetail = true;
    }
    await shoot(page, '03-cargo-detail.png', openedDetail ? 'CargoDetail/DriverDetail' : 'Feed (no card)');
    if (openedDetail) await back(page);

    // ── 04. Filter modal ────────────────────────────────────────────
    const filterBtn = page.locator('button').filter({ hasText: '⚙' }).first();
    if (await filterBtn.isVisible().catch(() => false)) {
      await filterBtn.click();
      await page.waitForTimeout(900);
    }
    await shoot(page, '04-filter-modal.png', 'Filter modal');
    // Close modal if open (click outside / Escape)
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(700);

    // ── 05. Publish route form (driver) ─────────────────────────────
    // FeedScreen has FAB "Опубликовать маршрут" / "Publish trip" for driver.
    const publishBtn = page.getByText(/Опубликовать маршрут|Publish trip|发布行程|Маршрут жариялау/i).first();
    let routeFormVisible = false;
    let routeFormFields = {};
    let routePublishCrashed = false;
    if (await publishBtn.isVisible().catch(() => false)) {
      const beforeBody = await page.locator('body').innerText().catch(() => '');
      await publishBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
      const afterBody = await page.locator('body').innerText().catch(() => '');
      if (ERROR_OVERLAY_RE.test(afterBody)) {
        routePublishCrashed = true;
        issues.push('Publish-route click → ErrorBoundary');
      } else {
        routeFormVisible = true;
        routeFormFields = {
          from: /Откуда|From|出发|Қайдан/i.test(afterBody),
          to: /Куда|To|到|Қайда/i.test(afterBody),
          transit: /Через|via|经停|арқылы/i.test(afterBody),
          dates: /Дата|Date|日期|Күн|Доступен с/i.test(afterBody),
          truckType: /Тип кузова|Body type|车型|Шанақ түрі|Тент|Реф/i.test(afterBody),
          price: /Цена|Price|价格|Баға/i.test(afterBody),
        };
        if (!routeFormFields.price) {
          issues.push('Publish-route form has NO price field — cards will render "Договорная"');
        }
      }
    } else {
      issues.push('Publish-route CTA not visible on driver feed');
    }
    await shoot(page, '05-publish-route-form.png', 'Publish route form');
    // Close modal: tap backdrop (above the bottom-sheet, near the top of the
    // viewport). Avoid back() which here uses the underlying Feed header `‹`
    // button and unwinds navigation to RoleScreen, breaking the rest of the
    // crawl with empty bodies.
    if (routeFormVisible) {
      await page.mouse.click(720, 60).catch(() => {});
      await page.waitForTimeout(800);
      // If still open (no close-on-backdrop), press the close affordance ✕ if any.
      const closeX = page.getByText(/^✕$|^×$/).first();
      if (await closeX.isVisible().catch(() => false)) {
        await closeX.click().catch(() => {});
        await page.waitForTimeout(600);
      }
    }

    // ── 06. My Work — landing tab ───────────────────────────────────
    const myWorkTab = page.getByText(/Моя работа|My work|我的工作|Менің жұмысым/i).first();
    if (await safeClick(page, myWorkTab, { wait: 1500 })) {
      // The featured "Мои рейсы / Мои грузы" card might also navigate further.
      const featured = page.locator(
        'text=/Мои рейсы|Мои грузы|My trips|My cargos|我的线路|我的货物|Менің рейстерім|Менің жүктерім/i',
      ).first();
      if (await featured.isVisible().catch(() => false)) {
        await featured.click().catch(() => {});
        await page.waitForTimeout(1300);
      }
    }
    await shoot(page, '06-my-work-trips.png', 'My Work — my-tab');

    // ── 07. My bids tab ─────────────────────────────────────────────
    const bidsTab = page.locator('[testid="my-work-tab-bids"], [data-testid="my-work-tab-bids"]').first();
    if (!(await safeClick(page, bidsTab, { wait: 1300 }))) {
      const fallback = page.getByText(/Мои ставки|My bids|Отклики|Responses|我的报价|Менің ұсыныстарым|Жауаптар/i).first();
      await safeClick(page, fallback, { wait: 1300 });
    }
    await shoot(page, '07-my-work-bids.png', 'My Work — bids');

    // ── 08. Orders tab ──────────────────────────────────────────────
    const ordersTab = page.locator('[testid="my-work-tab-orders"], [data-testid="my-work-tab-orders"]').first();
    if (!(await safeClick(page, ordersTab, { wait: 1300 }))) {
      const fallback = page.getByText(/Заказы|Orders|订单|Тапсырыстар/i).first();
      await safeClick(page, fallback, { wait: 1300 });
    }
    await shoot(page, '08-my-work-orders.png', 'My Work — orders');

    // ── go back to MainTabs ────────────────────────────────────────
    await back(page);

    // ── 09. Profile ─────────────────────────────────────────────────
    const profileTab = page.getByText(/Профиль|Profile|个人资料/i).first();
    if (await safeClick(page, profileTab, { wait: 1500 })) {
      visited.push('Profile');
    }
    await shoot(page, '09-profile.png', 'Profile');

    // ── 10. Chats list ──────────────────────────────────────────────
    const chatsLink = page.getByText(/Чаты|Chats|聊天|Чаттар/i).first();
    if (await safeClick(page, chatsLink, { wait: 1500 })) {
      visited.push('ChatsList');
    } else {
      issues.push('Chats link not visible from Profile');
    }
    await shoot(page, '10-chats-list.png', 'ChatsList');

    // ── 11. First chat ──────────────────────────────────────────────
    const firstChat = page.getByText(/Володя|Volodya|Поддержка|Support|UrTruck/i).first();
    if (await safeClick(page, firstChat, { wait: 2000 })) {
      visited.push('ChatScreen');
    } else {
      issues.push('No chat available to open');
    }
    await shoot(page, '11-chat-screen.png', 'ChatScreen');
    await back(page);
    await back(page);

    // back to Profile
    if (await safeClick(page, profileTab, { wait: 1200 })) {/* ok */}

    // ── 12. Reviews ─────────────────────────────────────────────────
    const reviewsLink = page.getByText(/Мои отзывы|My reviews|All reviews|评价|Менің пікірлерім/i).first();
    if (await safeClick(page, reviewsLink, { wait: 1500 })) {
      visited.push('Reviews');
    } else {
      issues.push('Reviews link not visible from Profile (may need scroll on driver-mode profile)');
    }
    await shoot(page, '12-reviews.png', 'Reviews');
    await back(page);

    if (await safeClick(page, profileTab, { wait: 1000 })) {/* ok */}

    // ── 13. Edit profile ────────────────────────────────────────────
    const editLink = page.getByText(/Редактировать профиль|Edit profile|编辑资料|Профильді өзгерту/i).first();
    if (await safeClick(page, editLink, { wait: 1500 })) {
      visited.push('EditProfile');
    } else {
      issues.push('Edit profile link not visible from Profile');
    }
    await shoot(page, '13-edit-profile.png', 'EditProfile');

    // ── REPORT ──────────────────────────────────────────────────────
    console.log('\nVISITED (' + visited.length + '):');
    visited.forEach(v => console.log('  - ' + v));
    console.log('\nSCREENSHOTS:');
    screenshots.forEach(s => console.log('  - ' + path.join(SHOTS_DIR, s)));
    console.log('\nROUTE FORM:');
    console.log('  visible: ' + routeFormVisible);
    console.log('  publish-click crashed: ' + routePublishCrashed);
    console.log('  fields: ' + JSON.stringify(routeFormFields));
    console.log('\nVISUAL/UX ISSUES (' + issues.length + '):');
    issues.forEach(i => console.log('  - ' + i));
    console.log('\nCONSOLE ERRORS (' + consoleErrors.length + '):');
    consoleErrors.forEach(e => console.log('  - ' + e));
    console.log('\nHTTP 5xx (' + networkErrors.length + '):');
    networkErrors.forEach(e => console.log('  - ' + e));
    console.log('\nPAGE-LEVEL JS STACKS (' + stacks.length + '):');
    stacks.forEach(s => console.log('  - ' + s));

    // ── ASSERTIONS ─────────────────────────────────────────────────
    expect(stacks.length, 'page-level JS errors').toBe(0);
    expect(consoleErrors, JSON.stringify(consoleErrors, null, 2)).toEqual([]);
    expect(networkErrors, JSON.stringify(networkErrors, null, 2)).toEqual([]);
    // ErrorBoundary assertion is per-screen via shoot(); fail aggregate if any.
    const eb = issues.filter(i => /ErrorBoundary/.test(i));
    expect(eb, 'ErrorBoundary detected: ' + eb.join(' | ')).toEqual([]);
  });
});
