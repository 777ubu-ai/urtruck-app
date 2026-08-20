// runtimeLocaleLeakProbe — runtime proof of the Issue #254 P0 locale rule.
//
// Static scans prove the translation tables are clean; they cannot prove what
// the running app renders. This drives the real web bundle, forces each
// language via localStorage `ur_lang`, walks a few surfaces, and reads the
// actual visible text out of the DOM.
//
// Rule under test (Issue #254):
//   selected ZH => system UI ZH, selected EN => system UI EN, selected KK =>
//   system UI KK, with no Russian fallback leakage.
//
// ZH/EN are asserted strictly: any Cyrillic in rendered chrome is a failure.
// KK legitimately uses Cyrillic, so it is asserted positively instead — the
// UI must contain known Kazakh-only markers and must not contain the
// Russian-only spellings of the same strings.
//
// Usage: node qa/utils/runtimeLocaleLeakProbe.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const CYRILLIC = /[А-Яа-яЁё]/;

// Routes reachable without auth that render app chrome.
const ROUTES = ['/', '/?screen=role'];

// Russian-only spellings that must never appear when KK is selected. These are
// RU values whose KK translations are spelled differently.
const RU_ONLY_IN_KK = ['Найти груз', 'Расстояние', 'Срок доставки', 'Продолжить'];
// Kazakh-only markers that should appear somewhere in KK chrome.
const KK_MARKERS = ['Жүк', 'Көлік', 'Тіркелу', 'Жалғастыру', 'Кіру', 'Рөл'];

async function textFor(page, lang, route) {
  await page.addInitScript((l) => {
    try { window.localStorage.setItem('ur_lang', l); } catch { /* ignore */ }
  }, lang);
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    // Visible rendered text only; skip <script>/<style>.
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const out = [];
    let n;
    while ((n = walk.nextNode())) {
      const p = n.parentElement;
      if (!p) continue;
      const tag = p.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
      const cs = window.getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const s = (n.textContent || '').trim();
      if (s) out.push(s);
    }
    return out.join(' | ');
  });
}

const failures = [];
const browser = await chromium.launch();

for (const lang of ['RU', 'EN', 'ZH', 'KK']) {
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    let text = '';
    try {
      text = await textFor(page, lang, route);
    } catch (e) {
      failures.push(`${lang} ${route}: navigation failed: ${e.message.split('\n')[0]}`);
      await ctx.close();
      continue;
    }
    const sample = text.slice(0, 160).replace(/\s+/g, ' ');
    if (lang === 'EN' || lang === 'ZH') {
      const hits = [...new Set((text.match(/[А-Яа-яЁё][А-Яа-яЁё\s-]{2,}/g) || []).map((s) => s.trim()))];
      if (hits.length) {
        failures.push(`${lang} ${route}: Cyrillic leaked -> ${hits.slice(0, 8).join(' / ')}`);
      } else {
        console.log(`  OK   ${lang} ${route}  no Cyrillic | ${sample}`);
      }
    } else if (lang === 'KK') {
      const ruLeak = RU_ONLY_IN_KK.filter((s) => text.includes(s));
      const kkSeen = KK_MARKERS.filter((s) => text.includes(s));
      if (ruLeak.length) failures.push(`KK ${route}: Russian-only strings -> ${ruLeak.join(' / ')}`);
      if (!kkSeen.length && text.length > 40) {
        failures.push(`KK ${route}: no Kazakh marker found | ${sample}`);
      }
      if (!ruLeak.length && kkSeen.length) {
        console.log(`  OK   KK ${route}  kk-markers=${kkSeen.join(',')} | ${sample}`);
      }
    } else {
      if (!CYRILLIC.test(text) && text.length > 40) {
        failures.push(`RU ${route}: expected Russian chrome, found none | ${sample}`);
      } else {
        console.log(`  OK   RU ${route}  Russian present as expected | ${sample}`);
      }
    }
    await ctx.close();
  }
}

await browser.close();

if (failures.length) {
  console.error('\n[runtime-locale] FAIL');
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('\n[runtime-locale] OK — ZH/EN free of Cyrillic, KK Kazakh, RU Russian');
