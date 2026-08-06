// Playwright config for the QA agents (qa/agents/*.spec.js).
//
// Why a separate config from the project-root playwright.config.js:
//   - QA runs MUST be sequential (Auditor reads state Serik+Boris wrote).
//   - QA runs against a non-default base URL (production by default; override
//     with QA_BASE_URL=...).
//   - Per-spec project ordering: serik → boris → auditor.

const { defineConfig } = require('@playwright/test');
const path = require('path');

const AGENTS_DIR = path.resolve(__dirname, 'agents');
const captureAll = process.env.QA_CAPTURE_ALL === '1';

module.exports = defineConfig({
  testDir: AGENTS_DIR,
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/desktop', open: 'never' }]],
  globalSetup: require.resolve('./utils/qaGlobalSetup.js'),
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    screenshot: captureAll ? 'on' : 'only-on-failure',
    video: captureAll ? 'on' : 'retain-on-failure',
    trace: captureAll ? 'on-first-retry' : 'retain-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
  },
  projects: [
    { name: 'bargain',         testMatch: /bargain\.flow\.spec\.js$/ },
    { name: 'serik',           testMatch: /serik\.driver\.spec\.js$/ },
    { name: 'boris',           testMatch: /boris\.shipper\.spec\.js$/, dependencies: ['serik'] },
    { name: 'cargo-currency',  testMatch: /cargo\.currency\.spec\.js$/ },
    { name: 'preview-gate',    testMatch: /preview\.gate\.spec\.js$/ },
    { name: 'ui-smoke',        testMatch: /ui\.smoke\.spec\.js$/ },
    { name: 'premium-reg',     testMatch: /premium\.registration\.spec\.js$/ },
    { name: 'premium-login',   testMatch: /premium\.login\.spec\.js$/ },
    { name: 'full-auth',       testMatch: /full\.auth\.regression\.spec\.js$/ },
    { name: 'auth-lock',       testMatch: /auth\.logic\.lock\.spec\.js$/ },
    { name: 'cargo-desc',      testMatch: /cargo\.description\.spec\.js$/ },
    { name: 'visual',          testMatch: /visual\.screenshots\.spec\.js$/ },
    { name: 'guest-mode',      testMatch: /guest\.mode\.spec\.js$/ },
    { name: 'phone-keyboard',  testMatch: /phone\.input\.keyboard\.spec\.js$/ },
    { name: 'role-i18n',       testMatch: /role\.i18n\.spec\.js$/ },
    { name: 'trip-clicks',         testMatch: /trip\.detail\.clicks\.spec\.js$/ },
    { name: 'shipper-trip-crash',  testMatch: /shipper\.trip\.crash\.spec\.js$/ },
    { name: 'auditor',             testMatch: /auditor\.full\.spec\.js$/,
      dependencies: ['serik', 'boris', 'cargo-currency', 'preview-gate', 'ui-smoke', 'trip-clicks', 'shipper-trip-crash'] },
  ],
});
