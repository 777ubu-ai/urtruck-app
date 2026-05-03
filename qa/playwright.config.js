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

module.exports = defineConfig({
  testDir: AGENTS_DIR,
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: require.resolve('./utils/qaGlobalSetup.js'),
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
  },
  // Order matters: serik publishes a route → boris responds → auditor audits.
  // trip-clicks runs standalone: it doesn't depend on QA state and is the
  // first thing the operator typically wants to see when a "white screen"
  // bug is reported in the field.
  projects: [
    { name: 'serik',       testMatch: /serik\.driver\.spec\.js$/ },
    { name: 'boris',       testMatch: /boris\.shipper\.spec\.js$/, dependencies: ['serik'] },
    { name: 'trip-clicks', testMatch: /trip\.detail\.clicks\.spec\.js$/ },
    { name: 'auditor',     testMatch: /auditor\.full\.spec\.js$/,  dependencies: ['serik', 'boris', 'trip-clicks'] },
  ],
});
