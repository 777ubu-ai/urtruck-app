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
  projects: [
    { name: 'serik',   testMatch: /serik\.driver\.spec\.js$/ },
    { name: 'boris',   testMatch: /boris\.shipper\.spec\.js$/, dependencies: ['serik'] },
    { name: 'auditor', testMatch: /auditor\.full\.spec\.js$/,  dependencies: ['serik', 'boris'] },
  ],
});
