// Playwright config for the QA agents (qa/agents/*.spec.js).
//
// PR/local QA validates the candidate build. Production smoke is opt-in and
// runs only when QA_INCLUDE_PRODUCTION_SMOKE=1, because a PR must not fail
// simply because public production is still serving the previous main SHA.

const { defineConfig } = require('@playwright/test');
const path = require('path');

const AGENTS_DIR = path.resolve(__dirname, 'agents');
const captureAll = process.env.QA_CAPTURE_ALL === '1';
const includeProductionSmoke = process.env.QA_INCLUDE_PRODUCTION_SMOKE === '1';

const projects = [
  { name: 'bargain',         testMatch: /bargain\.flow\.spec\.js$/ },
  { name: 'serik',           testMatch: /serik\.driver\.spec\.js$/ },
  { name: 'boris',           testMatch: /boris\.shipper\.spec\.js$/, dependencies: ['serik'] },
  { name: 'cargo-currency',  testMatch: /cargo\.currency\.spec\.js$/ },
  { name: 'preview-gate',    testMatch: /preview\.gate\.spec\.js$/ },
  { name: 'ui-smoke',        testMatch: /ui\.smoke\.spec\.js$/ },
  { name: 'onboarding-v2',   testMatch: /onboarding\.v2\.release\.spec\.js$/ },
  ...(includeProductionSmoke ? [
    { name: 'production-smoke', testMatch: /production\.smoke\.spec\.js$/ },
  ] : []),
  { name: 'cargo-desc',      testMatch: /cargo\.description\.spec\.js$/ },
  { name: 'trip-clicks',         testMatch: /trip\.detail\.clicks\.spec\.js$/ },
  { name: 'shipper-trip-crash',  testMatch: /shipper\.trip\.crash\.spec\.js$/ },
  { name: 'auditor',             testMatch: /auditor\.full\.spec\.js$/,
    dependencies: ['serik', 'boris', 'cargo-currency', 'preview-gate', 'ui-smoke', 'trip-clicks', 'shipper-trip-crash'] },
];

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
  projects,
});
