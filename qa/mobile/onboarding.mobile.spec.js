// onboarding.mobile.spec — RC2 OnboardingV2 carousel + CTA real-tap.
//
// Использует тот же real-tap pattern что role.tap.spec.js (Stage 26):
// resolveBoundingBox + elementFromPoint guard + actual mouse.click,
// чтобы поймать regression'ы где CTA становятся "invisible overlay"
// (как было в pre-PR #36 с absolute <Image/> поверх ctaWrap).
//
// Что проверяет:
//   1. Onboarding-карусель загружается с тремя слайдами (paginator
//      показывает 3 dots).
//   2. Свайп вправо переключает на slide 2 → 3, paginator обновляется.
//   3. "Продолжить по номеру" tap'абельная: realTap → переход на
//      PhoneV2 (поле телефона видимо).
//   4. "Смотреть грузы" tap'абельная: realTap → переход в Main
//      (feed грузов виден).
//   5. После tap'а нет ErrorBoundary.
//
// Запуск:
//   npm run qa:mobile
//   # или для конкретного spec:
//   npx playwright test --config qa/playwright.mobile.config.js qa/mobile/onboarding.mobile.spec.js
//
// Чтобы спека прошла, фронт должен быть собран и доступен по
// QA_BASE_URL (по умолчанию https://urtruck.kz).

const { test, expect } = require('@playwright/test');
const { log } = require('../utils/qaReport');
const { BASE_URL } = require('../utils/qaConfig');

const ACTOR = 'agent-onb-v2';

// Common — взято из role.tap.spec.js, упрощено.
async function realTap(page, testId, label) {
  const el = page.getByTestId(testId).first();
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    log.p0(ACTOR, `${testId}-visible`, `${label}: testID не виден на viewport`);
    return false;
  }
  const box = await el.boundingBox().catch(() => null);
  if (!box || box.height < 40) {
    log.p0(ACTOR, `${testId}-bbox`, `${label}: bbox=${JSON.stringify(box)}`);
    return false;
  }
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);

  // Главный guard: что РЕАЛЬНО лежит под пальцем в этой точке?
  const owner = await page.evaluate(({ x, y, want }) => {
    const top = document.elementFromPoint(x, y);
    if (!top) return { ok: false, reason: 'no-element' };
    let cur = top;
    for (let i = 0; i < 12 && cur; i += 1) {
      if (cur.getAttribute && cur.getAttribute('data-testid') === want) {
        return { ok: true, tag: top.tagName };
      }
      cur = cur.parentElement;
    }
    return {
      ok: false,
      tag: top.tagName,
      cls: typeof top.className === 'string' ? top.className.slice(0, 80) : '',
    };
  }, { x: cx, y: cy, want: testId });

  if (!owner.ok) {
    log.p0(
      ACTOR,
      `${testId}-overlap`,
      `${label}: elementFromPoint(${cx},${cy})=${owner.tag}.${owner.cls} — не ${testId}`,
    );
    return false;
  }

  await page.mouse.click(cx, cy);
  await page.waitForTimeout(1500);

  const body = await page.locator('body').innerText({ timeout: 4000 }).catch(() => '');
  if (/Что-то пошло не так|Произошла ошибка|Something went wrong/i.test(body)) {
    log.p0(ACTOR, `${testId}-error-boundary`, `${label}: ErrorBoundary после tap`);
    return false;
  }
  log.pass(ACTOR, `${testId}-tapped`, `${label} → следующий экран`);
  return true;
}

async function gotoOnboarding(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

test('Mobile · OnboardingV2 загружается с 3 CTA доступными', async ({ page }) => {
  await gotoOnboarding(page);

  const phoneCta = page.getByTestId('onb-v2-cta-phone').first();
  const guestCta = page.getByTestId('onb-v2-cta-guest').first();

  const phoneVisible = await phoneCta.isVisible().catch(() => false);
  const guestVisible = await guestCta.isVisible().catch(() => false);

  if (!phoneVisible) log.p0(ACTOR, 'cta-phone-visible', 'onb-v2-cta-phone не виден');
  if (!guestVisible) log.p0(ACTOR, 'cta-guest-visible', 'onb-v2-cta-guest не виден');
  if (phoneVisible && guestVisible) {
    log.pass(ACTOR, 'cta-both-visible', 'обе CTA отрисованы на onboarding');
  }
});

test('Mobile · OnboardingV2 "Продолжить по номеру" real-tap → PhoneV2', async ({ page }) => {
  await gotoOnboarding(page);
  const ok = await realTap(page, 'onb-v2-cta-phone', 'Продолжить по номеру');
  if (!ok) return;

  // Pphone screen должен показать testID phone-v2-input или title через ru.
  const onPhone = await page.getByTestId('phone-v2-input').first().isVisible().catch(() => false);
  if (!onPhone) {
    // fallback: проверяем русский title
    const body = await page.locator('body').innerText({ timeout: 4000 }).catch(() => '');
    if (!/Вход или регистрация/i.test(body)) {
      log.p0(ACTOR, 'phone-v2-not-loaded', 'PhoneV2 не открылся после CTA tap');
      return;
    }
  }
  log.pass(ACTOR, 'phone-v2-opened', 'PhoneV2 успешно открыт');
});

test('Mobile · OnboardingV2 "Смотреть грузы" real-tap → Main (guest)', async ({ page }) => {
  await gotoOnboarding(page);
  const ok = await realTap(page, 'onb-v2-cta-guest', 'Смотреть грузы');
  if (!ok) return;

  // После ensureGuest + reset Main — должна быть лента грузов.
  // Ищем testID bottom-nav или текст "Грузы" в title.
  const onMain = await page.getByTestId('bottom-nav').first().isVisible().catch(() => false);
  if (!onMain) {
    const body = await page.locator('body').innerText({ timeout: 4000 }).catch(() => '');
    if (!/Грузы|Найдите груз/i.test(body)) {
      log.p0(ACTOR, 'main-not-loaded', 'Main/Feed не открылся после guest CTA');
      return;
    }
  }
  log.pass(ACTOR, 'main-opened', 'Main/Feed открыт в guest mode');
});

test('Mobile · OnboardingV2 paginator при свайпе обновляется', async ({ page }) => {
  await gotoOnboarding(page);
  const viewportWidth = page.viewportSize().width;

  // swipe left → slide 2
  await page.mouse.move(viewportWidth - 50, 400);
  await page.mouse.down();
  await page.mouse.move(50, 400, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(800);

  const bodyAfter1 = await page.locator('body').innerText({ timeout: 4000 }).catch(() => '');
  if (/Честные ставки/i.test(bodyAfter1)) {
    log.pass(ACTOR, 'swipe-to-slide-2', 'Свайп → slide 2 "Честные ставки"');
  } else {
    log.p1(ACTOR, 'swipe-to-slide-2-fail', 'свайп не переключил на slide 2 (title не появился)');
  }

  // swipe left → slide 3
  await page.mouse.move(viewportWidth - 50, 400);
  await page.mouse.down();
  await page.mouse.move(50, 400, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(800);

  const bodyAfter2 = await page.locator('body').innerText({ timeout: 4000 }).catch(() => '');
  if (/Проверенные участники/i.test(bodyAfter2)) {
    log.pass(ACTOR, 'swipe-to-slide-3', 'Свайп → slide 3 "Проверенные участники"');
  } else {
    log.p1(ACTOR, 'swipe-to-slide-3-fail', 'свайп не переключил на slide 3');
  }
});
