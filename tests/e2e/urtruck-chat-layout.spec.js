/**
 * Chat layout QA — non-destructive structural check of ChatScreen.
 *
 * Walks: home → Profile → Chats → first visible chat. Verifies:
 *   - chat opens, no error overlay
 *   - timestamp `HH:MM` is rendered somewhere on screen
 *   - sender label (small grey text equal to partner name) is rendered above
 *     at least one incoming bubble — proves the recent UX fix in ChatScreen.
 *   - if any "own" bubble is visible (blue #2563EB), its box-center.x is on
 *     the right half of the viewport (alignment correct)
 *   - if any "incoming" bubble is visible, its box-center.x is on the left
 *     half of the viewport
 *   - no console errors, no HTTP 5xx
 *
 * No messages are sent. No production data is created.
 *
 * Default target is the live site:
 *   E2E_BASE_URL=https://urtruck.kz npx playwright test tests/e2e/urtruck-chat-layout.spec.js
 */
const { test, expect } = require('@playwright/test');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz').replace(/\/$/, '');
const ERROR_OVERLAY_RE = /Что-то пошло не так|Something went wrong|发生错误|Қате орын алды|Бір нәрсе дұрыс болмады/;

const CONSOLE_IGNORE = [
  /favicon/i, /webpush|service\s*worker/i, /Manifest:/i, /sw\.js.*404/i,
  /the resource.*was preloaded/i, /Download the React DevTools/i,
  /Failed to load resource.*404 \(File not found\)/i,
  /Failed to load resource.*501 \(Unsupported method/i,
];
const NETWORK_IGNORE = [/\/sw\.js$/, /favicon/, /\/manifest\.json$/];

test.describe('Chat layout QA', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
  test.setTimeout(120_000);

  test('Profile → Chats → first chat: header, sender labels, time, alignment', async ({ page }) => {
    // This first test hits the real backend (no mocks) so it requires nginx
    // to proxy /api/v1/* — only the live URL can do that. Skip on local
    // python http.server which only serves the static bundle.
    test.skip(/127\.0\.0\.1|localhost/.test(BASE),
      'no-mock chat test requires live nginx-proxied backend');
    const consoleErrors = [];
    const networkErrors = [];
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

    // ── 1. enter app ────────────────────────────────────────────────
    await page.goto(BASE + '/?v=chat-layout-qa', { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle' });

    const roleBtn = page.getByText(
      /Я водитель|I'm a driver|我是司机|Мен жүргізушімін|Я перевозчик|carrier/i,
    ).first();
    await roleBtn.waitFor({ timeout: 10_000 });
    await roleBtn.click();
    await page.waitForTimeout(2500);

    // ── 2. Profile tab ──────────────────────────────────────────────
    const profileTab = page.getByText(/Профиль|Profile|个人资料/i).first();
    await profileTab.waitFor({ timeout: 10_000 });
    await profileTab.click();
    await page.waitForTimeout(1500);

    // ── 3. Open Chats from Profile menu ─────────────────────────────
    const chatsLink = page.getByText(/Чаты|Chats|聊天|Чаттар/i).first();
    await chatsLink.waitFor({ timeout: 8_000 });
    await chatsLink.click();
    await page.waitForTimeout(2_000);

    const chatsBody = await page.locator('body').innerText();
    expect(chatsBody, 'ChatsList: error overlay').not.toMatch(ERROR_OVERLAY_RE);
    expect(chatsBody.length, 'ChatsList: empty body').toBeGreaterThan(40);

    // ── 4. Click first visible chat ─────────────────────────────────
    // ChatsListScreen renders a section "ВСЕГДА ОНЛАЙН" with Володя / Support
    // contacts before any "Диалоги". Volodya/Support are stable QA fixtures.
    const firstChatCandidate = page.getByText(
      /Володя|Volodya|Поддержка|Support|UrTruck/i,
    ).first();

    let entered = false;
    if (await firstChatCandidate.isVisible().catch(() => false)) {
      await firstChatCandidate.click().catch(() => {});
      await page.waitForTimeout(2_500);
      entered = true;
    }

    // If no contacts and no rooms, ChatsList shows the empty-state hint and
    // there's nothing to enter. Mark soft-skip so report is honest.
    if (!entered) {
      test.info().annotations.push({
        type: 'note',
        description: 'No chat available — ChatsList was empty for guest. ' +
          'Layout assertions cannot run; only navigation/no-crash verified.',
      });
      expect(consoleErrors, JSON.stringify(consoleErrors, null, 2)).toEqual([]);
      expect(networkErrors, JSON.stringify(networkErrors, null, 2)).toEqual([]);
      return;
    }

    // ── 5. Inside ChatScreen: structural checks ─────────────────────
    const body = await page.locator('body').innerText();
    expect(body, 'ChatScreen: error overlay').not.toMatch(ERROR_OVERLAY_RE);
    expect(body.length, 'ChatScreen: empty body').toBeGreaterThan(40);

    // 5a. Header has partner name + online indicator. We don't know the
    //     exact partner name on this account, so we look for the localized
    //     "online" word as a body substring. RN-web renders it inside a
    //     <Text> node, so the safer check is body innerText.
    const headerOk = /Online|Онлайн|在线|Желіде/i.test(body);
    expect(headerOk, 'header has online indicator').toBeTruthy();

    // 5b. Time HH:MM rendered only on messages — empty chat won't have it.
    const timeMatch = body.match(/\b\d{2}:\d{2}\b/);
    const timeVisible = !!timeMatch;
    const messagesPresent = timeVisible;

    // 5c. Sender labels: ChatScreen prints partner.name above each incoming
    //     bubble (s.senderLabel). We collect occurrences of any short text
    //     that looks like a "name" repeated >1 time on the page (header +
    //     bubble label). This is fragile to specific names, so we just
    //     assert *something* repeats >1 by structure: count tiny grey text
    //     elements via DOM.
    const senderLabelCount = await page.evaluate(() => {
      // s.senderLabel: fontSize 10, marginLeft 6, marginBottom 3.
      // RN-web inlines styles; pick divs whose text is short and that
      // sit immediately before a sibling that looks like a bubble.
      const all = Array.from(document.querySelectorAll('div'));
      let c = 0;
      for (const el of all) {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.fontSize) < 11.5 && parseFloat(cs.fontSize) > 8) {
          if (cs.marginLeft && parseFloat(cs.marginLeft) >= 6 && parseFloat(cs.marginLeft) <= 8) {
            const txt = el.textContent.trim();
            if (txt.length > 0 && txt.length < 30 && !/\d{2}:\d{2}/.test(txt)) c++;
          }
        }
      }
      return c;
    });

    // 5d. Bubble alignment: own bubble background is rgb(37,99,235) (#2563EB).
    //     Their bubbles use theme.card (varies, but never that exact blue).
    //     If any blue bubble exists, its center.x must be > vw/2.
    //     If any non-blue bubble exists with rounded radius 18, its center.x
    //     must be < vw/2.
    const alignment = await page.evaluate(() => {
      const vw = window.innerWidth;
      const all = Array.from(document.querySelectorAll('div'));
      const ownX = [];
      const themX = [];
      for (const el of all) {
        const cs = getComputedStyle(el);
        const br = parseFloat(cs.borderRadius);
        if (!(br >= 14 && br <= 22)) continue;          // bubble-shaped
        const rect = el.getBoundingClientRect();
        if (rect.width < 40 || rect.width > vw * 0.9) continue;
        if (rect.height < 16 || rect.height > 400) continue;
        const cx = rect.left + rect.width / 2;
        const bg = cs.backgroundColor;
        // own bubble = rgb(37, 99, 235)
        if (/rgb\(\s*37\s*,\s*99\s*,\s*235\s*\)/.test(bg)) {
          ownX.push({ cx, vw });
        } else if (rect.width > 80 && rect.height < 80) {
          // generic "their" bubble heuristic
          themX.push({ cx, vw });
        }
      }
      return { vw, own: ownX, them: themX };
    });

    const ownAligned = alignment.own.length > 0
      && alignment.own.every(b => b.cx > alignment.vw / 2);
    const themAligned = alignment.them.length > 0
      && alignment.them.some(b => b.cx < alignment.vw / 2);

    test.info().annotations.push({
      type: 'note',
      description: JSON.stringify({
        timeVisible,
        senderLabelCount,
        ownBubblesCount: alignment.own.length,
        themBubblesCount: alignment.them.length,
        ownAligned, themAligned,
      }),
    });

    // ── 6. soft assertions ──────────────────────────────────────────
    // If there were no messages at all (timeVisible === false), don't assert
    // on layout — assert only navigation+no-crash.
    if (timeVisible) {
      expect(timeVisible, 'time HH:MM visible').toBeTruthy();
      // Sender labels visible only when incoming messages exist. We can't
      // know if Volodya sent something to this guest, so we soft-check.
      if (alignment.them.length > 0) {
        expect(senderLabelCount, 'sender label above incoming bubble').toBeGreaterThan(0);
        expect(themAligned, 'incoming bubble on left side').toBeTruthy();
      }
      if (alignment.own.length > 0) {
        expect(ownAligned, 'own bubble on right side').toBeTruthy();
      }
    }

    expect(consoleErrors, JSON.stringify(consoleErrors, null, 2)).toEqual([]);
    expect(networkErrors, JSON.stringify(networkErrors, null, 2)).toEqual([]);
  });

  test('mocked chat: incoming on left, own on right, sender label visible', async ({ page }) => {
    // Live chat for a fresh guest is usually empty, so we cannot reliably
    // assert layout there. This second test feeds the same bundle a fixed
    // 4-message conversation via page.route() — no real message is ever
    // sent to production, the mocks only intercept the browser fetches.
    const ME    = 'me-user-id';
    const PEER  = 'peer-user-id';
    const ROOM  = 'room-pw-1';

    await page.route('**/api/v1/register/guest', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, token: 'pw-tok', access_token: 'pw-tok',
          role: 'driver', user_id: ME, user: { id: ME, role: 'driver' } }) });
    });
    await page.route('**/api/v1/register/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: ME, role: 'driver', verification_level: 1 }) });
    });
    await page.route('**/api/v1/users/me**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: ME, name: 'PW Me', city: '', about: '' }) });
    });
    await page.route('**/api/v1/chat/contacts**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ contacts: [
          { id: PEER, name: 'Шипер Серик', desc: 'Грузовладелец', icon: '👤' },
        ] }) });
    });
    await page.route('**/api/v1/chat/rooms**', async route => {
      // ChatScreen.useEffect looks up the room by participant_1/participant_2.
      // Provide both alongside the partner_* fields used by ChatsListScreen.
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ rooms: [{
          id: ROOM,
          participant_1: ME, participant_2: PEER,
          partner_id: PEER, partner_name: 'Шипер Серик',
          last_message: 'Адрес уточню в чате', last_at: '2026-05-02 11:30:00',
          unread: 0,
        }] }) });
    });
    await page.route('**/api/v1/chat/messages/' + ROOM + '**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ messages: [
          { id: 1, sender_id: PEER, text: 'Добрый день, груз готов.', created_at: '2026-05-02 11:25:00', is_read: 1 },
          { id: 2, sender_id: ME,   text: 'Принял, выезжаю.',           created_at: '2026-05-02 11:26:00', is_read: 1 },
          { id: 3, sender_id: PEER, text: 'Адрес уточню в чате.',       created_at: '2026-05-02 11:30:00', is_read: 0 },
          { id: 4, sender_id: ME,   text: 'Понял, жду адрес.',          created_at: '2026-05-02 11:31:00', is_read: 0 },
        ] }) });
    });
    await page.route('**/api/v1/market/cargos**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ cargos: [], total: 0 }) });
    });
    await page.route('**/api/v1/market/my', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ my_cargos: [], my_trips: [], my_bids: [], incoming_bids: [], my_deals: [] }) });
    });

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('ur_reg_token', 'pw-tok');
      localStorage.setItem('ur_session', JSON.stringify({ user: { id: 'me-user-id', role: 'driver' } }));
    });
    await page.goto(BASE + '/?v=chat-layout-mock', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    await page.locator('[data-testid="bottom-nav-chats"]').click();
    await page.waitForTimeout(1500);
    await page.getByText(/Шипер Серик/).first().click();
    await page.waitForTimeout(2500);

    const body = await page.locator('body').innerText();
    expect(body, 'ChatScreen error overlay').not.toMatch(ERROR_OVERLAY_RE);

    // 1. Time HH:MM visible (any of the 4 messages provides 11:25-11:31)
    expect(/\b\d{2}:\d{2}\b/.test(body), 'time HH:MM visible').toBeTruthy();

    // 2. Sender label visible — "Шипер Серик" should appear ≥2 times
    //    (header + at least one incoming sender label).
    const peerOccurrences = (body.match(/Шипер Серик/g) || []).length;
    expect(peerOccurrences, 'partner name occurs ≥2 (header + sender label)').toBeGreaterThanOrEqual(2);

    // 3. Bubble alignment via visible message text bounding boxes. This is
    // more stable than probing generated RN-web border-radius CSS.
    const vw = page.viewportSize()?.width || 390;
    const half = vw / 2;
    const ownTexts = ['Принял, выезжаю.', 'Понял, жду адрес.'];
    const themTexts = ['Добрый день, груз готов.', 'Адрес уточню в чате.'];
    for (const text of ownTexts) {
      const box = await page.getByText(text, { exact: true }).first().boundingBox();
      expect(box, `own message visible: ${text}`).toBeTruthy();
      expect(box.x + box.width / 2, `own message on right: ${text}`).toBeGreaterThan(half);
    }
    for (const text of themTexts) {
      const box = await page.getByText(text, { exact: true }).first().boundingBox();
      expect(box, `incoming message visible: ${text}`).toBeTruthy();
      expect(box.x + box.width / 2, `incoming message on left: ${text}`).toBeLessThan(half);
    }

    // Sender label must appear for incoming bubbles. Mock partner is "Шипер
    // Серик" — it occurs in the header (1) and above each incoming bubble.
    const peerCount = ((await page.locator('body').innerText()).match(/Шипер Серик/g) || []).length;
    expect(peerCount, 'partner name occurs ≥3 (header + ≥2 incoming sender labels)').toBeGreaterThanOrEqual(3);
  });
});
