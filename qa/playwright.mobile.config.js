// Stage 14: dedicated Playwright config for the mobile QA lane.
//
// Why a separate config from qa/playwright.config.js:
//   - the existing config runs at 1440×900 (desktop) and is wired
//     for the actor + auditor sequence that needs all desktop
//     projects to finish first;
//   - mobile checks are layout-sensitive and need their own
//     viewport / userAgent / device-scale-factor settings;
//   - we don't want a slow-network mobile run to gate the desktop
//     post-deploy QA cycle (and vice versa).
//
// Two device profiles:
//   * mobile-chrome  — Pixel 7 metrics (412×915, dsr=2.625).
//   * mobile-safari  — iPhone 13 metrics (390×844, dsr=3) + the
//     real Safari user-agent so any UA-sniffed code path runs.
//
// All five mobile spec files live under qa/mobile/. Specs are
// independent — no inter-spec state — so projects can run in
// parallel; we still keep workers=1 to mirror desktop QA reports
// and keep network usage conservative.

const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const SPECS_DIR = path.resolve(__dirname, 'mobile');

const baseUse = {
  ignoreHTTPSErrors: true,
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
  trace: 'retain-on-failure',
  locale: 'ru-RU',
  timezoneId: 'Asia/Almaty',
};

module.exports = defineConfig({
  testDir: SPECS_DIR,
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: require.resolve('./utils/qaGlobalSetup.js'),
  use: baseUse,
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'], ...baseUse },
    },
    {
      // We force browserName: 'chromium' here because the Apple
      // WebKit engine binaries fail to download on some operator
      // dev machines (no public mirror in CN/Asia and the official
      // CDN occasionally 503s). For our purposes the value of this
      // project is the iPhone-13 viewport / DPR / userAgent — the
      // engine is secondary, layout maths matches at 390×844 on
      // either backend.
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'], browserName: 'chromium', ...baseUse },
    },
  ],
});
